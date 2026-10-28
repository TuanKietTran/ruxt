import { CvTemplate, type CvTemplateProps } from "@ruxt/shared/cv";

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
    return template;
}
