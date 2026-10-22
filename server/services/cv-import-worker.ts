import { CvConcept, CvProfile } from "@ruxt/core/domain/cv/concept";
import type { CvContact, CvContactKind } from "@ruxt/core/domain/cv/concept";
import { CvImportJob } from "@ruxt/core/domain/cv/import";
import type { CvImportJobProps } from "@ruxt/core/domain/cv/import";
import { cvPipelineExtractor } from "../adapters/cv/pipeline-extractor";
import { cvArtifactRepo, cvImportRepo } from "../adapters/cv/pipeline-repos";

const active = new Map<string, AbortController>();
const encoder = new TextEncoder();
const expiry = () => new Date(Date.now() + Number(process.env.CV_ARTIFACT_TTL_HOURS ?? 24) * 3_600_000).toISOString();

function contact(kind: CvContactKind, label: string, value: unknown): CvContact | null {
   return typeof value === "string" && value.trim() ? { kind, label, value: value.trim() } : null;
}

function canonicalConcept(raw: any, job: CvImportJob, rawTextArtifactId: string): CvConcept {
   const identity = raw?.identity ?? {};
   const contacts = [
      contact("email", "Email", identity.email),
      contact("phone", "Phone", identity.phone),
      ...(Array.isArray(identity.links) ? identity.links.map((link: any) => {
         const label = typeof link?.label === "string" ? link.label : "Link";
         const normalized = label.toLowerCase();
         const kind: CvContactKind = normalized === "linkedin" || normalized === "github" ? normalized : normalized === "website" ? "website" : "other";
         return contact(kind, label, link?.url);
      }) : []),
   ].filter((item): item is CvContact => Boolean(item));

   const profile = CvProfile.create({
      version: 1,
      identity: {
         fullName: String(identity.full_name ?? ""),
         headline: String(identity.headline ?? ""),
         summary: String(raw?.summary ?? ""),
         location: String(identity.location ?? ""),
      },
      contacts,
      experiences: (raw?.experience ?? []).map((item: any) => ({
         title: String(item?.title ?? ""), company: String(item?.company ?? ""), location: String(item?.location ?? ""),
         start: String(item?.start ?? ""), end: String(item?.end ?? ""),
         highlights: Array.isArray(item?.highlights) ? item.highlights.map(String) : [],
      })),
      skills: (raw?.skills ?? []).map((item: any) => ({
         name: String(item?.group ?? "General"), skills: Array.isArray(item?.items) ? item.items.map(String) : [],
      })),
      certifications: (raw?.certifications ?? []).map((name: unknown) => ({ name: String(name) })),
      education: (raw?.education ?? []).map((item: any) => ({
         degree: String(item?.degree ?? ""), school: String(item?.school ?? ""), location: String(item?.location ?? ""),
         start: String(item?.start ?? ""), end: String(item?.end ?? ""), details: String(item?.details ?? ""),
      })),
      projects: (raw?.projects ?? []).map((item: any) => ({
         name: String(item?.name ?? ""), url: String(item?.url ?? ""), description: String(item?.description ?? ""),
         technologies: Array.isArray(item?.tech) ? item.tech.map(String) : [],
      })),
      languages: Array.isArray(raw?.languages) ? raw.languages.map(String) : [],
   });

   return CvConcept.create({
      schemaVersion: 1,
      profile: profile.toJSON(),
      source: {
         artifactId: job.source.id,
         filename: job.source.filename,
         pageCount: Number(raw?.source?.pages ?? 0),
         extractedAt: String(raw?.source?.extracted_at ?? new Date().toISOString()),
         rawTextArtifactId,
      },
   });
}

async function saveState(job: CvImportJob, patch: Partial<CvImportJobProps>) {
   const next = CvImportJob.create({ ...job.toJSON(), ...patch, updatedAt: new Date().toISOString() });
   await cvImportRepo.save(next);
   return next;
}

export async function runCvImport(importId: string): Promise<void> {
   if (active.has(importId)) return;
   let runnable = (await cvImportRepo.listRunnable(100)).find((item) => item.id === importId);
   if (!runnable) return;
   const controller = new AbortController();
   active.set(importId, controller);
   try {
      runnable = await saveState(runnable, { state: "running", stage: "starting", progress: 1 });
      const source = await cvArtifactRepo.read(runnable.source.id, runnable.ownerId);
      if (!source) throw new Error("Source artifact not found or expired");
      const result = await cvPipelineExtractor.extract({
         bytes: source,
         filename: runnable.source.filename,
         signal: controller.signal,
         onProgress: async (progress, stage) => {
            const latest = await cvImportRepo.get(runnable!.id, runnable!.ownerId);
            if (latest?.cancelRequested) controller.abort();
            runnable = await saveState(runnable!, { progress, stage });
         },
      });
      const expiresAt = expiry();
      const rawArtifact = await cvArtifactRepo.putGenerated({
         ownerId: runnable.ownerId, importId, kind: "raw-text", mediaType: "text/plain; charset=utf-8",
         bytes: encoder.encode(result.rawText), expiresAt,
      });
      const concept = result.accepted ? canonicalConcept(result.concept, runnable, rawArtifact.id) : result.concept;
      const payloads = [
         ["concept", "application/json", JSON.stringify(concept, null, 2)],
         ["markdown", "text/markdown; charset=utf-8", result.markdown],
         ["css", "text/css; charset=utf-8", result.css],
         ["html", "text/html; charset=utf-8", result.html],
      ] as const;
      const generated = await Promise.all(payloads.map(([kind, mediaType, text]) => cvArtifactRepo.putGenerated({
         ownerId: runnable!.ownerId, importId, kind, mediaType, bytes: encoder.encode(text), expiresAt,
      })));
      const artifacts = [rawArtifact, ...generated];
      if (!result.accepted) {
         await saveState(runnable, {
            state: "failed", progress: 100, stage: "classified", artifacts, warnings: result.warnings,
            error: { code: result.rejection!.code, message: result.rejection!.message, reasons: result.rejection!.reasons },
         });
         return;
      }
      await saveState(runnable, { state: "succeeded", progress: 100, stage: "ready_for_preview", artifacts, warnings: result.warnings });
   } catch (error) {
      const cancelled = controller.signal.aborted;
      await saveState(runnable, {
         state: cancelled ? "cancelled" : "failed", stage: cancelled ? "cancelled" : "failed",
         error: cancelled ? undefined : {
            code: String(error).includes("not found at") || String(error).includes("dependencies") ? "EXTRACTION_UNAVAILABLE" : "EXTRACTION_FAILED",
            message: error instanceof Error ? error.message : "CV extraction failed",
         },
      });
   } finally {
      active.delete(importId);
   }
}

export async function runQueuedCvImports(limit = 2): Promise<number> {
   const queued = await cvImportRepo.listRunnable(limit);
   await Promise.all(queued.map((job) => runCvImport(job.id)));
   return queued.length;
}

export function requestActiveCvImportCancellation(id: string) {
   active.get(id)?.abort();
}
