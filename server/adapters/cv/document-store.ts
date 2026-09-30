import { createHash } from "node:crypto";
import referenceMarkdown from "../../../app/data/reference-cv.md?raw";
import referenceCss from "../../../app/data/reference-cv.css?raw";
import { CvDocument } from "@core/domain/cv/document";
import { migrateCvIndicatorSources } from "./source-migration";
import type {
    CvDocumentProps,
    CvDocumentSummary,
    CvUpdateEvent,
    UpdateCvDocumentInput,
} from "@core/domain/cv";

type Listener = (update: CvUpdateEvent) => void;

const listeners = new Map<string, Set<Listener>>();
const writes = new Map<string, Promise<unknown>>();
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;
const hashedRoutePattern = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const isRouteId = (id: string) => hashedRoutePattern.test(id);
const PLACEHOLDER_TITLE = "Untitled CV";
// The placeholder is not an explicit name: fall back to the CV heading so sessions
// are labelled by whoever the CV is for (for example, after a profile switch).
const titleFromDocument = (document: Pick<CvDocumentProps, "id" | "markdown" | "title">) =>
    (document.title?.trim() !== PLACEHOLDER_TITLE && document.title?.trim())
    || document.markdown.match(/^#\s+(.+)$/m)?.[1]?.replace(/\s*\{[^{}]+\}\s*$/, "").trim()
    || document.id.replaceAll("-", " ").replace(/\b\w/g, character => character.toUpperCase());

async function migrateLegacyDocument(id: string): Promise<string> {
    if (isRouteId(id) || id.startsWith("template-")) return id;
    const storage = useStorage("cv");
    const migrationKey = `document-route-migrations:${id}`;
    const existingTarget = await storage.getItem<string>(migrationKey);
    if (existingTarget) return existingTarget;
    const legacy = await storage.getItem<CvDocumentProps>(`documents:${id}`);
    if (!legacy) return id;
    const target = createHash("sha256").update(`cv-session-route:${id}`).digest("hex").slice(0, 32);
    const targetKey = `documents:${target}`;
    if (!await storage.hasItem(targetKey)) {
        await storage.setItem(targetKey, { ...legacy, id: target, title: titleFromDocument(legacy) });
    }
    await storage.setItem(migrationKey, target);
    return target;
}

export function assertCvId(id: string): string {
    if (!idPattern.test(id)) {
        throw createError({ statusCode: 400, statusMessage: "Invalid CV document id" });
    }
    return id;
}

const keyFor = (id: string) => `documents:${assertCvId(id)}`;

async function migratePersistedSources(raw: CvDocumentProps): Promise<CvDocumentProps> {
    const migrated = migrateCvIndicatorSources(raw);
    if (!migrated.changed) return raw;

    const updated: CvDocumentProps = {
        ...raw,
        markdown: migrated.markdown,
        css: migrated.css,
        revision: raw.revision + 1,
        updatedAt: new Date().toISOString(),
    };
    await useStorage("cv").setItem(keyFor(raw.id), updated);
    return updated;
}

async function readDocument(id: string): Promise<CvDocument | undefined> {
    id = await migrateLegacyDocument(id);
    const raw = await useStorage("cv").getItem<CvDocumentProps>(keyFor(id));
    return raw ? CvDocument.create(await migratePersistedSources(raw)) : undefined;
}

function seedDocument(id: string): CvDocument {
    return CvDocument.create({
        id,
        title: id === "master" ? "Current CV" : PLACEHOLDER_TITLE,
        markdown: id === "master" ? referenceMarkdown : `# ${id}\n\nStart writing your CV.\n`,
        css: referenceCss,
        revision: 1,
        updatedAt: new Date().toISOString(),
    });
}

export async function getCvDocument(id: string): Promise<CvDocument> {
    const existing = await readDocument(id);
    if (existing) return existing;
    // Only the default CV is seeded. Seeding a session id on a read miss (for
    // example, on an instance whose storage has not seen it) would persist a
    // placeholder over the session and the editor would show it as a reset.
    if (id !== "master") throw createError({ statusCode: 404, statusMessage: "CV document not found" });

    const seeded = seedDocument(id);
    await useStorage("cv").setItem(keyFor(id), seeded.toJSON());
    return seeded;
}

export async function listCvDocuments(): Promise<CvDocumentSummary[]> {
    const storage = useStorage("cv");
    let keys = await storage.getKeys("documents:");
    if (!keys.length) {
        await getCvDocument("master");
        keys = await storage.getKeys("documents:");
    }
    await Promise.all(keys.map(key => migrateLegacyDocument(key.slice("documents:".length))));
    const currentKeys = await storage.getKeys("documents:");
    const documents = await Promise.all(
        currentKeys.map(async (key) => {
            const id = key.slice("documents:".length);
            if (id.startsWith("template-")) return null;
            if (!isRouteId(id) && await storage.hasItem(`document-route-migrations:${id}`)) return null;
            const document = await storage.getItem<CvDocumentProps>(key);
            return document ? migratePersistedSources(document) : null;
        }),
    );

    return documents
        .filter((document): document is CvDocumentProps => Boolean(document))
        .map(document => ({ id: document.id, title: titleFromDocument(document), revision: document.revision, updatedAt: document.updatedAt }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function renameCvDocument(id: string, title: string): Promise<CvDocument> {
    assertCvId(id);
    const current = await readDocument(id);
    if (!current || current.id === "master" || current.id.startsWith("template-")) {
        throw createError({ statusCode: 400, statusMessage: "This document cannot be renamed" });
    }
    const normalizedTitle = title.trim().slice(0, 120);
    if (!normalizedTitle) throw createError({ statusCode: 400, statusMessage: "title is required" });
    const renamed = CvDocument.create({ ...current.toJSON(), title: normalizedTitle, updatedAt: new Date().toISOString() });
    await useStorage("cv").setItem(keyFor(current.id), renamed.toJSON());
    return renamed;
}

export async function forkCvDocument(id: string, nextId: string, title?: string): Promise<CvDocument> {
    assertCvId(id);
    assertCvId(nextId);
    id = await migrateLegacyDocument(id);
    const storage = useStorage("cv");
    const current = await readDocument(id);
    if (!current) throw createError({ statusCode: 404, statusMessage: "CV document not found" });
    if (await storage.getItem(keyFor(nextId))) {
        throw createError({ statusCode: 409, statusMessage: "A CV document with that name already exists" });
    }

    const forked = CvDocument.create({ ...current.toJSON(), id: nextId, title: title?.trim() || `${titleFromDocument(current.toJSON())} Copy`, revision: 1, updatedAt: new Date().toISOString() });
    await storage.setItem(keyFor(nextId), forked.toJSON());
    return forked;
}

export async function deleteCvDocument(id: string): Promise<void> {
    assertCvId(id);
    id = await migrateLegacyDocument(id);
    if (id === "master" || id.startsWith("template-")) {
        throw createError({ statusCode: 400, statusMessage: "This document cannot be deleted" });
    }
    const storage = useStorage("cv");
    if (!await storage.getItem(keyFor(id))) {
        throw createError({ statusCode: 404, statusMessage: "CV document not found" });
    }
    await storage.removeItem(keyFor(id));
}

export async function createCvDocument(
    id: string,
    input: Pick<UpdateCvDocumentInput, "title" | "markdown" | "css" | "sourceId">,
): Promise<CvDocument> {
    assertCvId(id);
    if (typeof input.markdown !== "string" || typeof input.css !== "string") {
        throw createError({ statusCode: 400, statusMessage: "markdown and css are required" });
    }
    if (input.markdown.length > 500_000 || input.css.length > 100_000) {
        throw createError({ statusCode: 413, statusMessage: "CV document is too large" });
    }

    const previousWrite = writes.get(id) ?? Promise.resolve();
    const nextWrite = previousWrite.then(async () => {
        const storage = useStorage("cv");
        if (await storage.getItem(keyFor(id))) {
            throw createError({ statusCode: 409, statusMessage: "CV document already exists" });
        }
        const document = CvDocument.create({
            id,
            title: input.title?.trim() || PLACEHOLDER_TITLE,
            markdown: input.markdown!,
            css: input.css!,
            revision: 1,
            updatedAt: new Date().toISOString(),
        });
        await storage.setItem(keyFor(id), document.toJSON());
        publishCvUpdate(id, { document: document.toJSON(), sourceId: input.sourceId });
        return document;
    });
    writes.set(id, nextWrite.catch(() => undefined));
    return nextWrite;
}

export async function updateCvDocument(
    id: string,
    input: UpdateCvDocumentInput,
): Promise<CvDocument> {
    if (input.markdown !== undefined && typeof input.markdown !== "string") {
        throw createError({ statusCode: 400, statusMessage: "markdown must be a string" });
    }
    if (input.css !== undefined && typeof input.css !== "string") {
        throw createError({ statusCode: 400, statusMessage: "css must be a string" });
    }
    if ((input.markdown?.length ?? 0) > 500_000 || (input.css?.length ?? 0) > 100_000) {
        throw createError({ statusCode: 413, statusMessage: "CV document is too large" });
    }

    id = await migrateLegacyDocument(id);
    const previousWrite = writes.get(id) ?? Promise.resolve();
    const nextWrite = previousWrite.then(async () => {
        const current = await getCvDocument(id);
        if (
            input.expectedRevision !== undefined
            && input.expectedRevision !== current.revision
        ) {
            throw createError({
                statusCode: 409,
                statusMessage: `Revision conflict: expected ${input.expectedRevision}, current ${current.revision}`,
                data: { document: current.toJSON() },
            });
        }

        const updated = CvDocument.create({
            ...current.toJSON(),
            title: input.title ?? current.title,
            markdown: input.markdown ?? current.markdown,
            css: input.css ?? current.css,
            revision: current.revision + 1,
            updatedAt: new Date().toISOString(),
        });
        await useStorage("cv").setItem(keyFor(id), updated.toJSON());
        publishCvUpdate(id, { document: updated.toJSON(), sourceId: input.sourceId });
        return updated;
    });

    writes.set(id, nextWrite.catch(() => undefined));
    return nextWrite;
}

export function subscribeToCv(id: string, listener: Listener): () => void {
    assertCvId(id);
    const documentListeners = listeners.get(id) ?? new Set<Listener>();
    documentListeners.add(listener);
    listeners.set(id, documentListeners);

    return () => {
        documentListeners.delete(listener);
        if (!documentListeners.size) listeners.delete(id);
    };
}

function publishCvUpdate(id: string, update: CvUpdateEvent): void {
    for (const listener of listeners.get(id) ?? []) listener(update);
}
