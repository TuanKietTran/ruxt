import { exportCvPdf, type CvPdfExportOptions } from "~/utils/exportCvDocument";
import { DirectorySaveError, FOLDER_UNAVAILABLE_MESSAGE, ensureDirectoryPermission } from "~/utils/exportCvImage";
import { clearExportDirectory, getExportDirectory, setExportDirectory } from "~/utils/exportDirectoryStore";

export const DEFAULT_FOLDER_LABEL = "Downloads (browser default)";

export const useCvPdfExport = (getRoot: () => HTMLElement | null) => {
    const busy = ref(false);
    const progress = ref("");
    const error = ref("");
    const success = ref("");
    const handle = shallowRef<FileSystemDirectoryHandle | null>(null);
    const folderLabel = computed(() => handle.value?.name || DEFAULT_FOLDER_LABEL);
    const canPick = computed(() => import.meta.client && typeof window !== "undefined" && "showDirectoryPicker" in window && typeof window.showDirectoryPicker === "function");

    const clearMessages = () => { error.value = ""; success.value = ""; progress.value = ""; };
    const dropHandle = async () => { handle.value = null; await clearExportDirectory(); };

    const hydrate = async () => {
        const stored = await getExportDirectory();
        let granted = false;
        if (stored) {
            try { granted = (await stored.queryPermission?.({ mode: "readwrite" })) === "granted"; } catch { granted = false; }
        }
        if (stored && granted) handle.value = stored;
        else await dropHandle();
    };

    const pick = async () => {
        if (!canPick.value) return;
        try {
            const dir = await window.showDirectoryPicker!({ id: "ruxt-pdf-export", mode: "readwrite", startIn: handle.value ?? "downloads" });
            handle.value = dir;
            error.value = "";
            await setExportDirectory(dir);
        } catch (caught) {
            if (caught instanceof DOMException && caught.name === "AbortError") return;
            error.value = caught instanceof Error ? caught.message : "Could not choose a folder.";
        }
    };

    const reset = async () => { error.value = ""; await dropHandle(); };

    const generate = async (options: CvPdfExportOptions) => {
        // Permission calls come first, before any other await, so the click's user activation is kept.
        const directory = handle.value;
        const permitted = directory ? ensureDirectoryPermission(directory) : null;
        const label = folderLabel.value;
        const root = getRoot();
        error.value = ""; success.value = "";
        if (!root) { error.value = "The CV preview is not ready. Wait for it to render, then retry."; return; }
        busy.value = true; progress.value = "Preparing rendered CV pages…";
        try {
            if (permitted && !(await permitted)) throw new DirectorySaveError("permission-denied");
            const result = await exportCvPdf({ ...options, root, directory, onProgress: (completed, total) => { progress.value = `Creating page ${completed} of ${total}…`; } });
            progress.value = "";
            success.value = `Saved ${result.filename} to ${result.destination === "folder" ? label : DEFAULT_FOLDER_LABEL}`;
        } catch (caught) {
            progress.value = "";
            if (caught instanceof DirectorySaveError) { await dropHandle(); error.value = FOLDER_UNAVAILABLE_MESSAGE; }
            else error.value = caught instanceof Error ? caught.message : "PDF export failed. Check the preview and retry.";
        } finally { busy.value = false; }
    };

    return { busy, progress, error, success, folderLabel, canPick, hydrate, pick, reset, generate, clearMessages };
};
