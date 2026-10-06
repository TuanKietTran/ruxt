<script setup lang="ts">
import { computed } from "vue";
import { useTheme, type ThemeId } from "~/composables/useTheme";
import type { EditorStats } from "@ruxt/editor/composables/useCodeMirror";
import type { CvDocumentSummary, CvTemplate } from "@core/domain/cv";
import { cvSessionsToRecover, mergeCvSessions, type CvSessionBackupEntry } from "@core/domain/cv";
import { clearCvSessionBackup, listCvSessionBackups, writeCvSessionBackup } from "~/utils/cvSessionBackup";
import { hasEditorFeature, listEditorContexts, resolveEditorContext, type EditorContext, type EditorFeature } from "~/utils/editorContexts";

const props = withDefaults(
    defineProps<{
        title?: string;
        appLabel?: string;
        saveState?: "saved" | "saving" | "conflict" | "offline";
        revision?: number;
        formattingEnabled?: boolean;
        showIndicators?: boolean;
        cursorLine?: number;
        cursorColumn?: number;
        wordCount?: number;
    }>(),
    {
        title: "Untitled CV",
        appLabel: "APP",
        saveState: "saved",
        revision: 0,
        formattingEnabled: true,
        showIndicators: true,
        cursorLine: 1,
        cursorColumn: 1,
        wordCount: 0,
    },
);

const emit = defineEmits<{
    toggleSidebar: [];
    createDocument: [];
    refreshDocuments: [];
    exportPdf: [];
    exportImage: [format: "png" | "jpeg", options: { scale: number; quality: number; root: HTMLElement | null }];
    exportDocument: [format: "md" | "html" | "jsonresume" | "yaml" | "docx"];
    format: [format: "bold" | "italic" | "link" | "heading" | "quote" | "bullet" | "code"];
    toggleIndicators: [];
}>();

const route = useRoute();
// The page picks its registered context; everything context-specific below reads from it.
const editorContext = computed(() => resolveEditorContext(route.meta.editorContext));
const editorContexts = listEditorContexts();
const hasFeature = (feature: EditorFeature) => hasEditorFeature(editorContext.value, feature);

/** Last location per context, so the activity bar returns to where each context was left. */
const lastRoutes = useState<Record<string, string>>("editor:last-routes", () => ({}));
const lastRouteKey = (id: string) => `cv-sv:last-route:${id}`;
/** Keys used before contexts were registered; still read so an open tab keeps its place across a deploy. */
const legacyLastRouteKeys: Record<string, string> = { cv: "cv-sv:last-cv-route", profiles: "cv-sv:last-profile-route" };
const contextRoute = (context: EditorContext) => lastRoutes.value[context.id] ?? context.home;

watch(
    () => route.fullPath,
    (fullPath) => {
        lastRoutes.value = { ...lastRoutes.value, [editorContext.value.id]: fullPath };
        if (import.meta.client) sessionStorage.setItem(lastRouteKey(editorContext.value.id), fullPath);
    },
    { immediate: true },
);

