import { createHash, randomUUID } from "node:crypto";
import type { CvArtifactRepository, CvImportRepository } from "@ruxt/core/repos/cv-import.repo";
import { CvImportJob } from "@ruxt/core/domain/cv/import";
import type { CvGeneratedArtifact, CvImportJobProps, CvSourceArtifact } from "@ruxt/core/domain/cv/import";

const importKey = (id: string) => `imports:${id}`;
const artifactMetaKey = (id: string) => `artifact-meta:${id}`;
const artifactDataKey = (id: string) => `artifact-data:${id}`;
const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

type OwnedArtifact = (CvSourceArtifact | CvGeneratedArtifact) & { ownerId: string };

export const cvImportRepo: CvImportRepository = {
   async get(id, ownerId) {
      const raw = await useStorage("cvPipeline").getItem<CvImportJobProps>(importKey(id));
      return raw?.ownerId === ownerId ? CvImportJob.create(raw) : null;
   },
   async getByIdempotencyKey(ownerId, key) {
      const ids = await useStorage("cvPipeline").getKeys("imports:");
      for (const id of ids) {
         const raw = await useStorage("cvPipeline").getItem<CvImportJobProps>(id);
         if (raw?.ownerId === ownerId && raw.idempotencyKey === key) return CvImportJob.create(raw);
      }
      return null;
   },
   async listRunnable(limit) {
      const ids = await useStorage("cvPipeline").getKeys("imports:");
      const jobs = await Promise.all(ids.map((id) => useStorage("cvPipeline").getItem<CvImportJobProps>(id)));
      return jobs.filter((job): job is CvImportJobProps => job?.state === "queued").map(CvImportJob.create).slice(0, limit);
   },
   async save(job) {
      await useStorage("cvPipeline").setItem(importKey(job.id), job.toJSON());
   },
};

async function putArtifact(
   ownerId: string,
   metadata: CvSourceArtifact | CvGeneratedArtifact,
   bytes: Uint8Array,
) {
   const storage = useStorage("cvPipeline");
   await storage.setItemRaw(artifactDataKey(metadata.id), bytes);
   await storage.setItem(artifactMetaKey(metadata.id), { ...metadata, ownerId } satisfies OwnedArtifact);
}

export const cvArtifactRepo: CvArtifactRepository = {
   async putSource({ ownerId, filename, mediaType, bytes, expiresAt }) {
      const metadata: CvSourceArtifact = {
         id: randomUUID(), filename, mediaType, size: bytes.byteLength,
         checksum: checksum(bytes), createdAt: new Date().toISOString(), expiresAt,
      };
      await putArtifact(ownerId, metadata, bytes);
      return metadata;
   },
   async putGenerated({ ownerId, importId, kind, mediaType, bytes, expiresAt }) {
      const metadata: CvGeneratedArtifact = {
         id: `${importId}-${kind}-${randomUUID()}`, kind, mediaType, size: bytes.byteLength,
         checksum: checksum(bytes), createdAt: new Date().toISOString(), expiresAt,
      };
      await putArtifact(ownerId, metadata, bytes);
      return metadata;
   },
   async read(id, ownerId) {
      const storage = useStorage("cvPipeline");
      const metadata = await storage.getItem<OwnedArtifact>(artifactMetaKey(id));
      if (!metadata || metadata.ownerId !== ownerId) return null;
      const value = await storage.getItemRaw<Uint8Array>(artifactDataKey(id));
      return value ? new Uint8Array(value) : null;
   },
};
