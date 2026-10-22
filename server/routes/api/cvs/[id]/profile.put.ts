import { useMediator } from "@ruxt/shared/cqrs";
import { switchCvProfileCommand } from "@ruxt/core/handlers/switch-cv-profile";
import { assertCvId } from "../../../../adapters/cv/document-store";
import { getAuthPrincipal } from "../../../../utils/auth-user";

interface SwitchCvProfileBody {
    profile?: unknown;
    profileId?: string;
    template?: { id?: string; version?: number };
    expectedRevision?: number;
    sourceId?: string;
}

/** Re-render the session with another profile (and optionally another template). */
export default defineEventHandler(async (event) => {
    const documentId = assertCvId(getRouterParam(event, "id") ?? "");
    const body = await readBody<SwitchCvProfileBody>(event);
    if (!body?.profile) throw createError({ statusCode: 400, statusMessage: "profile is required" });
    const principal = await getAuthPrincipal(event);
    return sendApiRequest(useMediator(), switchCvProfileCommand({
        documentId,
        profile: body.profile,
        profileId: typeof body.profileId === "string" ? body.profileId : undefined,
        template: body.template?.id ? { id: body.template.id, version: body.template.version } : undefined,
        expectedRevision: body.expectedRevision,
        ownerId: principal?.ownerId,
        publicOnly: !principal,
        sourceId: typeof body.sourceId === "string" ? body.sourceId : undefined,
    }));
});