const { current, themes, apply } = useTheme();
const { user, logout } = useAppAuth();
const { authenticated } = useFeatureFlags();
const { openAuthDialog } = useAuthDialog();
// Lazy: slow catalog requests must not block first render or navigation; the sidebar shows skeletons meanwhile.
const { data: cvIndex, refresh: reloadCvDocuments, status: cvIndexStatus } = useFetch<{ documents: CvDocumentSummary[] }>("/api/cvs", {
    key: "editor-document-list",
    lazy: true,
});
const sessionsLoading = computed(() => !cvIndex.value && cvIndexStatus.value !== "error");
// The sidebar lists what this browser has backed up as well as what the server returns, so a deployment
// whose storage misses a session never hides it. Backups are read after mount to keep hydration stable.
const localBackups = ref<CvSessionBackupEntry[]>([]);
const sessions = computed(() => mergeCvSessions(cvIndex.value?.documents ?? [], localBackups.value));
const recovering = new Set<string>();
/** Re-create sessions this browser has but the server does not, from their local backups. */
const recoverLocalSessions = async () => {
    if (!import.meta.client) return;
    localBackups.value = listCvSessionBackups();
    const server = cvIndex.value?.documents;
    if (!server) return;
    const openId = routeQueryValue(route.query.s);
    // The open session's editor restores itself; racing it here would only cause a duplicate create.
    const missing = cvSessionsToRecover(server, localBackups.value)
        .filter(backup => backup.id !== openId && !recovering.has(backup.id));
    if (!missing.length) return;
    let recovered = false;
    await Promise.all(missing.map(async (backup) => {
        recovering.add(backup.id);
        try {
            const created = await $fetch<CvDocumentSummary>("/api/cvs", {
                method: "POST",
                body: { id: backup.id, title: backup.title, markdown: backup.markdown, css: backup.css },
            });
            writeCvSessionBackup(backup.id, { ...backup, revision: created.revision, pending: false });
            recovered = true;
        } catch (error: any) {
            // 409: another tab or the editor re-created it first.
            if (error?.statusCode === 409) recovered = true;
        } finally {
            recovering.delete(backup.id);
        }
    }));
    if (recovered) {
        await reloadCvDocuments();
        localBackups.value = listCvSessionBackups();
    }
};
watch(() => cvIndex.value?.documents, () => { void recoverLocalSessions(); });
const templateCatalogUrl = computed(() => user.value ? "/api/cv-templates" : "/api/public/templates");
const { data: templateIndex, refresh: reloadCvTemplates, status: templateStatus } = useFetch<{ templates: CvTemplate[] }>(templateCatalogUrl, {
    key: "editor-template-list",
    lazy: true,
});
const templatesLoading = computed(() => !templateIndex.value && templateStatus.value !== "error");
const cvTemplates = computed(() => templateIndex.value?.templates ?? []);
const selectedTemplate = ref<CvTemplate | null>(null);
const templateSourceTab = ref<"markdown" | "css">("markdown");
const showTemplateIndicators = ref(true);
const templateStats = ref<EditorStats>({ line: 1, column: 1, words: 0 });
// The layout owns the template editor, so its status must come from that view rather than the page.
const statusStats = computed<EditorStats>(() =>
    selectedTemplate.value
        ? templateStats.value
        : { line: props.cursorLine, column: props.cursorColumn, words: props.wordCount },
);
const isCloningTemplate = ref(false);
const sourceFormattingEnabled = computed(() => props.formattingEnabled && !selectedTemplate.value);
const indicatorsVisible = computed(() => selectedTemplate.value ? showTemplateIndicators.value : props.showIndicators);
const toggleIndicators = () => {
    if (selectedTemplate.value) showTemplateIndicators.value = !showTemplateIndicators.value;
    else emit("toggleIndicators");
};
const templateRoute = (template: Pick<CvTemplate, "id" | "version">) => ({
    path: "/",
    query: { t: template.id, v: String(template.version) },
});
const viewTemplate = async (template: CvTemplate) => {
    selectedTemplate.value = template;
    templateSourceTab.value = "markdown";
    operationError.value = "";
    await navigateTo(templateRoute(template));
};
const cloneTemplateToLocal = async () => {
    if (!selectedTemplate.value || isCloningTemplate.value) return;
    isCloningTemplate.value = true;
    operationError.value = "";
    try {
        const source = selectedTemplate.value;
        const base = source.id.slice(0, 48).replace(/[^a-zA-Z0-9_-]/g, "-");
        selectedTemplate.value = await $fetch<CvTemplate>(`/api/cv-templates/${encodeURIComponent(source.id)}/clone`, {
            method: "POST",
            body: { version: source.version, newId: `${base}-local-${crypto.randomUUID().slice(0, 8)}` },
        });
        await reloadCvTemplates();
        await navigateTo(templateRoute(selectedTemplate.value));
    } catch (error: any) {
        operationError.value = error?.data?.statusMessage ?? error?.message ?? "Template clone failed.";
    } finally {
        isCloningTemplate.value = false;
    }
};
const documentLabel = (document: CvDocumentSummary | string) => {
    if (typeof document !== "string" && document.title?.trim()) return document.title;
    const id = typeof document === "string" ? document : document.id;
    return id === "master" ? "Current CV" : id.replaceAll("-", " ").replace(/\b\w/g, character => character.toUpperCase());
};
const documentPath = (id: string) => ({ path: "/", query: { s: id } });
const routeQueryValue = (value: unknown) => typeof value === "string" && value ? value : undefined;
const isActiveDocument = (id: string) => !routeQueryValue(route.query.t) && routeQueryValue(route.query.s) === id;
const createSession = async () => {
    operationError.value = "";
    selectedTemplate.value = null;
    emit("createDocument");
    await navigateTo("/");
};
const refreshDocuments = async () => {
    await reloadCvDocuments();
    emit("refreshDocuments");
};
const contextMenu = ref<{ x: number; y: number; document: CvDocumentSummary } | null>(null);
const renameDocument = ref<CvDocumentSummary | null>(null);
const renameValue = ref("");
const operationError = ref("");
const openDocumentMenu = (event: MouseEvent, document: CvDocumentSummary) => {
    contextMenu.value = { x: Math.min(event.clientX, window.innerWidth - 170), y: Math.min(event.clientY, window.innerHeight - 126), document };
};
const startRename = () => {
    if (!contextMenu.value) return;
    renameDocument.value = contextMenu.value.document;
    renameValue.value = documentLabel(renameDocument.value);
    operationError.value = "";
    contextMenu.value = null;
};
const confirmRename = async () => {
    if (!renameDocument.value) return;
    if (!renameValue.value.trim()) { operationError.value = "Enter a valid name."; return; }
    try {
        const id = renameDocument.value.id;
        await $fetch(`/api/cvs/${encodeURIComponent(id)}`, { method: "PATCH", body: { title: renameValue.value.trim() } });
        renameDocument.value = null;
        await reloadCvDocuments();
    } catch (error: any) {
        operationError.value = error?.data?.statusMessage ?? error?.message ?? "Rename failed.";
    }
};
const forkSelectedDocument = async () => {
    if (!contextMenu.value) return;
    const source = contextMenu.value.document;
    contextMenu.value = null;
    const nextId = crypto.randomUUID();
    await $fetch(`/api/cvs/${encodeURIComponent(source.id)}/fork`, {
        method: "POST",
        body: { id: nextId, title: `${documentLabel(source)} Copy` },
    });
    await reloadCvDocuments();
    await navigateTo(documentPath(nextId));
};
const deleteSelectedDocument = async () => {
    if (!contextMenu.value) return;
    const selected = contextMenu.value.document;
    contextMenu.value = null;
    if (!window.confirm(`Delete ${documentLabel(selected)}? This cannot be undone.`)) return;
    try {
        await $fetch(`/api/cvs/${encodeURIComponent(selected.id)}`, { method: "DELETE" });
    } catch (error: any) {
        // A session that only exists in this browser has nothing to delete on the server.
        if (error?.statusCode !== 404) throw error;
    }
    clearCvSessionBackup(selected.id);
    await reloadCvDocuments();
    localBackups.value = listCvSessionBackups();
    if (isActiveDocument(selected.id)) await navigateTo("/");
};
watch(
    [cvTemplates, () => route.query.t, () => route.query.v, editorContext],
    ([templates, templateQuery, version]) => {
        const id = hasFeature("templates") ? routeQueryValue(templateQuery) : undefined;
        if (!id) {
            selectedTemplate.value = null;
            return;
        }
        const requestedVersion = Number(version);
        selectedTemplate.value = templates.find(template =>
            template.id === id && (!Number.isInteger(requestedVersion) || template.version === requestedVersion),
        ) ?? null;
        // Links to templates outside the catalog (removed, or internal like pipeline-default) fall back home.
        if (!selectedTemplate.value && templateIndex.value && import.meta.client) navigateTo("/", { replace: true });
    },
    { immediate: true },
);

const closeTemplate = async () => {
    selectedTemplate.value = null;
    await navigateTo("/");
};

const activeSessionTitle = computed(() => {
    if (routeQueryValue(route.query.t)) return undefined;
    const id = routeQueryValue(route.query.s);
    return id ? sessions.value.find(document => document.id === id)?.title : undefined;
});
const editorTitle = computed(
    () => selectedTemplate.value?.name
        ?? activeSessionTitle.value
        ?? (route.meta.editorTitle as string | undefined)
        ?? props.title,
);

