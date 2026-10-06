import { useMediator } from "@core/cqrs";
import { listCvTemplatesQuery } from "@core/handlers/list-cv-templates";
import type { CvTemplate } from "@core/domain/cv";
import { requireCvOwner } from "../../../utils/cv-owner";
import { isCatalogTemplate } from "../../../adapters/cv/template-repo";

export default defineEventHandler(async (event) => {
   await requireCvOwner(event);
   const templates = await sendApiRequest<CvTemplate[]>(useMediator(), listCvTemplatesQuery());
   return { templates: templates.filter(isCatalogTemplate) };
});
