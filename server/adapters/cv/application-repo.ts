import type { CvApplicationRepository } from "@ruxt/core/repos/cv-application.repo";
import { CvApplication, type CvApplicationProps } from "@ruxt/core/domain/cv/application";
import { CvTemplate } from "@ruxt/shared/cv";
import { CvProfile } from "@ruxt/shared/cv";
import { assertExpectedRevision } from "@ruxt/shared/cv";

const key = (id: string) => `applications:${id}`;
const writes = new Map<string, Promise<unknown>>();

function hydrate(raw: CvApplicationProps): CvApplication {
   return CvApplication.create({
      ...raw,
      template: { ...raw.template, value: CvTemplate.create(raw.template.value as any) },
      profile: { ...raw.profile, value: CvProfile.create(raw.profile.value as any) },
   });
}

/** Serialize read-check-write per application so revision checks are atomic in-process. */
function serialized<T>(id: string, write: () => Promise<T>): Promise<T> {
   const next = (writes.get(id) ?? Promise.resolve()).then(write);
   writes.set(id, next.catch(() => undefined));
   return next;
}

export const cvApplicationRepo: CvApplicationRepository = {
   async create(application) {
      return serialized(application.id, async () => {
         const storage = useStorage("cvPipeline");
         if (await storage.getItem(key(application.id))) throw new Error("CV application already exists");
         await storage.setItem(key(application.id), application.toJSON());
      });
   },
   async get(id, ownerId) {
      const raw = await useStorage("cvPipeline").getItem<CvApplicationProps>(key(id));
      if (!raw || raw.ownerId !== ownerId) return null;
      return hydrate(raw);
   },
   async update(application, expectedRevision) {
      return serialized(application.id, async () => {
         const storage = useStorage("cvPipeline");
         const raw = await storage.getItem<CvApplicationProps>(key(application.id));
         if (!raw || raw.ownerId !== application.ownerId) throw new Error("CV application not found");
         assertExpectedRevision(expectedRevision, raw.revision);
         await storage.setItem(key(application.id), application.toJSON());
      });
   },
};
