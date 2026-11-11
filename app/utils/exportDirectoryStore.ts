// Remembers the chosen PDF save folder in this browser only (IndexedDB); nothing is uploaded.
const DB_NAME = "ruxt-export";
const STORE = "handles";
const KEY = "pdf-dir";

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
});

const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const transaction = db.transaction(STORE, mode);
            const request = action(transaction.objectStore(STORE));
            let result: T;
            request.onsuccess = () => { result = request.result; };
            request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
            transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
        });
    } finally {
        db.close();
    }
};

export const getExportDirectory = async (): Promise<FileSystemDirectoryHandle | null> => {
    try {
        const value = await run<unknown>("readonly", store => store.get(KEY));
        return value ? value as FileSystemDirectoryHandle : null;
    } catch {
        return null;
    }
};

export const setExportDirectory = async (dir: FileSystemDirectoryHandle): Promise<void> => {
    await run("readwrite", store => store.put(dir, KEY));
};

export const clearExportDirectory = async (): Promise<void> => {
    try {
        await run("readwrite", store => store.delete(KEY));
    } catch {
        /* nothing stored or IndexedDB unavailable */
    }
};