const workspace = useTemplateRef<HTMLElement>("workspace");
const previewCanvas = useTemplateRef<HTMLElement>("previewCanvas");
const previewContent = useTemplateRef<HTMLElement>("previewContent");
const sourceWidth = ref(46);
const isResizing = ref(false);
const isSidebarOpen = ref(true);
const sidebarWidth = ref(232);
const isSidebarResizing = ref(false);
const previewZoom = ref(100);
const isFitZoom = ref(false);
const pageCount = ref(1);
const isExportOpen = ref(false);
const isImportOpen = ref(false);
const exportFormat = ref<"pdf" | "png" | "jpeg" | "md" | "html" | "jsonresume" | "yaml" | "docx">("pdf");
const exportFormatLabels: Record<typeof exportFormat.value, string> = {
    pdf: "PDF", png: "PNG", jpeg: "JPEG", md: "MD + CSS", html: "HTML", jsonresume: "JSON Resume", yaml: "YAML", docx: "DOCX",
};
const exportScale = ref(2);
const exportQuality = ref(95);
const runExport = async () => {
    isExportOpen.value = false;
    await nextTick();
    if (exportFormat.value === "pdf") emit("exportPdf");
    else if (exportFormat.value === "png" || exportFormat.value === "jpeg") {
        emit("exportImage", exportFormat.value, {
            scale: exportScale.value,
            quality: exportQuality.value / 100,
            root: previewContent.value,
        });
    } else {
        emit("exportDocument", exportFormat.value);
    }
};
let previewObserver: MutationObserver | undefined;
let canvasObserver: ResizeObserver | undefined;

const layoutStyle = computed(() => ({
    "--sidebar-width": `${sidebarWidth.value}px`,
}));
const workspaceStyle = computed(() => ({
    "--source-width": `${sourceWidth.value}%`,
    "--preview-zoom": String(previewZoom.value / 100),
}));

// Below 900px the sidebar is an overlay drawer for every context, so pages never build their own
// narrow-screen navigation. Its open state is separate from the persisted desktop sidebar state.
const COMPACT_QUERY = "(max-width: 900px)";
const isCompact = ref(false);
const isDrawerOpen = ref(false);
const sidebarExpanded = computed(() => isCompact.value ? isDrawerOpen.value : isSidebarOpen.value);
let compactMedia: MediaQueryList | undefined;
const syncCompact = () => {
    isCompact.value = Boolean(compactMedia?.matches);
    if (!isCompact.value) isDrawerOpen.value = false;
};
const closeDrawer = () => { isDrawerOpen.value = false; };
/** Choosing something in the drawer (a link or button) closes it so the workspace is visible again. */
const closeDrawerAfterChoice = (event: MouseEvent) => {
    if (isCompact.value && (event.target as HTMLElement | null)?.closest("a, button, [role='button']")) closeDrawer();
};
watch(() => route.fullPath, closeDrawer);

const toggleSidebar = () => {
    if (isCompact.value) {
        isDrawerOpen.value = !isDrawerOpen.value;
    } else {
        isSidebarOpen.value = !isSidebarOpen.value;
        localStorage.setItem("editor-sidebar-open", String(isSidebarOpen.value));
    }
    emit("toggleSidebar");
};

const resizeSidebarToPointer = (event: PointerEvent) => {
    sidebarWidth.value = Math.min(420, Math.max(160, event.clientX - 46));
};

const startSidebarResize = (event: PointerEvent) => {
    isSidebarResizing.value = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    resizeSidebarToPointer(event);
};

const stopSidebarResize = (event: PointerEvent) => {
    isSidebarResizing.value = false;
    localStorage.setItem("editor-sidebar-width", String(Math.round(sidebarWidth.value)));
    const divider = event.currentTarget as HTMLElement;
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
};

const resizeSidebarWithKeyboard = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    sidebarWidth.value = Math.min(420, Math.max(160, sidebarWidth.value + (event.key === "ArrowLeft" ? -16 : 16)));
    localStorage.setItem("editor-sidebar-width", String(sidebarWidth.value));
};

const resetSidebarWidth = () => {
    sidebarWidth.value = 232;
    localStorage.setItem("editor-sidebar-width", "232");
};

const formatFromSelect = (event: Event) => {
    const select = event.target as HTMLSelectElement;
    if (select.value && sourceFormattingEnabled.value) emit("format", select.value as "heading" | "quote" | "bullet" | "code");
    select.value = "";
};

const setZoom = (zoom: number) => {
    isFitZoom.value = false;
    previewZoom.value = Math.min(200, Math.max(25, Math.round(zoom / 10) * 10));
};

const fitPreview = async () => {
    isFitZoom.value = true;
    previewZoom.value = 100;
    await nextTick();
    const canvas = previewCanvas.value;
    const sheet = previewContent.value?.querySelector<HTMLElement>(".cv-sheet");
    if (!canvas || !sheet) return;
    const availableWidth = canvas.clientWidth - 56;
    const availableHeight = canvas.clientHeight - 56;
    previewZoom.value = Math.max(25, Math.min(200, Math.floor(Math.min(
        availableWidth / sheet.offsetWidth,
        availableHeight / sheet.offsetHeight,
    ) * 100)));
};

const updatePageCount = () => {
    pageCount.value = Math.max(1, previewContent.value?.querySelectorAll(".cv-sheet").length ?? 0);
};

onMounted(() => {
    void recoverLocalSessions();
    window.addEventListener("click", closeDocumentMenu);
    window.addEventListener("blur", closeDocumentMenu);

    for (const context of editorContexts) {
        if (context.id === editorContext.value.id) continue;
        const legacyKey = legacyLastRouteKeys[context.id];
        const cached = sessionStorage.getItem(lastRouteKey(context.id)) ?? (legacyKey ? sessionStorage.getItem(legacyKey) : null);
        if (cached?.startsWith("/")) lastRoutes.value = { ...lastRoutes.value, [context.id]: cached };
    }

    compactMedia = window.matchMedia(COMPACT_QUERY);
    compactMedia.addEventListener("change", syncCompact);
    syncCompact();
    isSidebarOpen.value = localStorage.getItem("editor-sidebar-open") !== "false";
    const savedWidth = Number(localStorage.getItem("editor-sidebar-width"));
    if (Number.isFinite(savedWidth) && savedWidth >= 160 && savedWidth <= 420) sidebarWidth.value = savedWidth;
    updatePageCount();
    if (previewContent.value) {
        previewObserver = new MutationObserver(updatePageCount);
        previewObserver.observe(previewContent.value, { childList: true, subtree: true });
    }
    if (previewCanvas.value) {
        canvasObserver = new ResizeObserver(() => { if (isFitZoom.value) void fitPreview(); });
        canvasObserver.observe(previewCanvas.value);
    }
});

const closeDocumentMenu = () => { contextMenu.value = null; };

onBeforeUnmount(() => {
    compactMedia?.removeEventListener("change", syncCompact);
    window.removeEventListener("click", closeDocumentMenu);
    window.removeEventListener("blur", closeDocumentMenu);
    previewObserver?.disconnect();
    canvasObserver?.disconnect();
});

