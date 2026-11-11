import { useMediator } from "@ruxt/shared/cqrs";
import { listCvTemplatesQuery } from "@ruxt/core/handlers/list-cv-templates";
import type { CvTemplate } from "@ruxt/shared/cv";
import { requireCvOwner } from "../../../utils/cv-owner";
import { isPublicCvTemplate } from "../../../utils/cv-template-visibility";

export default defineEventHandler(async (event) => {
   await requireCvOwner(event);
   setPrivateCache(event, 60);
   const templates = await sendApiRequest<CvTemplate[]>(useMediator(), listCvTemplatesQuery());
   const body = { templates: templates.filter(isPublicCvTemplate) };
   const etag = jsonEtag(body);
   if (matchesIfNoneMatch(event, etag)) return sendNotModified(event, etag);
   setResponseHeader(event, "etag", etag);
   return body;
});
