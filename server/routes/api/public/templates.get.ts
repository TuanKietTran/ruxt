import { useMediator } from "@ruxt/shared/cqrs";
import { listCvTemplatesQuery } from "@ruxt/core/handlers/list-cv-templates";
import type { CvTemplate } from "@ruxt/shared/cv";
import { isCatalogTemplate } from "../../../adapters/cv/template-repo";

/** Public catalog. Visibility is read from each persisted template's data tags. */
export default defineEventHandler(async (event) => {
   const result = await cachePublicJson(event, async () => {
      const templates = await sendApiRequest<CvTemplate[]>(useMediator(), listCvTemplatesQuery());
      return { templates: templates.filter(template => template.tags.includes("public") && isCatalogTemplate(template)) };
   });
   const body = typeof result === "string" ? JSON.parse(result) as { templates: CvTemplate[] } : result;
   const etag = jsonEtag(body);
   if (matchesIfNoneMatch(event, etag)) return sendNotModified(event, etag);
   setResponseHeader(event, "etag", etag);
   return result;
});