const resizeToPointer = (event: PointerEvent) => {
    const bounds = workspace.value?.getBoundingClientRect();
    if (!bounds) return;

    const minimumPaneWidth = Math.min(320, bounds.width * 0.35);
    const nextWidth = Math.min(
        bounds.width - minimumPaneWidth,
        Math.max(minimumPaneWidth, event.clientX - bounds.left),
    );

    sourceWidth.value = (nextWidth / bounds.width) * 100;
};

const startResize = (event: PointerEvent) => {
    isResizing.value = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    resizeToPointer(event);
};

const stopResize = (event: PointerEvent) => {
    isResizing.value = false;
    const divider = event.currentTarget as HTMLElement;
    if (divider.hasPointerCapture(event.pointerId)) {
        divider.releasePointerCapture(event.pointerId);
    }
};

const resizeWithKeyboard = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    sourceWidth.value = Math.min(
        70,
        Math.max(30, sourceWidth.value + (event.key === "ArrowLeft" ? -2 : 2)),
    );
};

const handleImportCommitted = async (documentId: string) => {
    isImportOpen.value = false;
    await reloadCvDocuments();
    await navigateTo(documentPath(documentId));
};

const handleLogout = async () => {
    await logout();
};
</script>

<template>
    <div
        class="editor-layout"
        :class="{ 'editor-layout--sidebar-closed': !isSidebarOpen, 'editor-layout--resizing': isSidebarResizing, 'editor-layout--drawer-open': isDrawerOpen }"
        :style="layoutStyle"
        @keydown.esc="closeDrawer"
    >
        <header class="editor-header">
            <section class="editor-header__identity">
                <button
                    class="icon-button"
                    :class="{ 'icon-button--active': sidebarExpanded }"
                    type="button"
                    aria-label="Toggle sidebar"
                    aria-controls="main-aside"
                    :aria-expanded="sidebarExpanded"
                    @click="toggleSidebar"
                >
                    <img class="editor-brand-icon" src="/favicon.ico" alt="" aria-hidden="true">
                </button>
                <strong class="editor-title">{{ editorTitle }}</strong>
                <span class="app-badge">{{ appLabel }}</span>
            </section>

            <nav v-if="hasFeature('formatting')" class="editor-header__tools" aria-label="Editor tools">
                <button class="tool-button" type="button" aria-label="Bold" :disabled="!sourceFormattingEnabled" @click="emit('format', 'bold')">
                    <strong>B</strong>
                </button>
                <button class="tool-button" type="button" aria-label="Italic" :disabled="!sourceFormattingEnabled" @click="emit('format', 'italic')">
                    <em>I</em>
                </button>
                <button class="tool-button" type="button" aria-label="Insert link" :disabled="!sourceFormattingEnabled" @click="emit('format', 'link')">
                    ↗
                </button>
                <select
                    class="format-select"
                    aria-label="More formatting tools"
                    :disabled="!sourceFormattingEnabled"
                    value=""
                    @change="formatFromSelect"
                >
                    <option value="" disabled>More</option>
                    <option value="heading">Heading</option>
                    <option value="quote">Quote</option>
                    <option value="bullet">Bullet list</option>
                    <option value="code">Inline code</option>
                </select>
                <button
                    class="tool-button tool-button--indicator"
                    type="button"
                    :class="{ 'tool-button--active': indicatorsVisible }"
                    :aria-pressed="indicatorsVisible"
                    aria-label="Toggle Markdown indicators"
                    @click="toggleIndicators"
                >
                    {·}
                </button>
            </nav>

            <section class="editor-header__actions">
                <div v-if="selectedTemplate" class="template-header-actions">
                    <span class="template-readonly-label">READ ONLY · {{ selectedTemplate.tags.join(" · ") }}</span>
                    <button
                        v-if="authenticated && selectedTemplate.tags.includes('public')"
                        class="template-clone-button"
                        type="button"
                        :disabled="isCloningTemplate"
                        @click="cloneTemplateToLocal"
                    >
                        {{ isCloningTemplate ? "Cloning…" : "Clone to local" }}
                    </button>
                    <button class="template-back-button" type="button" @click="closeTemplate">Back to CV</button>
                </div>
                <button v-if="authenticated && hasFeature('import')" class="header-button" type="button" @click="isImportOpen = true">Import</button>
                <button v-if="hasFeature('export')" class="header-button header-button--primary" type="button" @click="isExportOpen = true">Export</button>
                <select
                    class="theme-select"
                    :value="current"
                    aria-label="Select theme"
                    @change="apply(($event.target as HTMLSelectElement).value as ThemeId)"
                >
                    <option v-for="theme in themes" :key="theme.id" :value="theme.id">
                        {{ theme.label }}
                    </option>
                </select>
            </section>
        </header>

        <nav class="activity-bar" aria-label="Primary navigation">
            <div class="activity-bar__top">
                <NuxtLink
                    v-for="context in editorContexts"
                    :key="context.id"
                    class="activity-button"
                    :class="{ 'activity-button--active': context.id === editorContext.id }"
                    :to="contextRoute(context)"
                    :aria-label="context.label"
                    :aria-current="context.id === editorContext.id ? 'page' : undefined"
                ><AppIcon :name="context.icon" /></NuxtLink>
            </div>

            <div class="activity-bar__bottom">
                <NuxtLink class="activity-button" to="/about" aria-label="Help"><AppIcon name="lucide:circle-help" /></NuxtLink>
                <NuxtLink class="activity-button" to="/settings" aria-label="Settings"><AppIcon name="lucide:settings" /></NuxtLink>
                <template v-if="authenticated">
                    <button
                        v-if="user"
                        class="activity-button"
                        type="button"
                        :aria-label="`Sign out ${user.email}`"
                        @click="handleLogout"
                    >
                        <AppIcon name="lucide:circle-user-round" />
                    </button>
                    <button v-else class="activity-button" type="button" aria-label="Sign in or create account" @click="openAuthDialog('login')"><AppIcon name="lucide:log-in" /></button>
                </template>
            </div>
        </nav>

        <div v-if="isDrawerOpen" class="sidebar-backdrop" aria-hidden="true" @click="closeDrawer" />
        <aside id="main-aside" class="document-sidebar" @click="closeDrawerAfterChoice">
            <slot name="sidebar">
            <nav class="document-tree" aria-label="CV sessions">
                <section class="document-group">
                    <header class="document-group__header">
                        <h2>Sessions</h2>
                        <div>
                            <button type="button" aria-label="New session" @click="createSession">＋</button>
                            <button type="button" aria-label="Refresh sessions" @click="refreshDocuments">↻</button>
                        </div>
                    </header>
                    <div v-if="sessionsLoading" class="document-tree__skeleton" role="status" aria-label="Loading sessions">
                        <span v-for="n in 3" :key="n" />
                    </div>
                    <p v-else-if="!sessions.length" class="document-tree__empty">No sessions yet</p>
                    <NuxtLink
                        v-for="document in sessions"
                        :key="document.id"
                        class="document-tree__item"
                        :class="{ 'document-tree__item--active': isActiveDocument(document.id) }"
                        :to="documentPath(document.id)"
                        @contextmenu.prevent="openDocumentMenu($event, document)"
                    >
                        <span>{{ documentLabel(document) }}</span>
                        <small v-if="'localOnly' in document" title="Only in this browser so far; restoring it to the server">local</small>
                        <small v-else>r{{ document.revision }}</small>
                    </NuxtLink>
                </section>
                <section class="document-group template-group">
                    <header class="document-group__header">
                        <h2>Templates</h2>
                    </header>
                    <div v-if="templatesLoading" class="document-tree__skeleton" role="status" aria-label="Loading templates">
                        <span v-for="n in 3" :key="n" />
                    </div>
                    <p v-else-if="!cvTemplates.length" class="document-tree__empty">No templates available</p>
                    <button
                        v-for="cvTemplate in cvTemplates"
                        :key="`${cvTemplate.id}:${cvTemplate.version}`"
                        class="document-tree__item template-tree__item"
                        :class="{ 'document-tree__item--active': selectedTemplate?.id === cvTemplate.id && selectedTemplate?.version === cvTemplate.version }"
                        type="button"
                        @click="viewTemplate(cvTemplate)"
                    >
                        <span>{{ cvTemplate.name }}</span>
                        <small>{{ cvTemplate.tags.join(" · ") }} · v{{ cvTemplate.version }}</small>
                    </button>
                </section>
            </nav>
            </slot>
        </aside>

        <div
            v-show="isSidebarOpen"
            class="sidebar-divider"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize document sidebar"
            aria-valuemin="160"
            aria-valuemax="420"
            :aria-valuenow="Math.round(sidebarWidth)"
            tabindex="0"
            @pointerdown="startSidebarResize"
            @pointermove="isSidebarResizing && resizeSidebarToPointer($event)"
            @pointerup="stopSidebarResize"
            @pointercancel="stopSidebarResize"
            @keydown="resizeSidebarWithKeyboard"
            @dblclick="resetSidebarWidth"
        />

        <!-- The layout owns the split; pages only provide editor and preview content. -->
        <main
            id="main-editor"
            ref="workspace"
            class="editor-workspace"
            :class="{ 'editor-workspace--resizing': isResizing, 'editor-workspace--page': $slots.workspace }"
            :style="workspaceStyle"
        >
            <slot v-if="$slots.workspace" name="workspace" />

            <p v-else-if="templatesLoading && routeQueryValue(route.query.t)" class="workspace-loading" role="status">Loading template…</p>

            <template v-else-if="selectedTemplate">
                <section class="source-pane" aria-label="Read-only template source">
                    <nav class="source-tabs" aria-label="Template files">
                        <button class="source-tab" :class="{ 'source-tab--active': templateSourceTab === 'markdown' }" type="button" @click="templateSourceTab = 'markdown'">content.md</button>
                        <button class="source-tab" :class="{ 'source-tab--active': templateSourceTab === 'css' }" type="button" @click="templateSourceTab = 'css'">style.css</button>
                    </nav>
                    <div class="source-editor">
                        <CodeMirror
                            :model-value="templateSourceTab === 'markdown' ? selectedTemplate.markdownSkeleton : selectedTemplate.css"
                            :language="templateSourceTab"
                            :show-indicators="showTemplateIndicators"
                            read-only
                            @update:stats="templateStats = $event"
                        />
                    </div>
                    <p v-if="operationError" class="template-inline-error">{{ operationError }}</p>
                </section>

                <div
                    class="workspace-divider"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize template source and preview"
                    aria-valuemin="30"
                    aria-valuemax="70"
                    :aria-valuenow="Math.round(sourceWidth)"
                    tabindex="0"
                    @pointerdown="startResize"
                    @pointermove="isResizing && resizeToPointer($event)"
                    @pointerup="stopResize"
                    @pointercancel="stopResize"
                    @keydown="resizeWithKeyboard"
                    @dblclick="sourceWidth = 46"
                />

                <section class="preview-pane" aria-label="Read-only template preview">
                    <header class="preview-toolbar">
                        <div class="preview-toolbar__group">
                            <button type="button" aria-label="Zoom out" :disabled="previewZoom <= 25" @click="setZoom(previewZoom - 10)">−</button>
                            <button class="zoom-value" type="button" aria-label="Reset zoom" @click="setZoom(100)">{{ previewZoom }}%</button>
                            <button type="button" aria-label="Zoom in" :disabled="previewZoom >= 200" @click="setZoom(previewZoom + 10)">＋</button>
                            <button type="button" :class="{ 'preview-tool--active': isFitZoom }" :aria-pressed="isFitZoom" @click="fitPreview">Fit</button>
                        </div>
                        <span>Read only · v{{ selectedTemplate.version }}</span>
                    </header>
                    <div ref="previewCanvas" class="preview-canvas">
                        <article ref="previewContent" class="preview-page">
                            <CodePreview :doc="selectedTemplate.markdownSkeleton" :css="selectedTemplate.css" />
                        </article>
                    </div>
                </section>
            </template>

            <template v-else>
            <section class="source-pane" aria-label="CV source editor">
                <nav class="source-tabs" aria-label="Document files">
                    <slot name="editor-tabs">
                        <button class="source-tab source-tab--active" type="button">content.md</button>
                        <button class="source-tab" type="button">style.css</button>
                    </slot>
                </nav>

                <div class="source-editor">
                    <slot name="editor">
                        <slot />
                    </slot>
                </div>
            </section>

            <div
                class="workspace-divider"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize editor and preview"
                aria-valuemin="30"
                aria-valuemax="70"
                :aria-valuenow="Math.round(sourceWidth)"
                tabindex="0"
                @pointerdown="startResize"
                @pointermove="isResizing && resizeToPointer($event)"
                @pointerup="stopResize"
                @pointercancel="stopResize"
                @keydown="resizeWithKeyboard"
                @dblclick="sourceWidth = 46"
            />

            <section class="preview-pane" aria-label="CV preview">
                <header class="preview-toolbar">
                    <div class="preview-toolbar__group">
                        <button type="button" aria-label="Zoom out" :disabled="previewZoom <= 25" @click="setZoom(previewZoom - 10)">−</button>
                        <button class="zoom-value" type="button" aria-label="Reset zoom" @click="setZoom(100)">{{ previewZoom }}%</button>
                        <button type="button" aria-label="Zoom in" :disabled="previewZoom >= 200" @click="setZoom(previewZoom + 10)">＋</button>
                        <button type="button" :class="{ 'preview-tool--active': isFitZoom }" :aria-pressed="isFitZoom" @click="fitPreview">Fit</button>
                    </div>
                    <span>{{ pageCount }} {{ pageCount === 1 ? 'page' : 'pages' }}</span>
                </header>

                <div ref="previewCanvas" class="preview-canvas">
                    <article ref="previewContent" class="preview-page">
                        <slot name="preview" />
                    </article>
                </div>
            </section>
            </template>
        </main>


        <Teleport to="body">
            <CvImportDialog v-if="isImportOpen" @close="isImportOpen = false" @committed="handleImportCommitted" />
            <nav
                v-if="contextMenu"
                class="document-context-menu"
                :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
                aria-label="Session actions"
                @click.stop
            >
                <button type="button" @click="startRename">Rename</button>
                <button type="button" @click="forkSelectedDocument">Fork</button>
                <button class="document-context-menu__danger" type="button" @click="deleteSelectedDocument">Delete</button>
            </nav>
            <div v-if="renameDocument" class="export-dialog-backdrop" @click.self="renameDocument = null">
                <section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-dialog-title" @keydown.esc="renameDocument = null">
                    <header><div><h2 id="rename-dialog-title">Rename session</h2><p>Choose a unique session name.</p></div><button type="button" aria-label="Close rename dialog" @click="renameDocument = null">×</button></header>
                    <label>Session name<input v-model="renameValue" autofocus @keydown.enter="confirmRename"></label>
                    <p v-if="operationError" class="operation-error">{{ operationError }}</p>
                    <footer><button type="button" @click="renameDocument = null">Cancel</button><button class="export-dialog__submit" type="button" @click="confirmRename">Rename</button></footer>
                </section>
            </div>
            <div v-if="isExportOpen" class="export-dialog-backdrop" @click.self="isExportOpen = false">
                <section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" @keydown.esc="isExportOpen = false">
                    <header>
                        <div><h2 id="export-dialog-title">Export CV</h2><p>Configure the output for this document.</p></div>
                        <button type="button" aria-label="Close export dialog" @click="isExportOpen = false">×</button>
                    </header>
                    <label>Format
                        <select v-model="exportFormat" autofocus>
                            <option value="pdf">PDF</option>
                            <option value="png">PNG</option>
                            <option value="jpeg">JPEG</option>
                            <option value="md">Markdown + CSS</option>
                            <option value="html">HTML</option>
                            <option value="jsonresume">JSON Resume</option>
                            <option value="yaml">YAML</option>
                            <option value="docx">DOCX</option>
                        </select>
                    </label>
                    <template v-if="exportFormat === 'png' || exportFormat === 'jpeg'">
                        <label>Resolution
                            <select v-model.number="exportScale">
                                <option :value="1">1×</option><option :value="2">2×</option><option :value="3">3×</option>
                            </select>
                        </label>
                        <label v-if="exportFormat === 'jpeg'">Quality
                            <input v-model.number="exportQuality" type="range" min="50" max="100" step="5">
                            <span>{{ exportQuality }}%</span>
                        </label>
                    </template>
                    <p v-else-if="exportFormat === 'pdf'" class="export-dialog__hint">A4 PDF uses the browser print pipeline.</p>
                    <p v-else class="export-dialog__hint">Downloads a ready-to-use {{ exportFormatLabels[exportFormat] }} file.</p>
                    <footer><button type="button" @click="isExportOpen = false">Cancel</button><button class="export-dialog__submit" type="button" @click="runExport">Export {{ exportFormatLabels[exportFormat] }}</button></footer>
                </section>
            </div>
        </Teleport>

        <footer class="editor-statusbar">
            <div class="editor-statusbar__left">
                <template v-if="hasFeature('documentStats')">
                    <span class="save-state" :class="`save-state--${saveState}`">{{ saveState }}</span>
                    <span v-if="revision">rev {{ revision }}</span>
                    <span>Ln {{ statusStats.line }}, Col {{ statusStats.column }}</span>
                    <span>{{ statusStats.words }} {{ statusStats.words === 1 ? 'word' : 'words' }}</span>
                    <span>{{ pageCount }} {{ pageCount === 1 ? 'page' : 'pages' }}</span>
                    <span>A4</span>
                </template>
            </div>
            <span class="editor-statusbar__context">app:{{ editorTitle.toLowerCase().replaceAll(" ", "-") }}</span>
        </footer>
    </div>
