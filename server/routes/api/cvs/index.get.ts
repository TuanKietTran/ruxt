import { useMediator } from "@ruxt/shared/cqrs";
import { listCvDocumentsQuery } from "@ruxt/core/handlers/list-cv-documents";

export default defineEventHandler(async () => ({
    documents: await sendApiRequest(useMediator(), listCvDocumentsQuery()),
}));
