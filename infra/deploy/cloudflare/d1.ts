/** Minimal Cloudflare D1 surface used by the deployment adapters. */
export interface D1Result<T = Record<string, unknown>> {
   results?: T[];
   success: boolean;
}

export interface D1PreparedStatement {
   bind(...values: unknown[]): D1PreparedStatement;
   first<T = Record<string, unknown>>(): Promise<T | null>;
   all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
   run(): Promise<D1Result>;
}

export interface D1Database {
   prepare(query: string): D1PreparedStatement;
   batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

/** Nitro's Cloudflare preset exposes bindings via globalThis.__env__. */
export function getD1(): D1Database {
   const env = (globalThis as typeof globalThis & {
      __env__?: { RUXT_DB?: D1Database };
   }).__env__;
   if (!env?.RUXT_DB) throw new Error("Cloudflare D1 binding RUXT_DB is unavailable");
   return env.RUXT_DB;
}

export function assertD1(result: D1Result): void {
   if (!result.success) throw new Error("Cloudflare D1 operation failed");
}
