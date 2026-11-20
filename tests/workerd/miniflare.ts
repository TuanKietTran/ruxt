import { readdirSync, readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions, type MiniflareOptions } from "miniflare";

export const COMPATIBILITY_DATE = "2026-10-18";
const MIGRATIONS = new URL("../../infra/deploy/cloudflare/migrations/", import.meta.url);

/** Statements of every checked-in migration in apply order (each file is one statement per line plus comments). */
export function migrationStatements(): string[] {
   return readdirSync(MIGRATIONS).filter(name => name.endsWith(".sql")).sort()
      .flatMap(name => readFileSync(new URL(name, MIGRATIONS), "utf8").split("\n"))
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("--"));
}

/** A workerd instance hosting real D1 and KV bindings named like wrangler.json. */
export function createBindings(extra: Record<string, unknown> = {}) {
   return new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch: () => new Response('ok') }",
      compatibilityDate: COMPATIBILITY_DATE,
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: { RUXT_DB: "contract-test-db" },
      kvNamespaces: { RUXT_KV: "contract-test-kv" },
      ...extra,
   } as any) as MiniflareOptions);
}

export const globalEnv = globalThis as typeof globalThis & { __env__?: Record<string, unknown> };
