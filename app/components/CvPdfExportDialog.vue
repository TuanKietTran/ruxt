<script setup lang="ts">
import { parseCvPdfPageSelection, type CvPdfExportOptions } from "~/utils/exportCvDocument";

const props = withDefaults(defineProps<{
    open: boolean;
    documentName: string;
    previewRoot?: HTMLElement | null;
    pageCount?: number;
    busy?: boolean;
    progress?: string;
    error?: string;
    success?: string;
    folderLabel?: string;
    canPick?: boolean;
}>(), { previewRoot: null, pageCount: 0, busy: false, progress: "", error: "", success: "", folderLabel: "Downloads (browser default)", canPick: false });
const emit = defineEmits<{ close: []; generate: [options: CvPdfExportOptions]; pick: []; reset: [] }>();
const DEFAULT_FOLDER = "Downloads (browser default)";
const folderValue = computed(() => props.folderLabel || DEFAULT_FOLDER);
const folderPicked = computed(() => folderValue.value !== DEFAULT_FOLDER);
const filename = ref(props.documentName);
const paper = ref<"a4" | "letter" | "legal">("a4");
const orientation = ref<"portrait" | "landscape">("portrait");
const pages = ref("");
const formError = ref("");
const dialog = useTemplateRef<HTMLElement>("dialog");
const filenameInput = useTemplateRef<HTMLInputElement>("filenameInput");
const previewHost = useTemplateRef<HTMLElement>("previewHost");
useModalBehavior({ isOpen: () => props.open, onClose: () => { if (!props.busy) emit("close"); }, container: () => dialog.value, initialFocus: () => filenameInput.value });
let previewBuildRevision = 0;
const pageSelectionError = computed(() => {
    if (!pages.value.trim()) return "";
    const total = props.pageCount;
    if (!total || !/^[\d,\s-]+$/.test(pages.value)) return "Enter page numbers or ranges, for example 1-3,5.";
    const picked = new Set<number>();
    const parts = pages.value.split(",").map(item => item.trim());
    if (parts.some(part => !part)) return "Enter page numbers or ranges, for example 1-3,5.";
    for (const part of parts) {
        const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
        if (!match) return "Enter page numbers or ranges, for example 1-3,5.";
        const start = Number(match[1]); const end = Number(match[2] ?? match[1]);
        if (start < 1 || end < start || end > total) return `Choose pages from 1 to ${total}.`;
        for (let page = start; page <= end; page++) picked.add(page);
    }
    return picked.size ? "" : "Choose at least one page.";
});
let lastPreviewPages: number[] = [1];
const previewPages = computed(() => {
    if (!props.pageCount) return [];
    try { lastPreviewPages = parseCvPdfPageSelection(pages.value, props.pageCount); } catch { /* keep the last valid selection while the field is being edited */ }
    return lastPreviewPages.filter(page => page <= props.pageCount);
});
const previewTitle = computed(() => previewPages.value.length === 1 ? `page ${previewPages.value[0]}` : `pages ${previewPages.value.join(", ")}`);

watch(() => props.open, async (open) => {
    if (!open) {
        previewBuildRevision++;
        return;
    }
    filename.value = props.documentName;
    formError.value = "";
    await nextTick();
    schedulePreview();
}, { immediate: true });
watch(() => [props.previewRoot, props.open, props.pageCount], () => {
    if (props.open) schedulePreview();
    else previewBuildRevision++;
}, { flush: "post" });
watch(pages, () => {
    if (!props.open) return;
    previewBuildRevision++;
    buildPreview();
}, { flush: "sync" });

function schedulePreview() {
    const revision = ++previewBuildRevision;
    void nextTick(() => {
        if (revision !== previewBuildRevision || !props.open) return;
        buildPreview();
    });
}

