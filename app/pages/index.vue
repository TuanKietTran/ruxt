<script setup lang="ts">
import referenceCvCss from "~/data/reference-cv.css?raw";
import { exportCvImages, type CvImageExportOptions, type CvImageFormat } from "~/utils/exportCvImage";
import { exportCvPdf, type CvPdfExportOptions } from "~/utils/exportCvDocument";
import type { EditorStats, MarkdownFormat } from "@ruxt/editor/composables/useCodeMirror";
import type { CvDocumentProps as CvDocument } from "@ruxt/shared/cv";
import { clearCvNewSessionDraft, readCvNewSessionDraft, writeCvNewSessionDraft } from "~/utils/cvSessionBackup";
import { localCvStore } from "~/utils/localCvStore";

definePageMeta({ layout: false, editorContext: "cv" });

const route = useRoute();
const sessionActions = useCvSessionActions();
const queryValue = (value: unknown) => typeof value === "string" && value ? value : undefined;
const sessionId = computed(() => queryValue(route.query.t) ? undefined : queryValue(route.query.s));

type SourceTab = "markdown" | "css";
type SaveState = "saved" | "saving" | "conflict" | "offline";
const activeTab = ref<SourceTab>("markdown");
const showIndicators = ref(true);
const sourceEditor = ref<{ applyMarkdownFormat: (format: MarkdownFormat) => void } | null>(null);
const editorStats = ref<EditorStats>({ line: 1, column: 1, words: 0 });
const document = ref("# Untitled CV {.cv-name}\n\nStart writing your CV.\n");
const stylesheet = ref(referenceCvCss);
const revision = ref(0);
const saveState = ref<SaveState>("saved");
const sourceId = ref("");
let registrationTimer: ReturnType<typeof setTimeout> | undefined;
let registrationPromise: Promise<void> | undefined;
// A refused browser write retries with backoff; the draft remains in memory and, where possible,
// in localStorage until the local session has been created.
const REGISTRATION_RETRY_DELAYS = [2_000, 5_000, 10_000, 30_000];
let registrationAttempt = 0;

const resetDraft = () => {
    if (registrationPromise) return;
    if (registrationTimer) clearTimeout(registrationTimer);
    registrationTimer = undefined;
    activeTab.value = "markdown";
    document.value = "# Untitled CV {.cv-name}\n\nStart writing your CV.\n";
    stylesheet.value = referenceCvCss;
    revision.value = 0;
    saveState.value = "saved";
    registrationAttempt = 0;
    clearCvNewSessionDraft();
};

