<script setup lang="ts">
import type { CvPdfExportOptions } from "~/utils/exportCvDocument";

const props = withDefaults(defineProps<{
    open: boolean;
    documentName: string;
    previewRoot?: HTMLElement | null;
    pageCount?: number;
    busy?: boolean;
    progress?: string;
    error?: string;
    success?: string;
}>(), { previewRoot: null, pageCount: 0, busy: false, progress: "", error: "", success: "" });
const emit = defineEmits<{ close: []; generate: [options: CvPdfExportOptions] }>();
const filename = ref(props.documentName);
const paper = ref<"a4" | "letter" | "legal">("a4");
const orientation = ref<"portrait" | "landscape">("portrait");
const marginTop = ref(12);
const marginRight = ref(12);
const marginBottom = ref(12);
const marginLeft = ref(12);
const pages = ref("");
const formError = ref("");
const dialog = useTemplateRef<HTMLElement>("dialog");
const filenameInput = useTemplateRef<HTMLInputElement>("filenameInput");
const previewHost = useTemplateRef<HTMLElement>("previewHost");
let restoreFocus: HTMLElement | null = null;
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
const validMargins = computed(() => [marginTop.value, marginRight.value, marginBottom.value, marginLeft.value].every(value => Number.isFinite(value) && value >= 0 && value <= 50));
const previewPageNumber = computed(() => {
    const requested = Number(/^\s*(\d+)/.exec(pages.value)?.[1] ?? 1);
    return requested >= 1 && requested <= props.pageCount ? requested : 1;
});

watch(() => props.open, async (open) => {
    if (!open) {
        const restore = restoreFocus; restoreFocus = null;
        await nextTick(); if (restore?.isConnected) restore.focus();
        return;
    }
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    filename.value = props.documentName;
    formError.value = "";
    await nextTick();
    filenameInput.value?.focus();
    buildPreview();
}, { immediate: true });
watch(() => [props.previewRoot, props.open, previewPageNumber.value], () => { if (props.open) nextTick(buildPreview); });

function buildPreview() {
    const host = previewHost.value;
    const root = props.previewRoot;
    const view = root?.ownerDocument.defaultView;
    if (!host || !root || !view) return;
    host.replaceChildren();
    const original = root.querySelectorAll<HTMLElement>(".cv-sheet")[previewPageNumber.value - 1];
    if (!original) return;
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
    host.append(clone);
    const scale = Math.min((host.clientWidth - 24) / Math.max(1, clone.offsetWidth), 300 / Math.max(1, clone.offsetHeight));
    clone.style.transform = `scale(${scale})`;
    host.style.setProperty("--preview-width", `${clone.offsetWidth * scale}px`);
    host.style.setProperty("--preview-height", `${clone.offsetHeight * scale}px`);
}

function close() { if (!props.busy) emit("close"); }
function onKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const items = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])].filter(item => item.offsetParent !== null);
    if (!items.length) { event.preventDefault(); dialog.value?.focus(); return; }
    const first = items[0]!; const last = items[items.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || !dialog.value?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.value?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}
function submit() {
    formError.value = "";
    const cleanName = filename.value.trim().replace(/\.pdf$/i, "");
    if (!cleanName) { formError.value = "Enter a filename."; filenameInput.value?.focus(); return; }
    if (!validMargins.value) { formError.value = "Margins must be between 0 and 50 mm."; return; }
    if (pageSelectionError.value) { formError.value = pageSelectionError.value; return; }
    emit("generate", {
        filename: cleanName,
        paper: paper.value,
        orientation: orientation.value,
        margins: { top: marginTop.value, right: marginRight.value, bottom: marginBottom.value, left: marginLeft.value },
        pages: pages.value,
    });
}
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="cv-pdf-backdrop" @click.self="close" @keydown="onKeydown">
            <section ref="dialog" class="cv-pdf-dialog" role="dialog" aria-modal="true" aria-labelledby="cv-pdf-title" aria-describedby="cv-pdf-description" tabindex="-1">
                <header><div><h2 id="cv-pdf-title">Export PDF</h2><p id="cv-pdf-description">Generate a PDF from this CV in your browser. Nothing is uploaded.</p></div><button class="cv-pdf-close" type="button" aria-label="Close PDF export" :disabled="busy" @click="close">×</button></header>
                <form class="cv-pdf-form" @submit.prevent="submit">
                    <div class="cv-pdf-options">
                        <label>Filename<input ref="filenameInput" v-model="filename" autocomplete="off" :disabled="busy"><small>.pdf will be added automatically</small></label>
                        <label>Paper<select v-model="paper" :disabled="busy"><option value="a4">A4</option><option value="letter">US Letter</option><option value="legal">US Legal</option></select></label>
                        <label>Orientation<select v-model="orientation" :disabled="busy"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
                        <fieldset><legend>Margins (mm)</legend><div class="cv-pdf-margins"><label>Top<input v-model.number="marginTop" type="number" min="0" max="50" step="1" :disabled="busy"></label><label>Right<input v-model.number="marginRight" type="number" min="0" max="50" step="1" :disabled="busy"></label><label>Bottom<input v-model.number="marginBottom" type="number" min="0" max="50" step="1" :disabled="busy"></label><label>Left<input v-model.number="marginLeft" type="number" min="0" max="50" step="1" :disabled="busy"></label></div></fieldset>
                        <label>Pages <span class="cv-pdf-hint">({{ pageCount }} available; blank for all)</span><input v-model="pages" :placeholder="pageCount ? `1-${pageCount}` : 'All pages'" :disabled="busy" :aria-invalid="Boolean(pageSelectionError)" aria-describedby="cv-pdf-pages-hint"><small id="cv-pdf-pages-hint">Page numbers and ranges, e.g. 1-3,5</small></label>
                    </div>
                    <section class="cv-pdf-preview" aria-label="PDF page preview"><h3>Preview · page {{ previewPageNumber }}</h3><div ref="previewHost" class="cv-pdf-preview__page"><p v-if="!pageCount">No rendered CV pages are available yet.</p></div><small>Preview shows the current rendered page; export uses the selected paper, orientation and margins.</small></section>
                    <p v-if="formError || pageSelectionError" class="cv-pdf-error" role="alert">{{ formError || pageSelectionError }}</p>
                    <p v-if="error" class="cv-pdf-error" role="alert">{{ error }}</p>
                    <p v-if="success" class="cv-pdf-success" role="status">{{ success }}</p>
                    <p v-if="progress" class="cv-pdf-progress" role="status" aria-live="polite">{{ progress }}</p>
                    <footer><button class="cv-pdf-button" type="button" :disabled="busy" @click="close">Cancel</button><button class="cv-pdf-button cv-pdf-button--primary" type="submit" :disabled="busy || !pageCount">{{ busy ? "Generating…" : "Download PDF" }}</button></footer>
                </form>
            </section>
        </div>
    </Teleport>