</template>

<style scoped>
.editor-layout {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    grid-template:
        "header header header header" 42px
        "activity sidebar sidebar-divider workspace" minmax(0, 1fr)
        "activity sidebar sidebar-divider status" 24px
        / 46px var(--sidebar-width, 232px) 5px minmax(0, 1fr);
    width: 100vw;
    height: 100dvh;
    overflow: hidden;
    background: var(--bg-base);
    color: var(--fg-text);
}

.editor-layout--sidebar-closed {
    grid-template-columns: 46px 0 0 minmax(0, 1fr);
}

.editor-layout--sidebar-closed .document-sidebar {
    display: none;
}

button,
select {
    font: inherit;
}

button {
    color: inherit;
}

.editor-header {
    grid-area: header;
    display: grid;
    grid-template-columns: minmax(278px, auto) 1fr auto;
    align-items: center;
    min-width: 0;
    background: var(--bg-mantle);
    border-bottom: 1px solid var(--border);
}

.editor-header__identity,
.editor-header__tools,
.editor-header__actions {
    display: flex;
    align-items: center;
    height: 100%;
}

.editor-header__identity {
    gap: 9px;
    padding: 0 10px 0 6px;
}

.editor-header__tools {
    gap: 2px;
    padding-left: 8px;
    border-left: 1px solid var(--border);
}

