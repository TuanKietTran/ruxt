// Deno KV -> Cloudflare D1/KV migration. Run with Deno; see docs/data-migration.md.
//
//   deno run -A --unstable-kv scripts/migrate/deno-kv-to-cloudflare.ts export    <kv path|url> <outDir>
//   deno run -A --unstable-kv scripts/migrate/deno-kv-to-cloudflare.ts transform <outDir>
//   deno run -A --unstable-kv scripts/migrate/deno-kv-to-cloudflare.ts verify    <outDir> [--local]
//
// `export` only reads. A remote database needs DENO_KV_ACCESS_TOKEN in the environment.
import { createHash } from "node:crypto";
import { assertClassified, orderIamEntries, ownerDigest, sql, row, type Entry, type Part } from "./logic.ts";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";


const CHUNKS = "__ruxt_chunks__";
const FORMAT = "ruxt-chunked-json-v1";
const CF_CHUNK_BYTES = 24 * 1024;
const CF_MAX_ITEM_BYTES = 8 * 1024 * 1024;
// Nitro storage mounts (nuxt.config.ts `nitro.storage`) -> Workers KV key prefix `<base>:`.
const STORAGE_BASES = ["cv", "cv-pipeline", "analytics"];
// Repository prefixes (infra/deploy/deno/*) -> D1 tables. Index-only prefixes are verified, not copied.
const INDEX_PREFIXES = ["user_email", "iam_sub_org", "plan_public", "plan_user", "sub_user"];
const D1_PREFIXES = ["user", "iam_sub", "iam_subject", "plan", "sub", "cloud_consent", "cloud_consent_event", "user_preferences"];
const BATCH_ROWS = 400;
const KV_BULK_MAX = 9000;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

const encode = (_: string, v: unknown) => {
   if (v instanceof Uint8Array) return { $u8: b64(v) };
   if (typeof v === "bigint") return { $big: v.toString() };
   if (v instanceof Date) return { $date: v.toISOString() };
   return v;
};
const decode = (_: string, v: unknown) => {
   const tagged = v as { $u8?: string; $big?: string; $date?: string } | null;
   if (tagged && typeof tagged === "object") {
      if (typeof tagged.$u8 === "string") return unb64(tagged.$u8);
      if (typeof tagged.$big === "string") return BigInt(tagged.$big);
      if (typeof tagged.$date === "string") return new Date(tagged.$date);
   }
   return v;
};