function buildPreview() {
    const host = previewHost.value;
    const root = props.previewRoot;
    const view = root?.ownerDocument.defaultView;
    if (!host || !root || !view) return;
    host.replaceChildren();
    const sheets = root.querySelectorAll<HTMLElement>(".cv-sheet");
    for (const pageNumber of previewPages.value) {
        const original = sheets[pageNumber - 1];
        if (!original) continue;
        const clone = original.cloneNode(true) as HTMLElement;
        const originals = [original, ...original.querySelectorAll<HTMLElement>("*")];
        const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
        originals.forEach((element, index) => {
            const copy = copies[index]; if (!copy) return;
            const style = view.getComputedStyle(element);
            for (const property of style) copy.style.setProperty(property, style.getPropertyValue(property));
        });
        clone.style.transformOrigin = "top left";
        clone.style.margin = "0";
        // A CSS transform does not shrink the layout box, so the scaled sheet is wrapped in a frame
        // sized to the scaled dimensions; otherwise the flex host centres the full-size box and clips it.
        const frame = host.ownerDocument.createElement("div");
        frame.className = "cv-pdf-preview__frame";
        frame.dataset.page = String(pageNumber);
        frame.style.cssText = "flex:none;overflow:hidden;";
        frame.append(clone);
        host.append(frame);
        const scale = Math.min((host.clientWidth - 32) / Math.max(1, clone.offsetWidth), 600 / Math.max(1, clone.offsetHeight));
        clone.style.transform = `scale(${scale})`;
        frame.style.width = `${clone.offsetWidth * scale}px`;
        frame.style.height = `${clone.offsetHeight * scale}px`;
    }
}

function close() { if (!props.busy) emit("close"); }
function submit() {
    formError.value = "";
    const cleanName = filename.value.trim().replace(/\.pdf$/i, "");
    if (!cleanName) { formError.value = "Enter a filename."; filenameInput.value?.focus(); return; }
    if (pageSelectionError.value) { formError.value = pageSelectionError.value; return; }
    emit("generate", {
        filename: cleanName,
        paper: paper.value,
        orientation: orientation.value,
        pages: pages.value,
    });
}
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="cv-pdf-backdrop" @click.self="close">
            <section ref="dialog" class="cv-pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="cv-pdf-title" aria-describedby="cv-pdf-description" tabindex="-1">
                <header><div><h2 id="cv-pdf-title">Export PDF</h2><p id="cv-pdf-description">Generate a PDF from this CV in your browser. Nothing is uploaded.</p></div><button class="cv-pdf-close" type="button" aria-label="Close PDF export" :disabled="busy" @click="close">×</button></header>
                <form class="cv-pdf-form" @submit.prevent="submit">
                    <div class="cv-pdf-options">
                        <label>Filename<input ref="filenameInput" v-model="filename" autocomplete="off" :disabled="busy"><small>.pdf will be added automatically</small></label>
                        <div class="cv-pdf-folder" data-testid="pdf-save-folder">
                            <label for="cv-pdf-save-to">Save to</label>
                            <div class="cv-pdf-folder__field"><AppIcon v-if="folderPicked" name="lucide:folder" :size="16" /><input id="cv-pdf-save-to" data-testid="pdf-save-to" :value="folderValue" readonly aria-describedby="cv-pdf-save-hint"></div>
                            <small id="cv-pdf-save-hint">{{ folderPicked ? "Files save directly to this folder. The folder choice is stored only in this browser." : "Your browser's default download location" }}</small>
                            <div class="cv-pdf-folder__actions">
                                <button v-if="canPick" class="cv-pdf-button" type="button" data-testid="pdf-choose-folder" :disabled="busy" @click="emit('pick')">Choose folder</button>
                                <button v-if="folderPicked" class="cv-pdf-button" type="button" data-testid="pdf-reset-folder" :disabled="busy" @click="emit('reset')">Downloads (browser default)</button>
                            </div>
                        </div>
                        <label>Paper<select v-model="paper" :disabled="busy"><option value="a4">A4</option><option value="letter">US Letter</option><option value="legal">US Legal</option></select></label>
                        <label>Orientation<select v-model="orientation" :disabled="busy"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
                        <label>Pages <span class="cv-pdf-hint">({{ pageCount }} available; blank for all)</span><input v-model="pages" :placeholder="pageCount ? `1-${pageCount}` : 'All pages'" :disabled="busy" :aria-invalid="Boolean(pageSelectionError)" aria-describedby="cv-pdf-pages-hint"><small id="cv-pdf-pages-hint">Page numbers and ranges, e.g. 1-3,5</small></label>
                    </div>
                    <section class="cv-pdf-preview" aria-label="PDF page preview"><h3>Preview · {{ previewTitle }}</h3><div ref="previewHost" class="cv-pdf-preview__page"><p v-if="!pageCount">No rendered CV pages are available yet.</p></div><small>Preview shows the selected pages as rendered; page margins come from the CV's own layout.</small></section>
                    <p v-if="formError || pageSelectionError" class="cv-pdf-error" role="alert">{{ formError || pageSelectionError }}</p>
                    <p v-if="error" class="cv-pdf-error" role="alert">{{ error }}</p>
                    <p v-if="success" class="cv-pdf-success" role="status">{{ success }}</p>
                    <p v-if="progress" class="cv-pdf-progress" role="status" aria-live="polite">{{ progress }}</p>
                    <footer><button class="cv-pdf-button" type="button" :disabled="busy" @click="close">{{ success ? "Close" : "Cancel" }}</button><button class="cv-pdf-button cv-pdf-button--primary" type="submit" :disabled="busy || !pageCount">{{ busy ? "Generating…" : "Download PDF" }}</button></footer>
                </form>
            </section>
        </div>
    </Teleport>