.editor-header__actions {
    grid-column: 3;
    justify-self: end;
    gap: 6px;
    padding: 0 8px;
}

.template-header-actions {
    display: flex;
    align-items: center;
    align-self: stretch;
}

.editor-title {
    overflow: hidden;
    color: var(--fg-text);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.app-badge {
    padding: 2px 5px;
    border-radius: 3px;
    background: var(--bg-surface0);
    color: var(--fg-subtext0);
    font-size: 9px;
    letter-spacing: 0.12em;
}

.icon-button,
.tool-button,
.activity-button,
.header-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    background: transparent;
    color: var(--fg-subtext0);
    cursor: pointer;
}

.icon-button {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
}

.editor-brand-icon {
    display: block;
    width: 16px;
    height: 16px;
    margin: auto;
}

.icon-button--active,
.icon-button:hover,
.tool-button:hover,
.activity-button:hover {
    background: var(--bg-surface0);
    color: var(--fg-text);
}

.tool-button {
    width: 30px;
    height: 30px;
    border-radius: 4px;
    font-size: 12px;
}

.tool-button:disabled,
.format-select:disabled,
.preview-toolbar button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.format-select {
    width: 54px;
    height: 28px;
    padding: 0 3px;
    border: 0;
    background: transparent;
    color: var(--fg-subtext0);
    font-size: 11px;
    cursor: pointer;
}

