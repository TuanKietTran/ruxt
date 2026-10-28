import harvardTemplateData from "../../data/cv-templates/harvard.v1.json";
import pipelineTemplateData from "../../data/cv-templates/pipeline-default.v1.json";
import type { CvTemplateRepository } from "@ruxt/core/repos/cv-template.repo";
import { CvTemplate } from "@ruxt/shared/cv";
import type { CvTemplateProps } from "@ruxt/shared/cv";
import { migrateCvIndicatorSources } from "./source-migration";
import { isImportCvTemplate, isPublicCvTemplate } from "../../utils/cv-template-visibility";

// Metadata such as visibility tags intentionally lives in these data blobs. The
// repository persists and returns it verbatim; no policy is inferred here.
const seedTemplates = [pipelineTemplateData, harvardTemplateData].map((data) =>
   CvTemplate.create(data as CvTemplateProps),
);
const templateKey = (template: Pick<CvTemplate, "id" | "version">) =>
   `templates:${template.id}:v${template.version}`;
// The seed/migration scan below costs a KV list plus a read per template. It runs once per deployment
// (the marker holds the build that last ran it) instead of once per Worker isolate; saving clears it.
const SEEDED_MARKER = "template-seeds:build";
// Catalog reads (a KV list plus a read per template) are reused briefly within one isolate.
const CATALOG_TTL_MS = 60_000;
let catalog: { templates: CvTemplateProps[]; expires: number } | undefined;
let seedPromise: Promise<void> | undefined;

/** Templates the server uses on its own (CV import) but never lists in a catalog. */
export const INTERNAL_TEMPLATE_TAG = "internal";
export const isCatalogTemplate = (template: Pick<CvTemplate, "tags">) => !template.tags.includes(INTERNAL_TEMPLATE_TAG);

/**
 * Soft migration: copy JSON seed blobs into the configured CV storage only when
 * a version is absent. Existing persisted versions always win and the legacy
 * template-harvard document is intentionally left untouched for rollback.
 */
export async function ensurePersistedTemplates() {
   seedPromise ??= (async () => {
      const storage = useStorage("cv");
      const build = useRuntimeConfig().app.buildId || "dev";
      if (await storage.getItem<string>(SEEDED_MARKER) === build) return;
      await Promise.all(seedTemplates.map(async (template) => {
         const key = templateKey(template);
         if (!await storage.hasItem(key)) await storage.setItem(key, template.toJSON());
      }));

      // Existing versions win semantically, except for narrow safety migrations:
      // rendering hooks move off app-owned classes and the import-only pipeline
      // template loses `public` and gains `internal`, which hides it from every catalog.
      await Promise.all((await storage.getKeys("templates:")).map(async (key) => {
         const template = await storage.getItem<CvTemplateProps>(key);
         if (!template || !isImportCvTemplate(template)) return;
         const migrated = migrateCvIndicatorSources({
            markdown: template.markdownSkeleton,
            css: template.css,
         });
         const tags = template.id === "pipeline-default"
            ? [...template.tags.filter(tag => tag !== "public" && tag !== INTERNAL_TEMPLATE_TAG), INTERNAL_TEMPLATE_TAG]
            : template.tags;
         if (migrated.changed || tags.join("\n") !== template.tags.join("\n")) {
            await storage.setItem(key, {
               ...template,
               tags,
               markdownSkeleton: migrated.markdown,
               css: migrated.css,
            });
         }
      }));
      await storage.setItem(SEEDED_MARKER, build);
   })().catch((error) => {
      seedPromise = undefined;
      throw error;
   });
   return seedPromise;
}

async function persistedTemplates(): Promise<CvTemplate[]> {
   if (catalog && catalog.expires > Date.now()) return catalog.templates.map(CvTemplate.create);
   await ensurePersistedTemplates();
   const storage = useStorage("cv");
   const templates = (await Promise.all(
      (await storage.getKeys("templates:"))
         .map(key => storage.getItem<CvTemplateProps>(key)),
   )).filter((template): template is CvTemplateProps => Boolean(template));
   catalog = { templates, expires: Date.now() + CATALOG_TTL_MS };
   return templates.map(CvTemplate.create);
}

export const cvTemplateRepo: CvTemplateRepository = {
   async list() {
      const templates = (await persistedTemplates()).filter(isPublicCvTemplate);
      return templates.sort((left, right) =>
         left.name.localeCompare(right.name) || right.version - left.version,
      );
   },

   async get(id, version) {
      await ensurePersistedTemplates();
      const storage = useStorage("cv");
      if (version !== undefined) {
         const raw = await storage.getItem<CvTemplateProps>(templateKey({ id, version }));
         return raw && isImportCvTemplate(raw) ? CvTemplate.create(raw) : null;
      }
      const matches = (await persistedTemplates()).filter(template => template.id === id && isImportCvTemplate(template));
      return matches.sort((left, right) => right.version - left.version)[0] ?? null;
   },

   async save(_template) {
      throw new Error("Private templates are browser-local; server template writes are disabled");
   },
};