</template>

<style scoped>
.cv-pdf-backdrop { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; overflow: auto; padding: 20px; background: rgb(0 0 0 / 68%); }
.cv-pdf-dialog { width: min(900px, 100%); max-height: min(92vh, 900px); overflow: auto; padding: 20px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg-mantle); color: var(--fg-text); box-shadow: 0 24px 80px rgb(0 0 0 / 38%); }
.cv-pdf-dialog header { display: flex; justify-content: space-between; gap: 18px; }.cv-pdf-dialog h2 { margin: 0; font-size: 19px; }.cv-pdf-dialog header p { margin: 4px 0 0; color: var(--fg-subtext0); }.cv-pdf-close { width: 36px; height: 36px; border: 0; background: transparent; color: inherit; font-size: 26px; cursor: pointer; }
.cv-pdf-form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, .9fr); gap: 18px; margin-top: 18px; }.cv-pdf-options { display: grid; align-content: start; gap: 12px; }.cv-pdf-options > label, .cv-pdf-margins label { display: grid; gap: 4px; color: var(--fg-subtext1); font-size: 12px; }.cv-pdf-options input, .cv-pdf-options select { width: 100%; min-height: 36px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-base); color: inherit; font: inherit; }.cv-pdf-options small, .cv-pdf-hint { color: var(--fg-subtext0); font-size: 11px; }
.cv-pdf-options fieldset { border: 1px solid var(--border); border-radius: 6px; padding: 8px; }.cv-pdf-options legend { color: var(--fg-subtext1); font-size: 12px; }.cv-pdf-margins { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }.cv-pdf-margins input { min-width: 0; }
.cv-pdf-preview { min-width: 0; display: grid; grid-template-rows: auto minmax(250px, 1fr) auto; gap: 8px; }.cv-pdf-preview h3 { margin: 0; font-size: 13px; }.cv-pdf-preview__page { min-height: 300px; max-height: 440px; overflow: auto; display: flex; justify-content: center; align-items: flex-start; padding: 16px; border: 1px solid var(--border); background: var(--bg-surface0); }.cv-pdf-preview__page :deep(.cv-sheet) { flex: none; }.cv-pdf-preview__page small { color: var(--fg-subtext0); }.cv-pdf-preview__page p { color: var(--fg-subtext0); font-size: 12px; }
.cv-pdf-error { grid-column: 1/-1; margin: 0; color: var(--red); }.cv-pdf-success { grid-column: 1/-1; margin: 0; color: var(--green); }.cv-pdf-progress { grid-column: 1/-1; margin: 0; color: var(--fg-subtext0); }.cv-pdf-form footer { grid-column: 1/-1; display: flex; justify-content: flex-end; gap: 8px; }.cv-pdf-button { min-height: 38px; padding: 7px 14px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }.cv-pdf-button--primary { border-color: transparent; background: var(--accent); color: var(--bg-crust); }.cv-pdf-button:disabled { opacity: .55; cursor: not-allowed; }.cv-pdf-dialog :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 640px) { .cv-pdf-form { grid-template-columns: 1fr; }.cv-pdf-preview__page { min-height: 220px; }.cv-pdf-margins { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
