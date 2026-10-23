import { useMediator } from "@ruxt/shared/cqrs";
import { createCvImportCommand } from "@ruxt/core/handlers/create-cv-import";
import { getCvCapabilitiesQuery } from "@ruxt/core/handlers/get-cv-capabilities";
import { getCvTemplateQuery } from "@ruxt/core/handlers/get-cv-template";
import type { CvPipelineCapabilities } from "@ruxt/core/domain/cv/import";
import { cvArtifactRepo } from "../../../adapters/cv/pipeline-repos";
import { runCvImport } from "../../../services/cv-import-worker";
import { requireCvOwner } from "../../../utils/cv-owner";

const extensionByMediaType: Record<string, string[]> = {
   "application/pdf": ["pdf"], "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"],
   "image/webp": ["webp"], "image/tiff": ["tif", "tiff"], "image/bmp": ["bmp"],
};

export default defineEventHandler(async (event) => {
   const ownerId = await requireCvOwner(event);
   const mediator = useMediator();
   const capabilities = await sendApiRequest<CvPipelineCapabilities>(mediator, getCvCapabilitiesQuery());
   if (!capabilities.available) throw createError({ statusCode: 503, statusMessage: capabilities.degradedReason ?? "CV extraction unavailable" });
   const contentLength = Number(getHeader(event, "content-length") ?? 0);
   if (contentLength > capabilities.maxUploadBytes + 64_000) throw createError({ statusCode: 413, statusMessage: "CV upload is too large" });

   const parts = await readMultipartFormData(event);
   const file = parts?.find((part) => part.name === "file" && part.filename);
   if (!file?.filename || !file.type) throw createError({ statusCode: 400, statusMessage: "multipart file field is required" });
   if (file.data.byteLength > capabilities.maxUploadBytes) throw createError({ statusCode: 413, statusMessage: "CV upload is too large" });
   const extension = file.filename.split(".").pop()?.toLowerCase() ?? "";
   if (!extensionByMediaType[file.type]?.includes(extension)) {
      throw createError({ statusCode: 415, statusMessage: "Unsupported or mismatched CV file type" });
   }

   const templateId = parts?.find((part) => part.name === "templateId")?.data.toString("utf8") || "pipeline-default";
   const requestedVersion = parts?.find((part) => part.name === "templateVersion")?.data.toString("utf8");
   const templateVersion = requestedVersion ? Number(requestedVersion) : 1;
   if (!Number.isInteger(templateVersion) || templateVersion < 1) throw createError({ statusCode: 400, statusMessage: "Invalid templateVersion" });
   await sendApiRequest(mediator, getCvTemplateQuery({ id: templateId, version: templateVersion }));

   const expiresAt = new Date(Date.now() + Number(process.env.CV_ARTIFACT_TTL_HOURS ?? 24) * 3_600_000).toISOString();
   const source = await cvArtifactRepo.putSource({
      ownerId, filename: file.filename, mediaType: file.type, bytes: file.data, expiresAt,
   });
   const job = await sendApiRequest<any>(mediator, createCvImportCommand({
      ownerId, source, template: { id: templateId, version: templateVersion },
      idempotencyKey: getHeader(event, "idempotency-key") || undefined,
   }));
   setResponseStatus(event, 202);
   void runCvImport(job.id);
   return job;
});
