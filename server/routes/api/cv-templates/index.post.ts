import { useMediator } from "@ruxt/shared/cqrs";
import { saveCvTemplateCommand } from "@ruxt/core/handlers/save-cv-template";
import type { CvTemplate } from "@ruxt/shared/cv";
import { requireCvOwner } from "../../../utils/cv-owner";

export default defineEventHandler(async (event) => {
   await requireCvOwner(event);
   const body = await readBody<{ name?: string; markdownSkeleton?: string; css?: string; overrideId?: string }>(event);
   const template = await sendApiRequest<CvTemplate>(useMediator(), saveCvTemplateCommand({
      name: body?.name ?? "",
      markdownSkeleton: body?.markdownSkeleton as string,
      css: body?.css as string,
      overrideId: body?.overrideId || undefined,
   }));
   setResponseStatus(event, 201);
   return template;
});
