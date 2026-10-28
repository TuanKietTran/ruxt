import { useMediator } from "@ruxt/shared/cqrs";
import { listCvTemplatesQuery } from "@ruxt/core/handlers/list-cv-templates";
import type { CvTemplate } from "@ruxt/shared/cv";
import { requireCvOwner } from "../../../utils/cv-owner";
import { isCatalogTemplate } from "../../../adapters/cv/template-repo";

export default defineEventHandler(async (event) => {
   await requireCvOwner(event);
   setPrivateCache(event, 60);
   const templates = await sendApiRequest<CvTemplate[]>(useMediator(), listCvTemplatesQuery());
   return { templates: templates.filter(isCatalogTemplate) };
});
