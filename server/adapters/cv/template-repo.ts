import harvardTemplateData from "../../data/cv-templates/harvard.v1.json";
import pipelineTemplateData from "../../data/cv-templates/pipeline-default.v1.json";
import type { CvTemplateRepository } from "@core/repos/cv-template.repo";
import { CvTemplate } from "@core/domain/cv/template";
import type { CvTemplateProps } from "@core/domain/cv/types";
import { migrateCvIndicatorSources } from "./source-migration";

// Metadata such as visibility tags intentionally lives in these data blobs. The
// repository persists and returns it verbatim; no policy is inferred here.
const seedTemplates = [pipelineTemplateData, harvardTemplateData].map((data) =>
   CvTemplate.create(data as CvTemplateProps),
);
const templateKey = (template: Pick<CvTemplate, "id" | "version">) =>
   `templates:${template.id}:v${template.version}`;
let seedPromise: Promise<void> | undefined;

/**
 * Soft migration: copy JSON seed blobs into the configured CV storage only when
 * a version is absent. Existing persisted versions always win and the legacy
 * template-harvard document is intentionally left untouched for rollback.
 */
async function ensurePersistedTemplates() {
   seedPromise ??= (async () => {
      const storage = useStorage("cv");
      await Promise.all(seedTemplates.map(async (template) => {
         const key = templateKey(template);
         if (!await storage.hasItem(key)) await storage.setItem(key, template.toJSON());
      }));

      // Existing versions win semantically, except for narrow safety migrations:
      // rendering hooks move off app-owned classes and the internal pipeline
      // template is removed from the public catalog.
      await Promise.all((await storage.getKeys("templates:")).map(async (key) => {
         const template = await storage.getItem<CvTemplateProps>(key);
         if (!template) return;
         const migrated = migrateCvIndicatorSources({
            markdown: template.markdownSkeleton,
            css: template.css,
         });
         const tags = template.id === "pipeline-default"
            ? template.tags.filter(tag => tag !== "public")
            : template.tags;
         if (migrated.changed || tags.length !== template.tags.length) {
            await storage.setItem(key, {
               ...template,
               tags,
               markdownSkeleton: migrated.markdown,
               css: migrated.css,
            });
         }
      }));
   })().catch((error) => {
      seedPromise = undefined;
      throw error;
   });
   return seedPromise;
}

async function persistedTemplates(): Promise<CvTemplate[]> {
   await ensurePersistedTemplates();
   const storage = useStorage("cv");
   const templates = await Promise.all(
      (await storage.getKeys("templates:"))
         .map(key => storage.getItem<CvTemplateProps>(key)),
   );
   return templates.filter((template): template is CvTemplateProps => Boolean(template)).map(CvTemplate.create);
}

export const cvTemplateRepo: CvTemplateRepository = {
   async list() {
      const templates = await persistedTemplates();
      return templates.sort((left, right) =>
         left.name.localeCompare(right.name) || right.version - left.version,
      );
   },

   async get(id, version) {
      await ensurePersistedTemplates();
      const storage = useStorage("cv");
      if (version !== undefined) {
         const raw = await storage.getItem<CvTemplateProps>(templateKey({ id, version }));
         return raw ? CvTemplate.create(raw) : null;
      }
      const matches = (await persistedTemplates()).filter(template => template.id === id);
      return matches.sort((left, right) => right.version - left.version)[0] ?? null;
   },

   async save(template) {
      await ensurePersistedTemplates();
      const storage = useStorage("cv");
      const key = templateKey(template);
      if (await storage.hasItem(key)) throw new Error("CV template already exists");
      await storage.setItem(key, template.toJSON());
   },
};
