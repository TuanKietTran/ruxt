import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearExportDirectory, getExportDirectory, setExportDirectory } from "../../app/utils/exportDirectoryStore";
import { inspectFakeStore, installFakeIndexedDB, resetFakeIndexedDB, type FakeIDBFactory } from "../helpers/fake-indexeddb";
import { createMockDirectoryHandle } from "../helpers/fake-file-system";

const asDir = (handle: unknown) => handle as FileSystemDirectoryHandle;

describe("exportDirectoryStore (fake IndexedDB)", () => {
    let factory: FakeIDBFactory;

    beforeEach(() => {
        resetFakeIndexedDB();
        factory = installFakeIndexedDB();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        resetFakeIndexedDB();
    });

    it("returns null when nothing has been stored", async () => {
        expect(await getExportDirectory()).toBeNull();
    });

    it("stores the handle in db ruxt-export, store handles, key pdf-dir", async () => {
        const dir = createMockDirectoryHandle({ name: "Exports" });
        await setExportDirectory(asDir(dir));
        expect(inspectFakeStore("ruxt-export", "handles")).toEqual([["pdf-dir", dir]]);
    });

    it("returns the stored handle after a reload-equivalent reopen", async () => {
        const dir = createMockDirectoryHandle({ name: "Exports" });
        await setExportDirectory(asDir(dir));
        const reloaded = await getExportDirectory();
        expect(reloaded).toBe(dir);
        expect(reloaded?.name).toBe("Exports");
    });

    it("clear removes the stored handle", async () => {
        await setExportDirectory(asDir(createMockDirectoryHandle()));
        await clearExportDirectory();
        expect(await getExportDirectory()).toBeNull();
        expect(inspectFakeStore("ruxt-export", "handles")).toEqual([]);
    });

    it("clear on an empty store resolves without error", async () => {
        await expect(clearExportDirectory()).resolves.toBeUndefined();
    });

    it("get returns null when IndexedDB is unavailable", async () => {
        vi.stubGlobal("indexedDB", undefined);
        expect(await getExportDirectory()).toBeNull();
    });

    it("clear resolves without throwing when IndexedDB is unavailable", async () => {
        vi.stubGlobal("indexedDB", undefined);
        await expect(clearExportDirectory()).resolves.toBeUndefined();
    });

    it("get returns null when opening the database fails", async () => {
        factory.failNextOpen = new DOMException("blocked", "UnknownError");
        expect(await getExportDirectory()).toBeNull();
    });
});
