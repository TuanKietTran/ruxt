import { useMediator } from "@ruxt/shared/cqrs";
import { cloneCvTemplateCommand } from "@ruxt/core/handlers/clone-cv-template";
import { requireCvOwner } from "../../../../utils/cv-owner";

export default defineEventHandler(async (event) => {
   await requireCvOwner(event);
   const id = getRouterParam(event, "id") ?? "";
   const body = await readBody<{ version?: number; newId?: string }>(event);
   if (!body?.newId) throw createError({ statusCode: 400, statusMessage: "newId is required" });
   const template = await sendApiRequest(useMediator(), cloneCvTemplateCommand({
      id,
      version: body.version,
      newId: body.newId,
   }));
   await purgePublicJson(event, "/api/public/templates");
   setResponseStatus(event, 201);
   return template;
});
