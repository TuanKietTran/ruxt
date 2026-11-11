import { vi, type Mock } from "vitest";

/**
 * Mock File System Access handles and download-spy fixtures for the PDF save-folder tests.
 * Mocks mirror the real API contract: getFileHandle without create throws NotFoundError for
 * missing names; data is committed to a file only on close().
 */

export function domError(name: string, message = name): DOMException {
   return new DOMException(message, name);
}

export interface MockFileRecord {
   name: string;
   blob: Blob | null;
   /** every blob committed by a closed writable, in order */
   writes: Blob[];
}

export interface MockDirectoryOptions {
   name?: string;
   /** names of files that already exist in the folder */
   files?: string[];
   /** value returned by queryPermission (default "granted") */
   permission?: PermissionState;
   /** value returned by requestPermission (default "granted") */
   requestResult?: PermissionState;
   /** when true, every getFileHandle call throws NotFoundError (folder removed) */
   gone?: boolean;
   /** DOMException name thrown by writable.write() */
   writeError?: string;
}

export interface MockDirectoryHandle {
   kind: "directory";
   name: string;
   files: Map<string, MockFileRecord>;
   queryPermission: Mock;
   requestPermission: Mock;
   getFileHandle: Mock;
}

export function createMockDirectoryHandle(options: MockDirectoryOptions = {}): MockDirectoryHandle {
   const files = new Map<string, MockFileRecord>();
   for (const name of options.files ?? []) files.set(name, { name, blob: new Blob(["existing"]), writes: [] });

   const handle: MockDirectoryHandle = {
      kind: "directory",
      name: options.name ?? "Exports",
      files,
      queryPermission: vi.fn(async () => options.permission ?? "granted"),
      requestPermission: vi.fn(async () => options.requestResult ?? "granted"),
      getFileHandle: vi.fn(async (name: string, init: { create?: boolean } = {}) => {
         if (options.gone) throw domError("NotFoundError", "The folder was removed.");
         let record = files.get(name);
         if (!record) {
            if (!init.create) throw domError("NotFoundError", `${name} was not found.`);
            record = { name, blob: null, writes: [] };
            files.set(name, record);
         }
         return createMockFileHandle(record, options.writeError);
      }),
   };
   return handle;
}

function createMockFileHandle(record: MockFileRecord, writeError?: string) {
   return {
      kind: "file" as const,
      name: record.name,
      createWritable: vi.fn(async () => {
         const pending: Blob[] = [];
         return {
            write: vi.fn(async (data: Blob) => {
               if (writeError) throw domError(writeError);
               pending.push(data);
            }),
            close: vi.fn(async () => {
               record.writes.push(...pending);
               if (pending.length) record.blob = pending[pending.length - 1]!;
            }),
         };
      }),
   };
}

/** Stubs window.showDirectoryPicker to resolve with `handle`; returns the picker spy. */
export function stubDirectoryPicker(handle: MockDirectoryHandle): Mock {
   const picker = vi.fn(async () => handle);
   vi.stubGlobal("window", globalThis);
   vi.stubGlobal("showDirectoryPicker", picker);
   return picker;
}

/** Makes the API absent: "showDirectoryPicker" in window is false (Firefox/Safari shape). */
export function stubWithoutDirectoryPicker(): void {
   vi.stubGlobal("window", globalThis);
   delete (globalThis as Record<string, unknown>).showDirectoryPicker;
}

/**
 * Replaces document with a minimal createElement("a") recorder so downloadBlob's anchor click
 * can be observed in the node environment. Call unstubAllGlobals() / vi.restoreAllMocks() after.
 */
export function stubAnchorDownloads() {
   const anchors: { tagName: string; href: string; download: string; click: Mock }[] = [];
   vi.stubGlobal("document", {
      defaultView: undefined,
      createElement: (tagName: string) => {
         const anchor = { tagName, href: "", download: "", click: vi.fn() };
         anchors.push(anchor);
         return anchor;
      },
   });
   const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
   const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
   return {
      anchors,
      clicks: () => anchors.filter(anchor => anchor.click.mock.calls.length > 0),
      createObjectURL,
      revokeObjectURL,
   };
}