.header-button,
.theme-select {
    height: 28px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg-subtext1);
    font-size: 12px;
}

.header-button {
    padding: 0 11px;
}

.header-button:hover,
.theme-select:hover {
    background: var(--bg-surface0);
    color: var(--fg-text);
}

.header-button--primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--bg-crust);
}

.theme-select {
    max-width: 150px;
    padding: 0 7px;
}

.activity-bar {
    grid-area: activity;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 7px 0 4px;
    background: var(--bg-mantle);
    border-right: 1px solid var(--border);
}

.activity-bar__top,
.activity-bar__bottom {
    display: flex;
    flex-direction: column;
    gap: 7px;
}

.activity-button {
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    font-size: 16px;
    text-decoration: none;
}

.activity-button--active {
    background: var(--bg-surface0);
    color: var(--accent);
}

.document-sidebar {
    grid-area: sidebar;
    min-width: 0;
    overflow: hidden;
    background: var(--bg-mantle);
    border-right: 1px solid var(--border);
}

.document-sidebar__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 42px;
    padding: 0 10px 0 12px;
    color: var(--fg-subtext0);
    font-size: 10px;
    letter-spacing: 0.13em;
    text-transform: uppercase;
}

.document-sidebar__actions {
    display: flex;
}

.sidebar-divider {
    position: relative;
    z-index: 3;
    grid-area: sidebar-divider;
    background: var(--bg-mantle);
    cursor: col-resize;
    touch-action: none;
}

.sidebar-divider::after {
    position: absolute;
    inset: 0 2px;
    background: var(--border);
    content: "";
}

.sidebar-divider:hover::after,
.sidebar-divider:focus-visible::after,
.editor-layout--resizing .sidebar-divider::after {
    background: var(--accent);
}

.editor-layout--resizing,
.editor-layout--resizing * {
    cursor: col-resize !important;
    user-select: none !important;
}

.document-tree {
    overflow-y: auto;
    height: 100%;
    padding: 4px 0 16px;
}

.document-group__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-right: 8px;
}

.document-group__header > div {
    display: flex;
    gap: 2px;
}

.document-group__header button {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg-subtext0);
    cursor: pointer;
}

.document-group__header button:hover {
    background: var(--bg-surface0);
    color: var(--fg-text);
}

.document-group h2 {
    margin: 12px 12px 5px;
    color: var(--fg-subtext0);
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
}

.document-tree__empty {
    margin: 0;
    padding: 6px 16px;
    color: var(--bg-overlay1);
    font-size: 12px;
}

.document-tree__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    margin: 1px 6px;
    padding: 7px 9px;
    border-radius: var(--radius-sm);
    color: var(--fg-subtext1);
    font-size: 12px;
    text-decoration: none;
}

.document-tree__item:hover,
.document-tree__item--active {
    background: var(--bg-surface0);
    color: var(--fg-text);
}

.document-tree__item--active {
    box-shadow: inset 2px 0 var(--accent);
}

.document-tree__item span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.document-tree__item small {
    flex: none;
    color: var(--fg-subtext0);
    font-size: 9px;
    text-transform: uppercase;
}

.editor-workspace {
    grid-area: workspace;
    display: grid;
    grid-template-columns: minmax(0, var(--source-width, 46%)) 5px minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-base);
}

/* A page that provides its own workspace gets the whole area, not the source/preview split. */
.editor-workspace--page {
    grid-template-columns: minmax(0, 1fr);
}

.editor-workspace--page > :deep(*) {
    min-width: 0;
    min-height: 0;
}

.sidebar-backdrop {
    display: none;
}

.source-pane,
.preview-pane {
    display: grid;
    grid-template-rows: 36px minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
}

.source-tabs,
.preview-toolbar {
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
    background: var(--bg-mantle);
}

.source-tab,
.preview-toolbar button {
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

.source-editor {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    background: var(--bg-base);
}

.workspace-divider {
    position: relative;
    z-index: 2;
    background: transparent;
    cursor: col-resize;
    touch-action: none;
}

.workspace-divider::after {
    position: absolute;
    inset: 0 2px;
    background: var(--border-strong);
    content: "";
    transition: background 0.15s;
}

.workspace-divider:hover::after,
.workspace-divider:focus-visible::after,
.editor-workspace--resizing .workspace-divider::after {
    background: var(--accent);
}

.editor-workspace--resizing,
.editor-workspace--resizing * {
    cursor: col-resize !important;
    user-select: none !important;
}

.preview-toolbar {
    justify-content: space-between;
    padding-right: 12px;
    color: var(--fg-subtext0);
    font-size: 11px;
}

.preview-toolbar__group {
    display: flex;
    align-items: center;
    height: 100%;
}

.preview-toolbar .zoom-value {
    min-width: 48px;
    padding-inline: 6px;
}

.preview-toolbar .preview-tool--active {
    color: var(--accent);
    background: var(--bg-surface0);
}

.preview-canvas {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 28px;
    background: var(--bg-surface0);
}

.preview-page {
    display: block;
    width: max-content;
    margin: 0 auto;
    zoom: var(--preview-zoom, 1);
}

.editor-statusbar {
    grid-area: status;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 0 8px;
    background: var(--bg-mantle);
    border-top: 1px solid var(--border);
    color: var(--bg-overlay1);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
}

.editor-statusbar__left {
    display: flex;
    gap: 12px;
}

.save-state { color: var(--green); }
.save-state--saving { color: var(--yellow); }
.save-state--conflict,
.save-state--offline { color: var(--red); }

.editor-statusbar__context {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.document-context-menu {
    position: fixed;
    z-index: 1100;
    display: grid;
    width: 160px;
    padding: 5px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-mantle);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
}

.document-context-menu button {
    padding: 8px 10px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg-text);
    text-align: left;
    cursor: pointer;
}

