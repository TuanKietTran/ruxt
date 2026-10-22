import { useMediator } from "@ruxt/core/cqrs";
import { saveCvSourceCommand } from "@ruxt/core/handlers/save-cv-source";
import type { UpdateCvDocumentInput } from "@ruxt/core/domain/cv";
import { assertCvId } from "../../../adapters/cv/document-store";

export default defineEventHandler(async (event) => {
    const id = assertCvId(getRouterParam(event, "id") ?? "");
    const input = await readBody<UpdateCvDocumentInput>(event);
    return sendApiRequest(useMediator(), saveCvSourceCommand({ id, ...(input ?? {}) }));
});
