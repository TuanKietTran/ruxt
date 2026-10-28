import { useMediator } from "@ruxt/shared/cqrs";
import { getCvDocumentQuery } from "@ruxt/core/handlers/get-cv-document";
import type { CvDocument } from "@ruxt/shared/cv";
import { assertCvId, peekCvDocument } from "../../../adapters/cv/document-store";

export default defineEventHandler(async (event) => {
    const id = assertCvId(getRouterParam(event, "id") ?? "");
    setPrivateCache(event);
    // The editor's revision probe: an unchanged document answers 304 from one storage read, without
    // reading chunks or sending the source again.
    const ifNoneMatch = getRequestHeader(event, "if-none-match");
    if (ifNoneMatch) {
        const stored = await peekCvDocument(id);
        if (stored && cvDocumentEtag(stored) === ifNoneMatch) return sendNotModified(event, ifNoneMatch);
    }
    const document = await sendApiRequest<CvDocument>(useMediator(), getCvDocumentQuery({ id }));
    const etag = cvDocumentEtag(document);
    if (ifNoneMatch === etag) return sendNotModified(event, etag);
    setResponseHeader(event, "etag", etag);
    return document;
});