.document-context-menu button:hover { background: var(--bg-surface0); }
.document-context-menu .document-context-menu__danger { color: var(--red); }

.export-dialog-backdrop {
    position: fixed;
    z-index: 1000;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgb(0 0 0 / 0.62);
}

.export-dialog {
    width: min(420px, 100%);
    padding: 20px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--bg-mantle);
    color: var(--fg-text);
    box-shadow: 0 20px 60px rgb(0 0 0 / 0.35);
}

.export-dialog header,
.export-dialog footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.export-dialog h2,
.export-dialog p { margin: 0; }
.export-dialog h2 { font-size: 16px; }
.export-dialog header p,
.export-dialog__hint { margin-top: 4px; color: var(--fg-subtext0); font-size: 11px; }
.export-dialog header > button { border: 0; background: transparent; font-size: 22px; cursor: pointer; }
.export-dialog label { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; align-items: center; gap: 10px; margin-top: 18px; color: var(--fg-subtext1); font-size: 12px; }
.export-dialog select,
.export-dialog input:not([type="range"]) { width: 100%; padding: 8px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--bg-base); color: var(--fg-text); }
.export-dialog input[type="range"] { width: 100%; accent-color: var(--accent); }
.export-dialog footer { justify-content: flex-end; margin-top: 24px; }
.export-dialog footer button { padding: 8px 14px; border: 1px solid var(--border-strong); border-radius: var(--radius-sm); background: transparent; cursor: pointer; }
.export-dialog footer .export-dialog__submit { border-color: var(--accent); background: var(--accent); color: var(--bg-crust); }
.operation-error { margin-top: 10px !important; color: var(--red); font-size: 11px; }
.template-group { margin-top: 12px; }
.document-tree__skeleton { display: grid; gap: 6px; padding: 4px 12px; }
.document-tree__skeleton span { height: 22px; border-radius: var(--radius-sm); background: var(--bg-surface0); animation: tree-skeleton-pulse 1.2s ease-in-out infinite; }
.document-tree__skeleton span:nth-child(2) { animation-delay: .15s; }
.document-tree__skeleton span:nth-child(3) { animation-delay: .3s; }
.workspace-loading { grid-column: 1 / -1; display: grid; place-items: center; margin: 0; color: var(--fg-subtext0); font-size: 12px; animation: tree-skeleton-pulse 1.2s ease-in-out infinite; }
.document-tree__item { transition: background-color .15s ease, color .15s ease; }
@keyframes tree-skeleton-pulse { 0%, 100% { opacity: .4; } 50% { opacity: .9; } }
@media (prefers-reduced-motion: reduce) { .document-tree__skeleton span, .workspace-loading { animation: none; } }
.template-tree__item { width: calc(100% - 12px); border: 0; background: transparent; font-family: inherit; font-size: 12px; font-weight: 400; text-align: left; cursor: pointer; }
.tool-button--indicator { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.tool-button--active { color: var(--accent); background: var(--bg-surface0); }
.template-readonly-label { margin: auto 10px; color: var(--fg-subtext0); font-size: 10px; letter-spacing: .06em; line-height: 1; text-transform: uppercase; white-space: nowrap; }
.template-clone-button, .template-back-button { height: 100%; margin: 0; padding: 0 11px; border: 0; border-left: 1px solid var(--border); border-radius: 0; background: transparent; color: var(--fg-subtext0); font: inherit; font-size: 11px; white-space: nowrap; cursor: pointer; }
.template-clone-button:hover, .template-back-button:hover { background: var(--bg-surface0); color: var(--fg-text); }
.template-clone-button:focus-visible, .template-back-button:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }
.template-clone-button:disabled { opacity: .55; cursor: wait; }
.template-inline-error { position: absolute; right: 12px; bottom: 8px; z-index: 2; margin: 0; padding: 5px 8px; border: 1px solid var(--danger); border-radius: var(--radius-sm); background: var(--bg-mantle); color: var(--danger); font-size: 10px; }

@media (max-width: 900px) {
    .editor-layout {
        grid-template:
            "header header" 42px
            "activity workspace" minmax(0, 1fr)
            "activity status" 24px
            / 46px minmax(0, 1fr);
    }

    .document-sidebar,
    .sidebar-divider {
        display: none !important;
    }

    .editor-layout--drawer-open .document-sidebar {
        position: fixed;
        z-index: 40;
        top: 42px;
        bottom: 24px;
        left: 46px;
        display: block !important;
        width: min(300px, calc(100vw - 46px));
        overflow: auto;
        box-shadow: 8px 0 24px rgb(0 0 0 / .35);
    }

    .editor-layout--drawer-open .sidebar-backdrop {
        position: fixed;
        z-index: 39;
        inset: 42px 0 24px 46px;
        display: block;
        background: rgb(0 0 0 / .45);
    }

    .editor-header {
        grid-template-columns: minmax(0, 1fr) auto;
    }

    .editor-header__actions {
        grid-column: 2;
    }

    .editor-header__tools,
    .theme-select {
        display: none;
    }
}

@media (max-width: 760px) {
    .editor-workspace {
        grid-template-columns: minmax(0, 1fr);
    }

    .workspace-divider,
    .preview-pane {
        display: none;
    }
}

@media (max-width: 560px) {
    .editor-header__actions .header-button:not(.header-button--primary),
    .editor-statusbar__left span:not(.save-state),
    .editor-statusbar__context,
    .app-badge {
        display: none;
    }
}

@page { size: A4; margin: 0; }

@media print {
    .editor-header,
    .activity-bar,
    .document-sidebar,
    .sidebar-divider,
    .source-pane,
    .workspace-divider,
    .preview-toolbar,
    .editor-statusbar {
        display: none !important;
    }

    .editor-layout,
    .editor-workspace,
    .preview-pane {
        display: block !important;
        width: auto;
        height: auto;
        overflow: visible;
        background: #fff;
    }

    .editor-layout {
        position: static;
        inset: auto;
    }

    .preview-canvas {
        overflow: visible;
        padding: 0;
        background: #fff;
    }

    .preview-page {
        zoom: 1;
    }
}
</style>