function readEntries(outDir: string): Entry[] {
   return readFileSync(join(outDir, "export.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line, decode));
}

// ---------------------------------------------------------------- export
async function exportKv(target: string, outDir: string) {
   mkdirSync(outDir, { recursive: true, mode: 0o700 });
   const kv = await (globalThis as any).Deno.openKv(target);
   const lines: string[] = [];
   for await (const entry of kv.list({ prefix: [] }, { batchSize: 500 })) {
      lines.push(JSON.stringify({ key: entry.key, value: entry.value, versionstamp: entry.versionstamp }, encode));
   }
   kv.close();
   writeFileSync(join(outDir, "export.jsonl"), lines.join("\n") + "\n", { mode: 0o600 });
   console.log(`exported ${lines.length} entries to ${join(outDir, "export.jsonl")} (read-only)`);
}

// ------------------------------------------------------------- transform
function d1Row(prefix: string, key: Part[], v: any): { table: string; owner: string; sql: string } | null {
   switch (prefix) {
      case "user":
         return { table: "users", owner: v.id, sql: row("users", { id: v.id, email: v.email, password_hash: v.passwordHash, created_at: v.createdAt }) };
      case "iam_sub":
      case "iam_subject":
         // Two Deno repos wrote subjects; D1 has one table. `iam_sub` (newer) wins by being emitted last.
         return { table: "iam_subjects", owner: v.userId, sql: row("iam_subjects", { user_id: v.userId, org_id: v.orgId ?? null, tier: v.tier, is_service_account: v.isServiceAccount ? 1 : 0 }) };
      case "plan":
         return { table: "plans", owner: v.createdBy ?? "", sql: row("plans", {
            id: v.id, name: v.name, description: v.description ?? "", amount_minor: v.price.amountMinor, currency: v.price.currency,
            billing_cycle: v.billingCycle, trial_days: v.trialDays ?? null, provider: v.provider ?? "", source: v.source ?? "catalog",
            created_by: v.createdBy ?? null, features: JSON.stringify(v.features ?? []), is_public: v.isPublic ? 1 : 0,
         }) };
      case "sub":
         return { table: "subscriptions", owner: v.userId, sql: row("subscriptions", {
            id: v.id, user_id: v.userId, plan_id: v.planId, status: v.status, started_at: v.startedAt, current_period_start: v.currentPeriodStart,
            current_period_end: v.currentPeriodEnd, trial_ends_at: v.trialEndsAt ?? null, cancelled_at: v.cancelledAt ?? null,
            paused_at: v.pausedAt ?? null, next_interval_plan_id: v.nextIntervalPlanId ?? null,
         }) };
      case "cloud_consent":
         return { table: "cloud_consent_states", owner: v.ownerId, sql: row("cloud_consent_states", { owner_id: v.ownerId, category: v.category, granted: v.granted ? 1 : 0, policy_version: v.policyVersion, changed_at: v.changedAt }) };
      case "cloud_consent_event":
         return { table: "cloud_consent_events", owner: v.ownerId, sql: row("cloud_consent_events", { id: v.id, owner_id: v.ownerId, actor_user_id: v.actorUserId, category: v.category, granted: v.granted ? 1 : 0, policy_version: v.policyVersion, changed_at: v.changedAt }) };
      case "user_preferences":
         return { table: "user_preferences", owner: v.ownerId, sql: row("user_preferences", { owner_id: v.ownerId, preferences: JSON.stringify(v.preferences), updated_at: v.updatedAt }) };
   }
   return null;
}

/** Rebuild logical Nitro storage values (reassembling chunk manifests) and re-emit them in the Workers KV layout. */
function kvRecords(entries: Entry[]) {
   const byKey = new Map(entries.map((e) => [JSON.stringify(e.key, encode), e]));
   const logical: { base: string; name: string; json: string }[] = [];
   const isManifest = (v: any) => v?.$ruxtStorage === FORMAT && typeof v.generation === "string" && Number.isSafeInteger(v.chunks) && Number.isSafeInteger(v.bytes);
   for (const e of entries) {
      const base = String(e.key[0]);
      if (!STORAGE_BASES.includes(base) || e.key[1] === CHUNKS) continue;
      const name = e.key.slice(1).map(String).join(":");
      if (!isManifest(e.value)) { logical.push({ base, name, json: JSON.stringify(e.value) }); continue; }
      const m = e.value as { generation: string; chunks: number; bytes: number };
      const parts: Uint8Array[] = [];
      for (let i = 0; i < m.chunks; i++) {
         const chunk = byKey.get(JSON.stringify([base, CHUNKS, name, m.generation, i], encode))?.value;
         if (!(chunk instanceof Uint8Array)) throw new Error(`missing chunk ${i + 1}/${m.chunks} for ${base}:${name}`);
         parts.push(chunk);
      }
      const bytes = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
      let offset = 0;
      for (const p of parts) { bytes.set(p, offset); offset += p.byteLength; }
      if (bytes.byteLength !== m.bytes) throw new Error(`size mismatch for ${base}:${name}`);
      logical.push({ base, name, json: new TextDecoder().decode(bytes) });
   }
   const out: { key: string; value: string; base64?: boolean }[] = [];
   for (const { base, name, json } of logical) {
      const bytes = new TextEncoder().encode(json);
      if (bytes.byteLength > CF_MAX_ITEM_BYTES) throw new Error(`${base}:${name} exceeds ${CF_MAX_ITEM_BYTES} bytes`);
      const key = `${base}:${name}`;
      if (bytes.byteLength <= CF_CHUNK_BYTES) { out.push({ key, value: json }); continue; }
      const generation = crypto.randomUUID();
      const chunks = Math.ceil(bytes.byteLength / CF_CHUNK_BYTES);
      for (let i = 0; i < chunks; i++) {
         out.push({ key: `${base}:${CHUNKS}:${encodeURIComponent(name)}:${generation}:${i}`, value: b64(bytes.slice(i * CF_CHUNK_BYTES, (i + 1) * CF_CHUNK_BYTES)), base64: true });
      }
      out.push({ key, value: JSON.stringify({ $ruxtStorage: FORMAT, generation, chunks, bytes: bytes.byteLength }) });
   }
   return { out, logical };
}

function transform(outDir: string) {
   const entries = readEntries(outDir);
   const seen = new Map<string, number>();
   const unclassified: string[] = [];
   const d1: Record<string, { table: string; owner: string; sql: string }[]> = {};
   const owners = new Map<string, string[]>();
   const indexIds = new Map<string, Set<string>>();
   // iam_subject first, iam_sub last so the newer repo's row replaces it.
   const ordered = orderIamEntries(entries);
   for (const e of ordered) {
      const prefix = String(e.key[0]);
      seen.set(prefix, (seen.get(prefix) ?? 0) + 1);
      if (STORAGE_BASES.includes(prefix)) continue;
      if (INDEX_PREFIXES.includes(prefix)) {
         (indexIds.get(prefix) ?? indexIds.set(prefix, new Set()).get(prefix)!).add(e.key.slice(1).map(String).join("/"));
         continue;
      }
      if (D1_PREFIXES.includes(prefix)) {
         const r = d1Row(prefix, e.key, e.value);
         if (!r) continue;
         (d1[r.table] ??= []).push(r);
         if (r.owner) (owners.get(r.owner) ?? owners.set(r.owner, []).get(r.owner)!).push(r.sql);
         continue;
      }
      unclassified.push(prefix);
   }
   assertClassified(unclassified, []);

   const files: string[] = [];
   for (const table of Object.keys(d1)) {
      const stmts = d1[table].map((r) => r.sql);
      for (let i = 0; i < stmts.length; i += BATCH_ROWS) {
         const name = `d1-${table}-${String(i / BATCH_ROWS).padStart(3, "0")}.sql`;
         writeFileSync(join(outDir, name), stmts.slice(i, i + BATCH_ROWS).join("\n") + "\n", { mode: 0o600 });
         files.push(name);
      }
   }
   const { out, logical } = kvRecords(entries);
   const kvFiles: string[] = [];
   for (let i = 0; i < out.length; i += KV_BULK_MAX) {
      const name = `kv-bulk-${String(i / KV_BULK_MAX).padStart(3, "0")}.json`;
      writeFileSync(join(outDir, name), JSON.stringify(out.slice(i, i + KV_BULK_MAX)), { mode: 0o600 });
      kvFiles.push(name);
   }
   // Cross-check the Deno secondary indexes against the primaries they should mirror.
   const mismatches: string[] = [];
   const users = new Set(d1.users?.map((r) => r.sql) ?? []);
   const emailIndex = indexIds.get("user_email")?.size ?? 0;
   if (emailIndex !== users.size) mismatches.push(`user_email index has ${emailIndex} entries, users has ${users.size}`);
   const subIndex = indexIds.get("sub_user")?.size ?? 0;
   if (subIndex !== (d1.subscriptions?.length ?? 0)) mismatches.push(`sub_user index has ${subIndex} entries, subscriptions has ${d1.subscriptions?.length ?? 0}`);
   const publicPlans = indexIds.get("plan_public")?.size ?? 0;
   const publicRows = (d1.plans ?? []).filter((r) => r.sql.includes(",1);")).length;
   if (publicPlans !== publicRows) mismatches.push(`plan_public index has ${publicPlans} entries, public plans has ${publicRows}`);

   const counts: Record<string, number> = {};
   const checksums: Record<string, string> = {};
   for (const [table, rows] of Object.entries(d1)) {
      const unique = new Set(rows.map((r) => r.sql));
      counts[table] = unique.size;
      checksums[table] = sha256([...unique].sort().join("\n"));
   }
   const manifest = {
      generatedAt: new Date().toISOString(),
      sourceEntries: entries.length,
      sourcePrefixes: Object.fromEntries(seen),
      d1: { counts, checksums, files, ownerChecksums: ownerDigest(Object.entries(d1).filter(([table]) => ["users", "subscriptions", "cloud_consent_states", "cloud_consent_events", "user_preferences"].includes(table)).flatMap(([table, rows]) => rows.map((r) => ({ owner: r.owner, table, canonical: r.sql })))) },
      kv: { logicalItems: logical.length, physicalKeys: out.length, files: kvFiles, byBase: Object.fromEntries(STORAGE_BASES.map((b) => [b, logical.filter((l) => l.base === b).length])), checksum: sha256(logical.map((l) => `${l.base}:${l.name}:${sha256(l.json)}`).sort().join("\n")) },
      indexMismatches: mismatches,
      notes: ["Deno KV list() does not expose expireIn; expiry cannot be carried over, only unexpired entries exist in the export."],
   };
   writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
   console.log(JSON.stringify({ counts, kv: manifest.kv.byBase, indexMismatches: mismatches }, null, 2));
   if (mismatches.length) { console.error("index mismatches found; review before import"); (globalThis as any).Deno.exit(2); }
}

// ----------------------------------------------------------------- verify
function wrangler(args: string[]) {
   const r = spawnSync("npx", ["wrangler", ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
   if (r.status !== 0) throw new Error(`wrangler ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
   return r.stdout;
}

function dbCanonical(table: string, r: Record<string, any>): { owner: string; canonical: string } {
   switch (table) {
      case "users": return { owner: r.id, canonical: row(table, { id: r.id, email: r.email, password_hash: r.password_hash, created_at: r.created_at }) };
      case "subscriptions": return { owner: r.user_id, canonical: row(table, { id: r.id, user_id: r.user_id, plan_id: r.plan_id, status: r.status, started_at: r.started_at, current_period_start: r.current_period_start, current_period_end: r.current_period_end, trial_ends_at: r.trial_ends_at, cancelled_at: r.cancelled_at, paused_at: r.paused_at, next_interval_plan_id: r.next_interval_plan_id }) };
      case "cloud_consent_states": return { owner: r.owner_id, canonical: row(table, { owner_id: r.owner_id, category: r.category, granted: r.granted, policy_version: r.policy_version, changed_at: r.changed_at }) };
      case "cloud_consent_events": return { owner: r.owner_id, canonical: row(table, { id: r.id, owner_id: r.owner_id, actor_user_id: r.actor_user_id, category: r.category, granted: r.granted, policy_version: r.policy_version, changed_at: r.changed_at }) };
      case "user_preferences": return { owner: r.owner_id, canonical: row(table, { owner_id: r.owner_id, preferences: r.preferences, updated_at: r.updated_at }) };
      default: throw new Error(`unsupported owner digest table: ${table}`);
   }
}

function verify(outDir: string, local: boolean) {
   const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf8"));
   const mode = local ? "--local" : "--remote";
   const problems: string[] = [];
   for (const [table, expected] of Object.entries<number>(manifest.d1.counts)) {
      const json = JSON.parse(wrangler(["d1", "execute", "RUXT_DB", mode, "--json", "--command", `SELECT COUNT(*) AS n FROM ${table}`]));
      const actual = json[0]?.results?.[0]?.n;
      if (actual < expected) problems.push(`${table}: D1 has ${actual}, expected at least ${expected}`);
      else console.log(`${table}: ${actual} rows (expected ${expected}${actual > expected ? ", extra rows were created after export" : ""})`);
   }
   const ownerTables = ["users", "subscriptions", "cloud_consent_states", "cloud_consent_events", "user_preferences"];
   const actualOwnerRows: Array<{ owner: string; table: string; canonical: string }> = [];
   for (const table of ownerTables) {
      const result = JSON.parse(wrangler(["d1", "execute", "RUXT_DB", mode, "--json", "--command", `SELECT * FROM ${table}`]));
      for (const record of result[0]?.results ?? []) {
         const parsed = dbCanonical(table, record);
         actualOwnerRows.push({ ...parsed, table });
      }
   }
   const actualOwnerDigests = ownerDigest(actualOwnerRows);
   for (const [owner, digest] of Object.entries<string>(manifest.d1.ownerChecksums ?? {})) {
      if (actualOwnerDigests[owner] !== digest) problems.push(`D1 owner checksum mismatch: ${owner}`);
   }
   for (const owner of Object.keys(actualOwnerDigests)) {
      if (!(owner in (manifest.d1.ownerChecksums ?? {}))) problems.push(`D1 has unexported owner records: ${owner}`);
   }
   // `wrangler kv key list` walks every page itself and prints one JSON array; it has no --json or --cursor flag.
   const keys: string[] = (JSON.parse(wrangler(["kv", "key", "list", "--binding", "RUXT_KV", mode])) as { name: string }[]).map((k) => k.name);
   const expectedKeys = new Set<string>();
   for (const file of manifest.kv.files) for (const r of JSON.parse(readFileSync(join(outDir, file), "utf8"))) expectedKeys.add(r.key);
   const missing = [...expectedKeys].filter((k) => !keys.includes(k));
   if (missing.length) problems.push(`KV is missing ${missing.length} of ${expectedKeys.size} keys, e.g. ${missing.slice(0, 3).join(", ")}`);
   else console.log(`kv: all ${expectedKeys.size} physical keys present`);
   const expectedRecords: any[] = [];
   for (const file of manifest.kv.files) expectedRecords.push(...JSON.parse(readFileSync(join(outDir, file), "utf8")));
   // Chunk payloads are base64 of binary slices, which `kv key get --text` cannot return faithfully; their presence is checked above and their content by check-kv-roundtrip.ts.
   const sample = expectedRecords.filter((r) => !r.base64).sort(() => Math.random() - 0.5).slice(0, Math.min(20, expectedRecords.length));
   for (const expected of sample) {
      try {
         const actual = wrangler(["kv", "key", "get", expected.key, "--binding", "RUXT_KV", mode, "--text"]);
         if (sha256(actual.trim()) !== sha256(String(expected.value))) problems.push(`KV content mismatch: ${expected.key}`);
      } catch { problems.push(`KV read failed: ${expected.key}`); }
   }
   if (problems.length) { console.error(problems.join("\n")); (globalThis as any).Deno.exit(1); }
   console.log("verify ok");
}

const [command, ...args] = (globalThis as any).Deno.args as string[];
if (command === "export" && args.length >= 2) await exportKv(args[0], args[1]);
else if (command === "transform" && args.length >= 1) transform(args[0]);
else if (command === "verify" && args.length >= 1) verify(args[0], args.includes("--local"));
else { console.error("usage: export <kv> <outDir> | transform <outDir> | verify <outDir> [--local]"); (globalThis as any).Deno.exit(64); }
