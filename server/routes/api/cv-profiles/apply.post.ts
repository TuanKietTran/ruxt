import { useMediator } from "@core/cqrs";
import { applyCvProfileCommand } from "@core/handlers/apply-cv-profile";
import { assertCvId } from "../../../adapters/cv/document-store";
import { getAuthPrincipal } from "../../../utils/auth-user";

interface ApplyCvProfileBody {
    profile?: unknown;
    profileId?: string;
    documentIds?: unknown;
    template?: { id?: string; version?: number };
    sourceId?: string;
}

/** Re-render several sessions with one profile; each session succeeds or fails on its own. */
export default defineEventHandler(async (event) => {
    const body = await readBody<ApplyCvProfileBody>(event);
    if (!body?.profile) throw createError({ statusCode: 400, statusMessage: "profile is required" });
    if (!Array.isArray(body.documentIds) || !body.documentIds.length) throw createError({ statusCode: 400, statusMessage: "documentIds is required" });
    const documentIds = body.documentIds.map(id => assertCvId(typeof id === "string" ? id : ""));
    const principal = await getAuthPrincipal(event);
    return sendApiRequest(useMediator(), applyCvProfileCommand({
        documentIds,
        profile: body.profile,
        profileId: typeof body.profileId === "string" ? body.profileId : undefined,
        template: body.template?.id ? { id: body.template.id, version: body.template.version } : undefined,
        ownerId: principal?.ownerId,
        publicOnly: !principal,
        sourceId: typeof body.sourceId === "string" ? body.sourceId : undefined,
    }));
});
