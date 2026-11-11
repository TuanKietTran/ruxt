import { describe, expect, it, vi } from "vitest";
import {
    DirectorySaveError,
    FOLDER_UNAVAILABLE_MESSAGE,
    ensureDirectoryPermission,
    saveBlobToDirectory,
} from "../../app/utils/exportCvImage";
import { createMockDirectoryHandle, domError } from "../helpers/fake-file-system";

const asDir = (handle: unknown) => handle as FileSystemDirectoryHandle;
const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });

describe("saveBlobToDirectory (mocked handles)", () => {
    it("writes under the requested name when it is free and returns that name", async () => {
        const dir = createMockDirectoryHandle();
        await expect(saveBlobToDirectory(pdf, "CV.pdf", asDir(dir))).resolves.toBe("CV.pdf");
        expect(dir.files.get("CV.pdf")?.writes).toEqual([pdf]);
    });

    it("suffixes (1), (2) on collisions and never overwrites an existing file", async () => {
        const dir = createMockDirectoryHandle({ files: ["CV.pdf", "CV (1).pdf"] });
        await expect(saveBlobToDirectory(pdf, "CV.pdf", asDir(dir))).resolves.toBe("CV (2).pdf");
        expect(dir.files.get("CV.pdf")?.writes).toEqual([]);
        expect(dir.files.get("CV (1).pdf")?.writes).toEqual([]);
        expect(dir.files.get("CV (2).pdf")?.writes).toEqual([pdf]);
    });

    it("never prompts: no overwrite-confirmation API is touched", async () => {
        const dir = createMockDirectoryHandle({ files: ["CV.pdf"] });
        await saveBlobToDirectory(pdf, "CV.pdf", asDir(dir));
        expect(dir.requestPermission).not.toHaveBeenCalled();
    });

    it("throws DirectorySaveError permission-denied when a write is not allowed", async () => {
        const dir = createMockDirectoryHandle({ writeError: "NotAllowedError" });
        const error = await saveBlobToDirectory(pdf, "CV.pdf", asDir(dir)).catch(caught => caught);
        expect(error).toBeInstanceOf(DirectorySaveError);
        expect(error.code).toBe("permission-denied");
        expect(error.message).toBe(FOLDER_UNAVAILABLE_MESSAGE);
    });

    it("throws DirectorySaveError folder-unavailable when the folder is gone (NotFoundError)", async () => {
        const dir = createMockDirectoryHandle({ gone: true });
        const error = await saveBlobToDirectory(pdf, "CV.pdf", asDir(dir)).catch(caught => caught);
        expect(error).toBeInstanceOf(DirectorySaveError);
        expect(error.code).toBe("folder-unavailable");
        expect(error.message).toBe(FOLDER_UNAVAILABLE_MESSAGE);
    });

    it("maps SecurityError to folder-unavailable", async () => {
        const dir = createMockDirectoryHandle();
        dir.getFileHandle.mockRejectedValue(domError("SecurityError"));
        const error = await saveBlobToDirectory(pdf, "CV.pdf", asDir(dir)).catch(caught => caught);
        expect(error).toBeInstanceOf(DirectorySaveError);
        expect(error.code).toBe("folder-unavailable");
    });

    it("rethrows unrelated errors unchanged", async () => {
        const dir = createMockDirectoryHandle();
        const boom = new TypeError("unexpected");
        dir.getFileHandle.mockRejectedValue(boom);
        await expect(saveBlobToDirectory(pdf, "CV.pdf", asDir(dir))).rejects.toBe(boom);
    });
});

describe("ensureDirectoryPermission (mocked handles)", () => {
    it("returns true without prompting when already granted", async () => {
        const dir = createMockDirectoryHandle({ permission: "granted" });
        await expect(ensureDirectoryPermission(asDir(dir))).resolves.toBe(true);
        expect(dir.queryPermission).toHaveBeenCalledWith({ mode: "readwrite" });
        expect(dir.requestPermission).not.toHaveBeenCalled();
    });

    it("requests permission once when the state is prompt and returns true if granted", async () => {
        const dir = createMockDirectoryHandle({ permission: "prompt", requestResult: "granted" });
        await expect(ensureDirectoryPermission(asDir(dir))).resolves.toBe(true);
        expect(dir.requestPermission).toHaveBeenCalledTimes(1);
        expect(dir.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    });

    it("returns false when the prompt is declined", async () => {
        const dir = createMockDirectoryHandle({ permission: "prompt", requestResult: "denied" });
        await expect(ensureDirectoryPermission(asDir(dir))).resolves.toBe(false);
        expect(dir.requestPermission).toHaveBeenCalledTimes(1);
    });

    it("returns false without prompting when permission is denied", async () => {
        const dir = createMockDirectoryHandle({ permission: "denied" });
        await expect(ensureDirectoryPermission(asDir(dir))).resolves.toBe(false);
        expect(dir.requestPermission).not.toHaveBeenCalled();
    });

    it("returns false when queryPermission throws", async () => {
        const dir = createMockDirectoryHandle();
        dir.queryPermission.mockRejectedValue(new Error("gone"));
        await expect(ensureDirectoryPermission(asDir(dir))).resolves.toBe(false);
    });
});
