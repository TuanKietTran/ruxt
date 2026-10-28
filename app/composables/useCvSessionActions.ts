import type { CvDocument, CvDocumentProps, CvDocumentSummary, CvTemplate } from "@ruxt/shared/cv";
import type { CvSessionBackupEntry } from "@ruxt/shared/cv";
import { cvTitleFromMarkdown } from "@ruxt/shared/cv";
import { clearCvSessionBackup, readCvSessionBackup, writeCvSessionBackup } from "~/utils/cvSessionBackup";

let refreshPromise: Promise<void> | undefined;

type CvIndex = { documents: CvDocumentSummary[] };
type CvTemplateIndex = { templates: CvTemplate[] };

/**
 * Local-first lifecycle actions for CV sessions.
 *
 * The sidebar is updated from local state before the network mutation, so delete/fork/rename keep
 * working while the server or backing storage is slow. Each mutation's response keeps the local list
 * accurate, so the server list is fetched again only after a failed mutation or the refresh button.
 */
export function useCvSessionActions() {
    const nuxtApp = useNuxtApp();
    const { data: cvIndex } = useNuxtData<CvIndex>("editor-document-list");
    const { data: templateIndex } = useNuxtData<CvTemplateIndex>("editor-template-list");

    const mutateDocuments = (mutator: (documents: CvDocumentSummary[]) => CvDocumentSummary[]) => {
        const current = cvIndex.value?.documents ?? [];
        cvIndex.value = { documents: mutator(current) };
    };

    const upsertSummary = (summary: CvDocumentSummary) => {
        mutateDocuments((documents) => {
            const existingIndex = documents.findIndex(document => document.id === summary.id);
            if (existingIndex >= 0) {
                // Keep an existing row in place. Rename/save responses update the title in place
                // instead of moving the active session, which otherwise causes a visible sidebar
                // reflow while the editor is still focused.
                const next = [...documents];
                next[existingIndex] = summary;
                return next;
            }
            return [summary, ...documents];
        });
    };

    /** Reflect a document a request just returned in the sidebar, titled the way the server lists it. */
    const upsertDocument = (document: Pick<CvDocumentProps, "id" | "title" | "markdown" | "revision" | "updatedAt">) => {
        const title = document.title?.trim() && document.title.trim() !== "Untitled CV"
            ? document.title.trim()
            : cvTitleFromMarkdown(document.markdown) ?? document.title;
        upsertSummary({ id: document.id, title, revision: document.revision, updatedAt: document.updatedAt });
    };

    const cacheDocument = (document: CvDocument) => {
        if (import.meta.client) nuxtApp.payload.data[`cv-document:${document.id}`] = document;
    };

    const cachedDocument = (id: string) => {
        const { data } = useNuxtData<CvDocument>(`cv-document:${id}`);
        return data.value ?? nuxtApp.payload.data[`cv-document:${id}`] as CvDocument | undefined;
    };

    const removeSummary = (id: string) => {
        mutateDocuments(documents => documents.filter(document => document.id !== id));
        if (import.meta.client) delete nuxtApp.payload.data[`cv-document:${id}`];
    };

    /** Re-read the server list once, sharing an in-flight request (after a failed mutation). */
    const refreshDocumentsNow = async () => {
        refreshPromise ??= refreshNuxtData("editor-document-list").finally(() => { refreshPromise = undefined; });
        await refreshPromise;
    };

    const renameDocument = async (id: string, title: string) => {
        const trimmed = title.trim();
        const existing = cvIndex.value?.documents.find(document => document.id === id);
        const optimistic = { id, title: trimmed, revision: existing?.revision ?? 0, updatedAt: existing?.updatedAt ?? new Date().toISOString() };
        upsertSummary(optimistic);
        try {
            const updated = await $fetch<CvDocument>(`/api/cvs/${encodeURIComponent(id)}`, {
                method: "PATCH",
                body: { title: trimmed },
            });
            cacheDocument(updated);
            upsertSummary({ id: updated.id, title: updated.title, revision: updated.revision, updatedAt: updated.updatedAt });
            const backup = readCvSessionBackup(updated.id);
            if (backup) writeCvSessionBackup(updated.id, { ...backup, title: updated.title });
        } catch (error) {
            await refreshDocumentsNow();
            throw error;
        }
    };

    const forkDocument = async (sourceId: string, newId: string, title: string) => {
        const source = cachedDocument(sourceId);
        const backup = readCvSessionBackup(sourceId);
        const sourceSnapshot = source ? { markdown: source.markdown, css: source.css } : backup ? { markdown: backup.markdown, css: backup.css } : null;
        const optimistic = { id: newId, title: title.trim(), revision: 1, updatedAt: new Date().toISOString() };
        upsertSummary(optimistic);
        if (sourceSnapshot) writeCvSessionBackup(newId, { ...sourceSnapshot, title: optimistic.title, revision: 1, pending: true });
        try {
            const forked = await $fetch<CvDocument>(`/api/cvs/${encodeURIComponent(sourceId)}/fork`, {
                method: "POST",
                body: { id: newId, title },
            });
            cacheDocument(forked);
            writeCvSessionBackup(forked.id, { markdown: forked.markdown, css: forked.css, title: forked.title, revision: forked.revision, pending: false });
            upsertSummary({ id: forked.id, title: forked.title, revision: forked.revision, updatedAt: forked.updatedAt });
        } catch (error) {
            removeSummary(newId);
            clearCvSessionBackup(newId);
            await refreshDocumentsNow();
            throw error;
        }
    };

    const deleteDocument = async (id: string) => {
        const previous = cvIndex.value?.documents ?? [];
        clearCvSessionBackup(id);
        removeSummary(id);
        try {
            await $fetch(`/api/cvs/${encodeURIComponent(id)}`, { method: "DELETE" });
        } catch (error: any) {
            // Already gone on the server: the local removal is the whole result.
            if (error?.statusCode === 404) return;
            cvIndex.value = { documents: previous };
            await refreshDocumentsNow();
            throw error;
        }
    };

    const recoverSession = async (backup: CvSessionBackupEntry) => {
        upsertSummary({ id: backup.id, title: backup.title, revision: backup.revision, updatedAt: new Date(backup.savedAt || Date.now()).toISOString() });
        try {
            const recovered = await $fetch<CvDocument>("/api/cvs", {
                method: "POST",
                body: { id: backup.id, title: backup.title, markdown: backup.markdown, css: backup.css, sourceId: crypto.randomUUID() },
            });
            cacheDocument(recovered);
            upsertSummary({ id: recovered.id, title: recovered.title, revision: recovered.revision, updatedAt: recovered.updatedAt });
        } catch (error: any) {
            if (error?.statusCode === 409) return;
            await refreshDocumentsNow();
            throw error;
        }
    };

    const createFromTemplate = async (template: CvTemplate, documentId: string) => {
        upsertSummary({ id: documentId, title: template.name, revision: 1, updatedAt: new Date().toISOString() });
        try {
            const created = await $fetch<CvDocument>("/api/cvs", {
                method: "POST",
                body: { id: documentId, title: template.name, markdown: template.markdownSkeleton, css: template.css, sourceId: crypto.randomUUID() },
            });
            cacheDocument(created);
            writeCvSessionBackup(created.id, { markdown: created.markdown, css: created.css, title: created.title, revision: created.revision, pending: false });
            upsertSummary({ id: created.id, title: created.title, revision: created.revision, updatedAt: created.updatedAt });
        } catch (error) {
            removeSummary(documentId);
            clearCvSessionBackup(documentId);
            await refreshDocumentsNow();
            throw error;
        }
    };

    const cloneTemplate = async (templateId: string, version: number, newId: string) => {
        try {
            const cloned = await $fetch<CvTemplate>(`/api/cv-templates/${encodeURIComponent(templateId)}/clone`, {
                method: "POST",
                body: { version, newId },
            });
            if (templateIndex.value) {
                const templates = [...templateIndex.value.templates, cloned]
                    .sort((left, right) => left.name.localeCompare(right.name) || right.version - left.version);
                templateIndex.value = { templates };
            }
            return cloned;
        } catch (error) {
            await refreshNuxtData("editor-template-list");
            throw error;
        }
    };

    return { renameDocument, forkDocument, deleteDocument, recoverSession, createFromTemplate, cloneTemplate, refreshDocumentsNow, upsertDocument };
}