const documentTitle = computed(
    () => document.value.match(/^#\s+(.+)$/m)?.[1]?.replace(/\s*\{[^{}]+\}\s*$/, "").trim() || "Untitled CV",
);
useSeoMeta({
    title: () => documentTitle.value,
    ogTitle: () => documentTitle.value,
});

const registerDraft = () => {
    if (!import.meta.client || registrationPromise) return;
    saveState.value = "saving";
    if (registrationTimer) clearTimeout(registrationTimer);
    registrationTimer = setTimeout(() => {
        const id = crypto.randomUUID();
        const initial = { markdown: document.value, css: stylesheet.value };
        sourceId.value ||= crypto.randomUUID();
        registrationPromise = Promise.resolve().then(async () => {
            try {
                // Sessions are browser-local: registering writes to localStorage and makes no request.
                let created: CvDocument | null = localCvStore.create({ id, title: "Untitled CV", ...initial });
                if (!created) throw new Error("Browser storage refused the write");
                if (document.value !== initial.markdown || stylesheet.value !== initial.css) {
                    created = localCvStore.save(id, { markdown: document.value, css: stylesheet.value });
                    if (!created) throw new Error("Browser storage refused the write");
                }
                revision.value = created.revision;
                saveState.value = "saved";
                sessionActions.upsertDocument(created);
                await navigateTo({ path: "/", query: { s: id } });
                clearCvNewSessionDraft();
            } catch (error: any) {
                saveState.value = error?.statusCode === 409 ? "conflict" : "offline";
                registrationPromise = undefined;
                const delay = REGISTRATION_RETRY_DELAYS[Math.min(registrationAttempt, REGISTRATION_RETRY_DELAYS.length - 1)]!;
                registrationAttempt += 1;
                registrationTimer = setTimeout(registerDraft, delay);
            } finally {
                registrationPromise = undefined;
            }
        });
    }, 450);
};
const retryRegistration = () => {
    if (registrationPromise || !readCvNewSessionDraft()) return;
    registerDraft();
};

const activeSource = computed({
    get: () => activeTab.value === "markdown" ? document.value : stylesheet.value,
    set: (value: string) => {
        if (activeTab.value === "markdown") document.value = value;
        else stylesheet.value = value;
        writeCvNewSessionDraft({ markdown: document.value, css: stylesheet.value });
        registerDraft();
    },
});

const formatSource = (format: MarkdownFormat) => sourceEditor.value?.applyMarkdownFormat(format);
const previewFrame = useTemplateRef<HTMLElement>("previewFrame");
const pdfOpen = ref(false);
const pdfBusy = ref(false);
const pdfError = ref("");
const pdfMessage = ref("");
const pdfProgress = ref("");
const pdfPageCount = ref(0);
const refreshPdfPageCount = () => { pdfPageCount.value = previewFrame.value?.querySelectorAll(".cv-sheet").length ?? 0; };
watch([document, stylesheet], () => nextTick(refreshPdfPageCount), { flush: "post" });
const exportPdf = () => { refreshPdfPageCount(); pdfError.value = ""; pdfMessage.value = ""; pdfOpen.value = true; };
const generatePdf = async (options: CvPdfExportOptions) => {
    const root = previewFrame.value;
    if (!root) { pdfError.value = "The CV preview is not ready. Wait for it to render, then retry."; return; }
    pdfBusy.value = true; pdfError.value = ""; pdfMessage.value = ""; pdfProgress.value = "Preparing rendered CV pages…";
    try {
        await exportCvPdf({ ...options, root, onProgress: (completed, total) => { pdfProgress.value = `Creating page ${completed} of ${total}…`; } });
        pdfProgress.value = ""; pdfMessage.value = "PDF downloaded. If it did not appear, check your browser downloads.";
    } catch (error) {
        pdfProgress.value = ""; pdfError.value = error instanceof Error ? error.message : "PDF export failed. Check the preview and retry.";
    } finally { pdfBusy.value = false; }
};
const exportImage = (format: CvImageFormat, options: CvImageExportOptions) =>
    exportCvImages(
        format,
        `${documentTitle.value.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "CV"}-CV`,
        stylesheet.value,
        options,
    );

onMounted(() => {
    // Only the placeholder route restores the draft; `?s=` and `?t=` render other views.
    const draft = !sessionId.value && !queryValue(route.query.t) ? readCvNewSessionDraft() : null;
    if (draft) {
        document.value = draft.markdown;
        stylesheet.value = draft.css;
        registerDraft();
    }
    window.addEventListener("online", retryRegistration);
    void nextTick(() => requestAnimationFrame(() => requestAnimationFrame(refreshPdfPageCount)));
});
onBeforeUnmount(() => {
    if (registrationTimer) clearTimeout(registrationTimer);
    window.removeEventListener("online", retryRegistration);
});
</script>

<template>
    <KeepAlive v-if="sessionId">
        <CvSessionEditor :key="sessionId" :document-id="sessionId" />
    </KeepAlive>
    <NuxtLayout
        v-else
        name="editor"
        :title="documentTitle"
        app-label="CV"
        :save-state="saveState"
        :revision="revision"
        :formatting-enabled="activeTab === 'markdown'"
        :show-indicators="showIndicators"
        :cursor-line="editorStats.line"
        :cursor-column="editorStats.column"
        :word-count="editorStats.words"
        @format="formatSource"
        @toggle-indicators="showIndicators = !showIndicators"
        @create-document="resetDraft"
        @export-pdf="exportPdf"
        @export-image="exportImage"
    >
        <template #editor-tabs>
            <button
                class="source-tab"
                :class="{ 'source-tab--active': activeTab === 'markdown' }"
                type="button"
                @click="activeTab = 'markdown'"
            >
                content.md
            </button>
            <button
                class="source-tab"
                :class="{ 'source-tab--active': activeTab === 'css' }"
                type="button"
                @click="activeTab = 'css'"
            >
                style.css
            </button>
        </template>

        <template #editor>
            <CodeMirror
                ref="sourceEditor"
                v-model="activeSource"
                :language="activeTab"
                :show-indicators="showIndicators"
                @update:stats="editorStats = $event"
            />
        </template>

        <template #preview>
            <div ref="previewFrame" class="cv-export-scope"><CodePreview :doc="document" :css="stylesheet" /></div>
        </template>
    </NuxtLayout>
    <CvPdfExportDialog :open="pdfOpen" :document-name="documentTitle" :preview-root="previewFrame" :page-count="pdfPageCount" :busy="pdfBusy" :progress="pdfProgress" :error="pdfError" :success="pdfMessage" @close="pdfOpen = false" @generate="generatePdf" />
</template>
<style scoped>
.cv-export-scope { display: contents; }
</style>
