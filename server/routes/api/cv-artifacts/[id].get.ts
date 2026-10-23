import { cvArtifactRepo } from "../../../adapters/cv/pipeline-repos";
import { requireCvOwner } from "../../../utils/cv-owner";

const mediaTypes: Record<string, string> = {
   concept: "application/json", markdown: "text/markdown; charset=utf-8", css: "text/css; charset=utf-8",
   html: "text/html; charset=utf-8", "raw-text": "text/plain; charset=utf-8",
};

export default defineEventHandler(async (event) => {
   const ownerId = await requireCvOwner(event);
   const id = getRouterParam(event, "id") ?? "";
   const bytes = await cvArtifactRepo.read(id, ownerId);
   if (!bytes) throw createError({ statusCode: 404, statusMessage: "CV artifact not found" });
   const kind = Object.keys(mediaTypes).find((candidate) => id.includes(`-${candidate}-`));
   setHeader(event, "content-type", kind ? mediaTypes[kind]! : "application/octet-stream");
   setHeader(event, "cache-control", "private, no-store");
   return bytes;
});
