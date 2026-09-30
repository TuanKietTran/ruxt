<script setup lang="ts">
import referenceCvCss from "~/data/reference-cv.css?raw";
import { exportCvImages, type CvImageExportOptions, type CvImageFormat } from "~/utils/exportCvImage";
import { exportCvBundle, type CvDocumentExportFormat } from "~/utils/exportCvDocument";
import type { CodeMirrorHighlight, EditorStats, MarkdownFormat } from "@ruxt/editor/composables/useCodeMirror";
import { detectCvProfile, type CvDetectedField, type CvDocument, type CvProfileDetection, type CvTemplate } from "@core/domain/cv";
import { localProfileLabel, readLocalProfiles as loadLocalProfiles, type LocalProfile } from "~/utils/localProfiles";

const props = defineProps<{ documentId: string }>();
const documentId = props.documentId;
type SourceTab = "markdown" | "css";
const activeTab = ref<SourceTab>("markdown");
const showIndicators = ref(true);
const sourceEditor = ref<{ applyMarkdownFormat: (format: MarkdownFormat) => void; revealRange: (from: number, to?: number) => void } | null>(null);
const editorStats = ref<EditorStats>({ line: 1, column: 1, words: 0 });
const { resolvedId, markdown, css, revision, saveState, sourceId, applyDocument, isDirty } = await useCvDocument(documentId, {
    markdown: "",
    css: referenceCvCss,
});
if (resolvedId.value !== documentId) {
    await navigateTo({ path: "/", query: { s: resolvedId.value } }, { replace: true });
}
const documentTitle = computed(
    () => markdown.value.match(/^#\s+(.+)$/m)?.[1]?.replace(/\s*\{[^{}]+\}\s*$/, "").trim() || documentId,
);
useSeoMeta({
    title: () => documentTitle.value,
    ogTitle: () => documentTitle.value,
});
const formatSource = (format: MarkdownFormat) => sourceEditor.value?.applyMarkdownFormat(format);
const exportPdf = () => window.print();
const exportImage = (format: CvImageFormat, options: CvImageExportOptions) =>
    exportCvImages(
        format,
        documentTitle.value.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || documentId,
        css.value,
        options,
    );
const exportDocument = (format: CvDocumentExportFormat) =>
    exportCvBundle(format, documentTitle.value, markdown.value, css.value);
const localProfiles = ref<LocalProfile[]>([]);
const { data: templateIndex } = useNuxtData<{ templates: CvTemplate[] }>("editor-template-list");
const switchTemplates = computed(() => templateIndex.value?.templates ?? []);
const switchLayout = ref("");
const switchingProfile = ref(false);
const switchError = ref("");
const readLocalProfiles = () => {
    localProfiles.value = loadLocalProfiles().filter(profile => profile.identity.fullName.trim());
};
onMounted(() => {
    readLocalProfiles();
    window.addEventListener("focus", readLocalProfiles);
});
onBeforeUnmount(() => {
    window.removeEventListener("focus", readLocalProfiles);
    if (detectTimer) clearTimeout(detectTimer);
});

// Profile detection: highlight the profile values in the source and offer to save them.
const detecting = ref(false);
const detection = shallowRef<CvProfileDetection | null>(null);
const activeFieldPath = ref("");
let detectTimer: ReturnType<typeof setTimeout> | undefined;
const runDetection = () => {
    detectTimer = undefined;
    detection.value = detectCvProfile(markdown.value);
};
watch([detecting, markdown], ([enabled], [wasEnabled]) => {
    if (detectTimer) clearTimeout(detectTimer);
    if (!enabled) { detection.value = null; activeFieldPath.value = ""; return; }
    if (!wasEnabled) runDetection();
    else detectTimer = setTimeout(runDetection, 250);
});
const toggleDetection = () => {
    detecting.value = !detecting.value;
    if (detecting.value) activeTab.value = "markdown";
};
const sourceHighlights = computed<CodeMirrorHighlight[]>(() => activeTab.value !== "markdown" || !detection.value ? [] : detection.value.fields.flatMap(field =>
    field.ranges.map(range => ({
        ...range,
        class: `cm-profile-field--${field.section}${field.path === activeFieldPath.value ? " cm-source-highlight--active" : ""}`,
        title: `${field.section} · ${field.key}`,
    }))));
const revealField = (field: CvDetectedField) => {
    const [first] = field.ranges;
    if (!first) return;
    activeTab.value = "markdown";
    activeFieldPath.value = field.path;
    nextTick(() => sourceEditor.value?.revealRange(first.from, first.to));
};
const switchProfile = async (event: Event) => {
    const select = event.target as HTMLSelectElement;
    const profile = localProfiles.value.find(item => item.id === select.value);
    select.value = "";
    if (!profile || switchingProfile.value) return;
    if (isDirty()) { switchError.value = "Wait for the current edit to save."; return; }
    const [templateId, templateVersion] = switchLayout.value.split("@");
    switchingProfile.value = true;
    switchError.value = "";
    try {
        const result = await $fetch<{ document: CvDocument }>(`/api/cvs/${encodeURIComponent(resolvedId.value)}/profile`, {
            method: "PUT",
            body: {
                profile,
                profileId: profile.id,
                template: templateId ? { id: templateId, version: Number(templateVersion) } : undefined,
                expectedRevision: revision.value || undefined,
                sourceId: sourceId.value,
            },
        });
        applyDocument(result.document);
        await refreshNuxtData("editor-document-list");
    } catch (error: any) {
        switchError.value = error?.data?.statusMessage ?? error?.message ?? "Profile switch failed.";
    } finally {
        switchingProfile.value = false;
    }
};
const activeSource = computed({
    get: () => activeTab.value === "markdown" ? markdown.value : css.value,
    set: (value: string) => {
        if (activeTab.value === "markdown") markdown.value = value;
        else css.value = value;
    },
});
</script>

<template>
    <NuxtLayout
        name="editor"
        :title="documentTitle"
        :save-state="saveState"
        :revision="revision"
        :formatting-enabled="activeTab === 'markdown'"
        :show-indicators="showIndicators"
        :cursor-line="editorStats.line"
        :cursor-column="editorStats.column"
        :word-count="editorStats.words"
        @format="formatSource"
        @toggle-indicators="showIndicators = !showIndicators"
        @export-pdf="exportPdf"
        @export-image="exportImage"
        @export-document="exportDocument"
    >
        <template #editor-tabs>
            <button
                v-for="tab in (['markdown', 'css'] as const)"
                :key="tab"
                class="source-tab"
                :class="{ 'source-tab--active': activeTab === tab }"
                type="button"
                @click="activeTab = tab"
            >
                {{ tab === "markdown" ? "content.md" : "style.css" }}
            </button>
            <div class="profile-switch">
                <button
                    type="button"
                    class="profile-detect-toggle"
                    :class="{ 'profile-detect-toggle--active': detecting }"
                    :aria-pressed="detecting"
                    title="Highlight the profile information in this CV and save it to a profile"
                    @click="toggleDetection"
                >
                    Detect profile
                </button>
                <select v-model="switchLayout" aria-label="Layout for profile switch" :disabled="switchingProfile">
                    <option value="">Current layout</option>
                    <option v-for="template in switchTemplates" :key="`${template.id}@${template.version}`" :value="`${template.id}@${template.version}`">
                        {{ template.name }} v{{ template.version }}
                    </option>
                </select>
                <select aria-label="Switch profile" :disabled="switchingProfile || !localProfiles.length" @change="switchProfile">
                    <option value="">{{ switchingProfile ? "Switching…" : localProfiles.length ? "Switch profile…" : "No local profiles" }}</option>
                    <option v-for="profile in localProfiles" :key="profile.id" :value="profile.id">{{ localProfileLabel(profile) }}</option>
                </select>
                <span v-if="switchError" class="profile-switch__error" role="alert" :title="switchError">{{ switchError }}</span>
            </div>
        </template>

        <template #editor>
            <div class="session-source" :class="{ 'session-source--detecting': detecting }">
                <ClientOnly>
                    <CodeMirror ref="sourceEditor" v-model="activeSource" :language="activeTab" :show-indicators="showIndicators" :highlights="sourceHighlights" @update:stats="editorStats = $event" />
                </ClientOnly>
                <ClientOnly v-if="detecting">
                    <CvProfileDetectPanel :detection="detection" :active-path="activeFieldPath" @reveal="revealField" @close="detecting = false" @saved="readLocalProfiles" />
                </ClientOnly>
            </div>
        </template>

        <template #preview>
            <CodePreview :doc="markdown" :css="css" />
        </template>
    </NuxtLayout>
</template>

<style scoped>
.source-tab {
    height: 100%;
    padding: 0 14px;
    border: 0;
    background: transparent;
    color: var(--fg-subtext0);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
}
.source-tab--active {
    color: var(--fg-text);
    border-bottom: 1px solid var(--accent);
}
.profile-switch {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    padding: 0 8px;
    min-width: 0;
}
.session-source {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
}
.session-source--detecting {
    grid-template-rows: minmax(0, 1fr) minmax(160px, 42%);
}
.profile-detect-toggle {
    height: 22px;
    padding: 0 8px;
    border: 1px solid var(--border, var(--fg-subtext0));
    border-radius: 4px;
    background: transparent;
    color: var(--fg-text);
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
}
.profile-detect-toggle--active {
    border-color: var(--accent);
    color: var(--accent);
}
.profile-switch select {
    max-width: 150px;
    height: 22px;
    border: 1px solid var(--border, var(--fg-subtext0));
    border-radius: 4px;
    background: transparent;
    color: var(--fg-text);
    font: inherit;
    font-size: 12px;
}
.profile-switch__error {
    overflow: hidden;
    max-width: 180px;
    color: var(--red, #e64553);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
