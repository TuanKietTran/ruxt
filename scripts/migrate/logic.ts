import { createHash } from "node:crypto";

export type Part = string | number | boolean | bigint | Uint8Array;
export interface Entry { key: Part[]; value: unknown; versionstamp: string }
export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
export const sql = (v: unknown): string => {
   if (v === null || v === undefined) return "NULL";
   if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
   if (typeof v === "boolean") return v ? "1" : "0";
   return `'${String(v).replaceAll("'", "''")}'`;
};
export const row = (table: string, columns: Record<string, unknown>) =>
   `INSERT OR REPLACE INTO ${table}(${Object.keys(columns).join(",")}) VALUES(${Object.values(columns).map(sql).join(",")});`;

export function ownerDigest(rows: Array<{ owner: string; table: string; canonical: string }>) {
   const grouped = new Map<string, string[]>();
   for (const r of rows) (grouped.get(r.owner) ?? grouped.set(r.owner, []).get(r.owner)!).push(`${r.table}:${r.canonical}`);
   return Object.fromEntries([...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([owner, values]) => [owner, sha256(values.sort().join("\n"))]));
}

export function contentHash(value: unknown) {
   const text = typeof value === "string" ? value : JSON.stringify(value);
   return sha256(text);
}

/** Preserve legacy iam_subject rows first so newer iam_sub records win during INSERT OR REPLACE. */
export function orderIamEntries<T extends { key: unknown[] }>(entries: T[]): T[] {
   return [...entries].sort((a, b) => Number(String(a.key[0]) === "iam_sub") - Number(String(b.key[0]) === "iam_sub"));
}

export function assertClassified(prefixes: string[], known: string[]) {
   const unknown = [...new Set(prefixes.filter((prefix) => !known.includes(prefix)))];
   if (unknown.length) throw new Error(`unclassified Deno KV prefixes (decide per family before importing): ${unknown.join(", ")}`);
}
