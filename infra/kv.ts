type KvKey = readonly unknown[];

type KvEntry<T> = {
   key: KvKey;
   value: T;
};

type KvAtomic = {
   set(key: KvKey, value: unknown): KvAtomic;
   delete(key: KvKey): KvAtomic;
   commit(): Promise<unknown>;
};

type Kv = {
   // Reads may miss; list() yields only existing entries, as in Deno KV.
   get<T>(key: KvKey): Promise<KvEntry<T | null>>;
   set(key: KvKey, value: unknown): Promise<unknown>;
   delete(key: KvKey): Promise<void>;
   list<T>(selector: { prefix: KvKey }): AsyncIterable<KvEntry<T>>;
   atomic(): KvAtomic;
};

type DenoKvRuntime = {
   openKv?: () => Promise<Kv>;
};

let _kv: Kv | undefined;

export async function getKv(): Promise<Kv> {
   if (_kv) return _kv;

   const deno = (globalThis as typeof globalThis & { Deno?: DenoKvRuntime }).Deno;
   if (!deno?.openKv) throw new Error("Deno.openKv is unavailable");
   _kv = await deno.openKv();
   return _kv;
}
