import { useMediator } from "@core/cqrs";
import { listCvTemplatesQuery } from "@core/handlers/list-cv-templates";
import type { CvTemplate } from "@core/domain/cv";
import { isCatalogTemplate } from "../../../adapters/cv/template-repo";

/** Public catalog. Visibility is read from each persisted template's data tags. */
export default defineEventHandler(async () => {
   const templates = await sendApiRequest<CvTemplate[]>(useMediator(), listCvTemplatesQuery());
   return { templates: templates.filter(template => template.tags.includes("public") && isCatalogTemplate(template)) };
});
