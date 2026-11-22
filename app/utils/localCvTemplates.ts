import { CvTemplate, type CvTemplateProps } from "@ruxt/shared/cv";
import { emitLocalChange } from "./cloudSync/localChanges";

export const LOCAL_CV_TEMPLATES_KEY = "cv-sv:local-templates:v1";
type TemplateStorage = Pick<Storage, "getItem" | "setItem">;

export function readLocalCvTemplates(storage?: TemplateStorage): CvTemplate[] {
    try {
        const values: unknown = JSON.parse((storage ?? localStorage).getItem(LOCAL_CV_TEMPLATES_KEY) || "[]");
        if (!Array.isArray(values)) return [];
        return values.flatMap(value => {
            try { return [CvTemplate.create(value)]; } catch { return []; }
        });
    } catch { return []; }
}

/** Private copies never leave the browser. Failed writes throw and preserve the previous array. */
export function cloneLocalCvTemplate(source: CvTemplateProps | CvTemplate, id: string, storage: TemplateStorage = localStorage): CvTemplate {
    const values: unknown = JSON.parse(storage.getItem(LOCAL_CV_TEMPLATES_KEY) || "[]");
    if (!Array.isArray(values)) throw new Error("Stored local templates could not be read.");
    if (values.some(value => value?.id === id)) throw new Error("A local template with that id already exists.");
    const template = CvTemplate.create({
        id, version: 1, name: `${source.name} (copy)`, markdownSkeleton: source.markdownSkeleton,
        css: source.css, capabilities: source.capabilities, builtIn: false, tags: ["local"], createdAt: new Date().toISOString(),
    });
    storage.setItem(LOCAL_CV_TEMPLATES_KEY, JSON.stringify([...values, template.toJSON()]));
    emitLocalChange({ kind: "template", id, origin: "local" });
    return template;
}

// ------------------------------------------------------------------------------------------------
// Managing private templates: save from a CV, rename, delete, export, import.
// All of it stays in this browser. Every write tells the sync engine, which only ever uploads records
// the user selected.
// ------------------------------------------------------------------------------------------------

/** One template's content may not exceed what a cloud copy accepts (512 KiB), so export, import and sync agree. */
export const LOCAL_TEMPLATE_MAX_BYTES = 512 * 1024;
export const TEMPLATE_EXPORT_SCHEMA = "ruxt.template-export/1";

const DEFAULT_CAPABILITIES: CvTemplateProps["capabilities"] = { pageFormats: ["A4"], supportsPhoto: false, atsFriendly: true };

const contentBytes = (value: { markdownSkeleton: string; css: string }) => new TextEncoder().encode(value.markdownSkeleton + value.css).length;

function readEntries(storage: TemplateStorage): unknown[] {
    const values: unknown = JSON.parse(storage.getItem(LOCAL_CV_TEMPLATES_KEY) || "[]");
    if (!Array.isArray(values)) throw new Error("Stored local templates could not be read.");
    return values;
}

function writeEntries(storage: TemplateStorage, entries: unknown[], change: { id: string }): void {
    storage.setItem(LOCAL_CV_TEMPLATES_KEY, JSON.stringify(entries));
    emitLocalChange({ kind: "template", id: change.id, origin: "local" });
}

const cleanName = (name: string) => {
    const trimmed = name.replace(/\s+/g, " ").trim();
    if (!trimmed) throw new Error("A template needs a name.");
    if (trimmed.length > 120) throw new Error("Template names are limited to 120 characters.");
    return trimmed;
};

/** Create a new private template (version 1). A failed write throws and keeps the previous list. */
export function saveLocalCvTemplate(
    input: { name: string; markdownSkeleton: string; css: string; capabilities?: CvTemplateProps["capabilities"]; id?: string },
    storage: TemplateStorage = localStorage,
): CvTemplate {
    const entries = readEntries(storage);
    const id = input.id ?? `local-${globalThis.crypto.randomUUID().slice(0, 12)}`;
    if (entries.some(entry => (entry as { id?: unknown } | null)?.id === id)) throw new Error("A local template with that id already exists.");
    if (contentBytes(input) > LOCAL_TEMPLATE_MAX_BYTES) throw new Error("This template is larger than 512 KiB.");
    const template = CvTemplate.create({
        id, version: 1, name: cleanName(input.name), markdownSkeleton: input.markdownSkeleton, css: input.css,
        capabilities: input.capabilities ?? DEFAULT_CAPABILITIES, builtIn: false, tags: ["local"], createdAt: new Date().toISOString(),
    });
    writeEntries(storage, [...entries, template.toJSON()], { id });
    return template;
}

/** Rename a private template in place. Built-in and public templates cannot be renamed. */
export function renameLocalCvTemplate(id: string, name: string, storage: TemplateStorage = localStorage): CvTemplate {
    const entries = readEntries(storage);
    const index = entries.findIndex(entry => (entry as { id?: unknown } | null)?.id === id);
    const current = index >= 0 ? entries[index] as CvTemplateProps : null;
    if (!current || current.builtIn) throw new Error("That template is not a private template in this browser.");
    const renamed = CvTemplate.create({ ...current, name: cleanName(name) });
    const next = [...entries];
    next[index] = renamed.toJSON();
    writeEntries(storage, next, { id });
    return renamed;
}

/** Delete a private template from this browser. Sessions created from it keep their own copy of its content. */
export function removeLocalCvTemplate(id: string, storage: TemplateStorage = localStorage): void {
    const entries = readEntries(storage);
    const target = entries.find(entry => (entry as { id?: unknown } | null)?.id === id) as CvTemplateProps | undefined;
    if (!target || target.builtIn) throw new Error("That template is not a private template in this browser.");
    writeEntries(storage, entries.filter(entry => entry !== target), { id });
}

/** A portable copy of one template: content only, no id, so importing never overwrites anything. */
export function exportLocalCvTemplate(template: Pick<CvTemplateProps, "name" | "markdownSkeleton" | "css" | "capabilities">): string {
    return JSON.stringify({
        schema: TEMPLATE_EXPORT_SCHEMA, name: template.name, markdownSkeleton: template.markdownSkeleton, css: template.css,
        capabilities: template.capabilities,
    }, null, 2);
}

/** Add a template from an export file as a new private template. Throws a readable error for anything else. */
export function importLocalCvTemplate(text: string, storage: TemplateStorage = localStorage): CvTemplate {
    if (new TextEncoder().encode(text).length > LOCAL_TEMPLATE_MAX_BYTES * 2) throw new Error("That file is too large to be a template.");
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { throw new Error("That file is not a Ruxt template export."); }
    if (!data || typeof data !== "object" || data.schema !== TEMPLATE_EXPORT_SCHEMA) throw new Error("That file is not a Ruxt template export.");
    if (typeof data.name !== "string" || typeof data.markdownSkeleton !== "string" || typeof data.css !== "string") {
        throw new Error("That template export is missing its name, content or styles.");
    }
    const capabilities = data.capabilities && typeof data.capabilities === "object" ? data.capabilities as CvTemplateProps["capabilities"] : DEFAULT_CAPABILITIES;
    return saveLocalCvTemplate({ name: data.name, markdownSkeleton: data.markdownSkeleton, css: data.css, capabilities }, storage);
}
