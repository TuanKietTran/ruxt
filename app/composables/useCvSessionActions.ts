import type { CvDocumentProps, CvDocumentSummary, CvTemplate } from "@ruxt/shared/cv";
import { cvTitleFromMarkdown } from "@ruxt/shared/cv";
import { localCvStore } from "~/utils/localCvStore";
import { cloneLocalCvTemplate } from "~/utils/localCvTemplates";

type CvTemplateIndex = { templates: CvTemplate[] };

/**
 * Lifecycle actions for CV sessions. Sessions live in this browser (`LocalCvStore`), so every action
 * is synchronous local work and makes no request. Private template copies also stay in this browser.
 */
export function useCvSessionActions() {
    const documents = useState<CvDocumentSummary[]>("cv:sessions", () => []);
    // Client-only edits survive page navigation even when durable browser storage refuses a write.
    const buffers = useState<Record<string, { markdown: string; css: string }>>("cv:buffers", () => ({}));
    const deleted = useState<Record<string, boolean>>("cv:deleted", () => ({}));
    const { data: templateIndex } = useNuxtData<CvTemplateIndex>("editor-template-list");

    /** Re-read the browser's sessions (after mount, a storage event or a failed write). */
    const reloadDocuments = () => {
        if (import.meta.client) documents.value = localCvStore.list();
    };

    /** Reflect a document just written in the sidebar, titled the way the list shows it. */
    const upsertDocument = (document: Pick<CvDocumentProps, "id" | "title" | "markdown" | "revision" | "updatedAt">) => {
        delete deleted.value[document.id];
        const title = document.title?.trim() && document.title.trim() !== "Untitled CV"
            ? document.title.trim()
            : cvTitleFromMarkdown(document.markdown) ?? document.title;
        const summary = { id: document.id, title, revision: document.revision, updatedAt: document.updatedAt };
        const index = documents.value.findIndex(item => item.id === summary.id);
        // Keep an existing row in place so a save does not reflow the sidebar under the focused editor.
        documents.value = index >= 0
            ? documents.value.map((item, position) => position === index ? summary : item)
            : [summary, ...documents.value];
    };

    const renameDocument = async (id: string, title: string) => {
        const renamed = localCvStore.rename(id, title);
        if (!renamed) { reloadDocuments(); throw new Error("Could not rename session."); }
        upsertDocument(renamed);
    };

    const forkDocument = async (sourceId: string, newId: string, title: string) => {
        const source = buffers.value[sourceId] ?? localCvStore.get(sourceId);
        const forked = source ? localCvStore.create({ id: newId, title: title.trim() || undefined, markdown: source.markdown, css: source.css }) : null;
        if (!forked) { reloadDocuments(); throw new Error("Could not fork session. Browser storage may be full."); }
        upsertDocument(forked);
    };

    const deleteDocument = async (id: string) => {
        localCvStore.remove(id);
        deleted.value[id] = true;
        delete buffers.value[id];
        documents.value = documents.value.filter(document => document.id !== id);
    };

    const createFromTemplate = async (template: CvTemplate, documentId: string) => {
        const created = localCvStore.create({ id: documentId, title: template.name, markdown: template.markdownSkeleton, css: template.css });
        if (!created) throw new Error("Could not create session. Browser storage may be full.");
        upsertDocument(created);
    };

    const cloneTemplate = async (templateId: string, version: number, newId: string) => {
        const source = templateIndex.value?.templates.find(template => template.id === templateId && template.version === version);
        if (!source) throw new Error("Template not found in this browser.");
        const cloned = cloneLocalCvTemplate(source, newId);
        if (templateIndex.value) {
            const templates = [...templateIndex.value.templates, cloned]
                .sort((left, right) => left.name.localeCompare(right.name) || right.version - left.version);
            templateIndex.value = { templates };
        }
        return cloned;
    };

    return { documents, buffers, deleted, reloadDocuments, renameDocument, forkDocument, deleteDocument, createFromTemplate, cloneTemplate, upsertDocument };
}
