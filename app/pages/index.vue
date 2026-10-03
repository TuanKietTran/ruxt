<script setup lang="ts">
import referenceCvCss from "~/data/reference-cv.css?raw";
import { exportCvImages, type CvImageExportOptions, type CvImageFormat } from "~/utils/exportCvImage";
import type { EditorStats, MarkdownFormat } from "@ruxt/editor/composables/useCodeMirror";
import type { CvDocument } from "@core/domain/cv";

definePageMeta({ layout: false, editorContext: "cv" });

const route = useRoute();
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

const resetDraft = () => {
    if (registrationPromise) return;
    if (registrationTimer) clearTimeout(registrationTimer);
    registrationTimer = undefined;
    activeTab.value = "markdown";
    document.value = "# Untitled CV {.cv-name}\n\nStart writing your CV.\n";
    stylesheet.value = referenceCvCss;
    revision.value = 0;
    saveState.value = "saved";
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
        registrationPromise = (async () => {
            try {
                let created = await $fetch<CvDocument>("/api/cvs", {
                    method: "POST",
                    body: { id, title: "Untitled CV", ...initial, sourceId: sourceId.value },
                });
                if (document.value !== initial.markdown || stylesheet.value !== initial.css) {
                    created = await $fetch<CvDocument>(`/api/cvs/${encodeURIComponent(id)}`, {
                        method: "PUT",
                        body: {
                            markdown: document.value,
                            css: stylesheet.value,
                            expectedRevision: created.revision,
                            sourceId: sourceId.value,
                        },
                    });
                }
                revision.value = created.revision;
                saveState.value = "saved";
                await refreshNuxtData("editor-document-list");
                await navigateTo({ path: "/", query: { s: id } });
            } catch (error: any) {
                saveState.value = error?.statusCode === 409 ? "conflict" : "offline";
                registrationPromise = undefined;
            }
        })();
    }, 450);
};

const activeSource = computed({
    get: () => activeTab.value === "markdown" ? document.value : stylesheet.value,
    set: (value: string) => {
        if (activeTab.value === "markdown") document.value = value;
        else stylesheet.value = value;
        registerDraft();
    },
});

const formatSource = (format: MarkdownFormat) => sourceEditor.value?.applyMarkdownFormat(format);
const exportPdf = () => window.print();
const exportImage = (format: CvImageFormat, options: CvImageExportOptions) =>
    exportCvImages(
        format,
        `${documentTitle.value.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "CV"}-CV`,
        stylesheet.value,
        options,
    );

onBeforeUnmount(() => {
    if (registrationTimer) clearTimeout(registrationTimer);
});
</script>

<template>
    <CvSessionEditor v-if="sessionId" :key="sessionId" :document-id="sessionId" />
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
            <CodePreview :doc="document" :css="stylesheet" />
        </template>
    </NuxtLayout>
</template>
