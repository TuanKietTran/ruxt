import { useMediator } from "@ruxt/shared/cqrs";
import { getCvDocumentQuery } from "@ruxt/core/handlers/get-cv-document";
import { assertCvId } from "../../../adapters/cv/document-store";

export default defineEventHandler(async (event) => {
    const id = assertCvId(getRouterParam(event, "id") ?? "");
    return sendApiRequest(useMediator(), getCvDocumentQuery({ id }));
});
