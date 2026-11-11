import { vi } from "vitest";

/**
 * Minimal in-memory IndexedDB double for store-level tests.
 * Supports open/upgrade, object stores, get/put/delete/clear/getAll and transactions with
 * oncomplete/onsuccess/onerror. Databases persist across opens until resetFakeIndexedDB(),
 * mirroring a browser profile across page reloads. Values are stored by reference, so
 * non-cloneable values (FileSystemDirectoryHandle mocks) round-trip unchanged.
 */

type Key = IDBValidKey;
type Listener<T> = ((event: { target: T; type: string } & Record<string, unknown>) => void) | null;

interface StoreState { rows: Map<Key, unknown> }
interface DatabaseState { name: string; version: number; stores: Map<string, StoreState> }

const databases = new Map<string, DatabaseState>();

class FakeRequest<T = unknown> {
   result: T | undefined = undefined;
   error: DOMException | null = null;
   readyState: "pending" | "done" = "pending";
   transaction: FakeTransaction | null = null;
   onsuccess: Listener<FakeRequest<T>> = null;
   onerror: Listener<FakeRequest<T>> = null;
   onupgradeneeded: Listener<FakeRequest<T>> = null;
   onblocked: Listener<FakeRequest<T>> = null;
}

function fire<T>(request: FakeRequest<T>, type: "success" | "error" | "upgradeneeded", extra: Record<string, unknown> = {}) {
   const handler = type === "success" ? request.onsuccess : type === "error" ? request.onerror : request.onupgradeneeded;
   handler?.({ target: request, type, ...extra });
}

export class FakeTransaction {
   oncomplete: Listener<FakeTransaction> = null;
   onerror: Listener<FakeTransaction> = null;
   onabort: Listener<FakeTransaction> = null;
   error: DOMException | null = null;
   private pending = 0;
   private finished = false;

   constructor(private readonly state: DatabaseState, readonly mode: IDBTransactionMode, readonly storeNames: string[]) {}

   objectStore(name: string): FakeObjectStore {
      if (!this.storeNames.includes(name)) throw new DOMException(`Store ${name} is not in this transaction`, "NotFoundError");
      return new FakeObjectStore(this, this.state.stores.get(name)!);
   }

   /** @internal runs one request asynchronously, then fires oncomplete once all requests settle */
   run<T>(work: () => T): FakeRequest<T> {
      const request = new FakeRequest<T>();
      request.transaction = this;
      this.pending++;
      setTimeout(() => {
         try {
            request.result = work();
            request.readyState = "done";
            fire(request, "success");
         } catch (error) {
            request.error = error as DOMException;
            request.readyState = "done";
            fire(request, "error");
         }
         this.pending--;
         if (this.pending === 0 && !this.finished) {
            this.finished = true;
            this.oncomplete?.({ target: this, type: "complete" });
         }
      }, 0);
      return request;
   }
}

class FakeObjectStore {
   constructor(private readonly tx: FakeTransaction, private readonly store: StoreState) {}

   get(key: Key) { return this.tx.run(() => this.store.rows.get(key)); }
   getAll() { return this.tx.run(() => [...this.store.rows.values()]); }
   put(value: unknown, key?: Key) {
      return this.tx.run(() => {
         if (key === undefined) throw new DOMException("Out-of-line key required", "DataError");
         this.store.rows.set(key, value);
         return key;
      });
   }
   delete(key: Key) { return this.tx.run(() => { this.store.rows.delete(key); return undefined; }); }
   clear() { return this.tx.run(() => { this.store.rows.clear(); return undefined; }); }
}

class FakeDatabase {
   constructor(private readonly state: DatabaseState) {}

   get name() { return this.state.name; }
   get version() { return this.state.version; }
   get objectStoreNames() {
      return { contains: (name: string) => this.state.stores.has(name), get length() { return 0; } };
   }
   createObjectStore(name: string) {
      if (this.state.stores.has(name)) throw new DOMException(`Store ${name} exists`, "ConstraintError");
      const store: StoreState = { rows: new Map() };
      this.state.stores.set(name, store);
      return new FakeObjectStore(new FakeTransaction(this.state, "versionchange", [name]), store);
   }
   transaction(names: string | string[], mode: IDBTransactionMode = "readonly") {
      const list = Array.isArray(names) ? names : [names];
      for (const name of list) {
         if (!this.state.stores.has(name)) throw new DOMException(`No store ${name}`, "NotFoundError");
      }
      return new FakeTransaction(this.state, mode, list);
   }
   close() {}
}

export class FakeIDBFactory {
   /** Set to make the next open() fail with this error (for store error-path tests). */
   failNextOpen: DOMException | null = null;

   open(name: string, version = 1) {
      const request = new FakeRequest<FakeDatabase>();
      setTimeout(() => {
         if (this.failNextOpen) {
            request.error = this.failNextOpen;
            this.failNextOpen = null;
            request.readyState = "done";
            fire(request, "error");
            return;
         }
         let state = databases.get(name);
         if (!state) {
            state = { name, version: 0, stores: new Map() };
            databases.set(name, state);
         }
         if (version < state.version) {
            request.error = new DOMException(`Requested version ${version} is below ${state.version}`, "VersionError");
            request.readyState = "done";
            fire(request, "error");
            return;
         }
         const db = new FakeDatabase(state);
         request.result = db;
         if (version > state.version) {
            const oldVersion = state.version;
            request.transaction = new FakeTransaction(state, "versionchange", [...state.stores.keys()]);
            fire(request, "upgradeneeded", { oldVersion, newVersion: version });
            state.version = version;
         }
         request.readyState = "done";
         fire(request, "success");
      }, 0);
      return request;
   }

   deleteDatabase(name: string) {
      const request = new FakeRequest<undefined>();
      setTimeout(() => {
         databases.delete(name);
         request.readyState = "done";
         fire(request, "success");
      }, 0);
      return request;
   }
}

/** Replaces globalThis.indexedDB with a fresh fake. Call unstubAllGlobals() in afterEach. */
export function installFakeIndexedDB(): FakeIDBFactory {
   const factory = new FakeIDBFactory();
   vi.stubGlobal("indexedDB", factory);
   return factory;
}

/** Drops every database, as if the browser profile were cleared. */
export function resetFakeIndexedDB(): void {
   databases.clear();
}

/** Synchronous view of the rows in one store, for assertions. */
export function inspectFakeStore(dbName: string, storeName: string): [Key, unknown][] {
   return [...(databases.get(dbName)?.stores.get(storeName)?.rows ?? new Map()).entries()];
}
