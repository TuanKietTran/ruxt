<script setup lang="ts">
import referenceCvCss from "~/data/reference-cv.css?raw";
import { exportCvImages, type CvImageExportOptions, type CvImageFormat } from "~/utils/exportCvImage";
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

const editorChrome = useEditorChrome();
const commitChromeTitle = (title: string) => {
    const attr = document.value.match(/^#\s+.+?(\s*\{[^{}]+\})\s*$/m)?.[1] ?? "";
    if (/^#\s+.+$/m.test(document.value)) document.value = document.value.replace(/^#\s+.+$/m, `# ${title}${attr}`);
    else document.value = `# ${title}\n\n${document.value}`;
    writeCvNewSessionDraft({ markdown: document.value, css: stylesheet.value });
    registerDraft();
};
watchEffect(() => {
    if (sessionId.value || queryValue(route.query.t)) {
        editorChrome.clear();
        return;
    }
    editorChrome.publish({
        title: documentTitle.value,
        titleEditable: true,
        onTitleCommit: commitChromeTitle,
        saveStatus: saveState.value === "saved"
            ? { kind: "saved" as const, label: "Saved locally" }
            : saveState.value === "saving"
                ? { kind: "saving" as const, label: "Saving locally…" }
                : {
                    kind: "error" as const,
                    label: saveState.value === "conflict" ? "This session changed elsewhere; review before replacing edits." : "Could not save locally. Your edits remain in this tab and will retry automatically.",
                    onRetry: registerDraft,
                },
        actions: [],
    });
});

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
const pdf = useCvPdfExport(() => previewFrame.value);
const pdfPageCount = ref(0);
const refreshPdfPageCount = () => { pdfPageCount.value = previewFrame.value?.querySelectorAll(".cv-sheet").length ?? 0; };
watch([document, stylesheet], () => nextTick(refreshPdfPageCount), { flush: "post" });
const exportPdf = () => { refreshPdfPageCount(); pdf.clearMessages(); void pdf.hydrate(); pdfOpen.value = true; };
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
    editorChrome.clear();
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
                :aria-pressed="activeTab === 'markdown'"
                @click="activeTab = 'markdown'"
            >
                content.md
            </button>
            <button
                class="source-tab"
                :class="{ 'source-tab--active': activeTab === 'css' }"
                type="button"
                :aria-pressed="activeTab === 'css'"
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
    <CvPdfExportDialog :open="pdfOpen" :document-name="documentTitle" :preview-root="previewFrame" :page-count="pdfPageCount" :busy="pdf.busy.value" :progress="pdf.progress.value" :error="pdf.error.value" :success="pdf.success.value" :folder-label="pdf.folderLabel.value" :can-pick="pdf.canPick.value" @close="pdfOpen = false" @generate="pdf.generate" @pick="pdf.pick" @reset="pdf.reset" />
</template>
<style scoped>
.cv-export-scope { display: contents; }
</style>
