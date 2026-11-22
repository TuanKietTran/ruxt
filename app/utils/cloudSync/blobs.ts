import type { SyncSnapshot } from "./types";

/**
 * Snapshot storage for sync bookkeeping that should not crowd localStorage (which holds the primary
 * local records): the last agreed base of each linked record (for three-way merges), the latest known
 * cloud content, and recovery copies of local content replaced by a sync action.
 */
export interface SyncBlobStore {
   get(key: string): Promise<SyncSnapshot | null>;
   set(key: string, value: SyncSnapshot): Promise<void>;
   delete(key: string): Promise<void>;
}

export function createMemoryBlobStore(): SyncBlobStore & { entries: Map<string, SyncSnapshot> } {
   const entries = new Map<string, SyncSnapshot>();
   return {
      entries,
      async get(key) { return entries.has(key) ? structuredClone(entries.get(key)!) : null; },
      async set(key, value) { entries.set(key, structuredClone(value)); },
      async delete(key) { entries.delete(key); },
   };
}

const DATABASE = "ruxt-cloud-sync";
const STORE = "snapshots";

/** IndexedDB-backed store; falls back to memory when IndexedDB is unavailable (private mode, tests). */
export function createIndexedDbBlobStore(factory: IDBFactory | undefined = globalThis.indexedDB): SyncBlobStore {
   if (!factory) return createMemoryBlobStore();
   let opening: Promise<IDBDatabase> | undefined;
   const open = () => opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DATABASE, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
   });
   const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) => {
      const db = await open();
      return new Promise<T>((resolve, reject) => {
         const transaction = db.transaction(STORE, mode);
         const request = action(transaction.objectStore(STORE));
         transaction.oncomplete = () => resolve(request.result);
         transaction.onerror = () => reject(transaction.error);
         transaction.onabort = () => reject(transaction.error);
      });
   };
   const fallback = createMemoryBlobStore();
   let broken = false;
   const guard = async <T>(primary: () => Promise<T>, secondary: () => Promise<T>) => {
      if (broken) return secondary();
      try { return await primary(); } catch { broken = true; return secondary(); }
   };
   return {
      get: key => guard(async () => (await run<SyncSnapshot | undefined>("readonly", store => store.get(key))) ?? null, () => fallback.get(key)),
      set: (key, value) => guard(async () => { await run("readwrite", store => store.put(structuredClone(value), key)); }, () => fallback.set(key, value)),
      delete: key => guard(async () => { await run("readwrite", store => store.delete(key)); }, () => fallback.delete(key)),
   };
}
