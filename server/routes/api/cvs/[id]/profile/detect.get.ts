import { useMediator } from "@core/cqrs";
import { detectCvProfileQuery } from "@core/handlers/detect-cv-profile";
import { assertCvId } from "../../../../../adapters/cv/document-store";

/** Report the profile values found in the session and where they appear. */
export default defineEventHandler(async (event) => {
    const documentId = assertCvId(getRouterParam(event, "id") ?? "");
    return sendApiRequest(useMediator(), detectCvProfileQuery({ documentId }));
});