</template>

<style scoped>
.cv-pdf-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; overflow: auto; padding: 24px; background: rgb(0 0 0 / 68%); }
.cv-pdf-dialog { width: min(1080px, 100%); max-height: 92vh; overflow: auto; padding: 20px; border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--bg-mantle); color: var(--fg-text); box-shadow: 0 24px 64px rgb(0 0 0 / 40%); }
.cv-pdf-dialog header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.cv-pdf-dialog h2 { margin: 0; font-size: 16px; line-height: 1.3; }
.cv-pdf-dialog header p { margin: 4px 0 0; color: var(--fg-subtext0); font-size: 12px; line-height: 1.5; }
.cv-pdf-close { display: grid; place-items: center; width: 32px; height: 32px; flex: none; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--fg-subtext0); font-size: 20px; line-height: 1; cursor: pointer; }
.cv-pdf-close:hover { background: var(--bg-surface0); color: var(--fg-text); }
.cv-pdf-form { display: grid; grid-template-columns: minmax(0, .7fr) minmax(320px, 1.3fr); gap: 20px; margin-top: 20px; }
.cv-pdf-options { display: grid; align-content: start; gap: 16px; }
.cv-pdf-options > label { display: grid; gap: 8px; color: var(--fg-subtext1); font-size: 12px; }
.cv-pdf-options input, .cv-pdf-options select { width: 100%; min-height: 36px; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-base); color: inherit; font: inherit; }
.cv-pdf-options input:hover, .cv-pdf-options select:hover { border-color: var(--border-strong); }
.cv-pdf-options small, .cv-pdf-hint { color: var(--fg-subtext0); font-size: 11px; line-height: 1.5; }
.cv-pdf-folder { display: grid; gap: 8px; color: var(--fg-subtext1); font-size: 12px; }
.cv-pdf-folder__field { position: relative; display: flex; align-items: center; }
.cv-pdf-folder__field .app-icon { position: absolute; left: 8px; color: var(--fg-subtext0); }
.cv-pdf-folder__field .app-icon + input { padding-left: 32px; }
.cv-pdf-folder__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.cv-pdf-folder__actions:empty { display: none; }
.cv-pdf-folder small { color: var(--fg-subtext0); font-size: 11px; line-height: 1.5; }
.cv-pdf-preview { min-width: 0; display: grid; grid-template-rows: auto minmax(400px, 1fr) auto; gap: 8px; }
.cv-pdf-preview h3 { margin: 0; font-size: 13px; line-height: 1.4; }
.cv-pdf-preview__page { min-height: 400px; max-height: 660px; overflow: auto; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-surface0); }
.cv-pdf-preview__page small { color: var(--fg-subtext0); font-size: 11px; line-height: 1.5; }
.cv-pdf-preview__page p { color: var(--fg-subtext0); font-size: 12px; line-height: 1.5; }
.cv-pdf-error { grid-column: 1/-1; margin: 0; color: var(--red); font-size: 12px; line-height: 1.5; }
.cv-pdf-success { grid-column: 1/-1; margin: 0; color: var(--green); font-size: 12px; line-height: 1.5; }
.cv-pdf-progress { grid-column: 1/-1; margin: 0; color: var(--fg-subtext0); font-size: 12px; line-height: 1.5; }
.cv-pdf-form footer { grid-column: 1/-1; display: flex; justify-content: flex-end; gap: 8px; }
.cv-pdf-button { min-height: 36px; padding: 8px 16px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: transparent; color: inherit; font: inherit; cursor: pointer; transition: background-color .15s ease, border-color .15s ease; }
.cv-pdf-button:hover { background: var(--bg-surface0); }
.cv-pdf-button--primary { border-color: transparent; background: var(--accent); color: var(--bg-crust); }
.cv-pdf-button--primary:hover { background: var(--accent-hover, var(--accent)); }
.cv-pdf-button:disabled { opacity: .55; cursor: not-allowed; }
.cv-pdf-dialog :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 640px) { .cv-pdf-form { grid-template-columns: 1fr; } .cv-pdf-preview__page { min-height: 220px; } }
</style>
