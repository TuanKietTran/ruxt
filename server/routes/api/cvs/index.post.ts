import { useMediator } from "@ruxt/shared/cqrs";
import { createCvDocumentCommand } from "@ruxt/core/handlers/create-cv-document";
import { assertCvId } from "../../../adapters/cv/document-store";

export default defineEventHandler(async (event) => {
   const body = await readBody<{ id?: string; title?: string; markdown?: string; css?: string; sourceId?: string }>(event);
   const id = assertCvId(body?.id ?? "");
   if (typeof body?.markdown !== "string" || typeof body?.css !== "string") {
      throw createError({ statusCode: 400, statusMessage: "markdown and css are required" });
   }
   const document = await sendApiRequest(useMediator(), createCvDocumentCommand({
      id,
      title: body.title,
      markdown: body.markdown,
      css: body.css,
      sourceId: body.sourceId,
   }));
   setResponseStatus(event, 201);
   return document;
});
