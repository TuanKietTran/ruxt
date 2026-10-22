import { useMediator } from "@ruxt/shared/cqrs";
import { composeCvProfileQuery } from "@ruxt/core/handlers/compose-cv-profile";
import { assertCvId } from "../../../../../adapters/cv/document-store";
import { getAuthPrincipal } from "../../../../../utils/auth-user";

/** Compose a profile into the session (or a template) without writing anything. */
export default defineEventHandler(async (event) => {
    const documentId = assertCvId(getRouterParam(event, "id") ?? "");
    const body = await readBody<{ profile?: unknown; template?: { id?: string; version?: number } }>(event);
    if (!body?.profile) throw createError({ statusCode: 400, statusMessage: "profile is required" });
    const principal = await getAuthPrincipal(event);
    return sendApiRequest(useMediator(), composeCvProfileQuery({
        profile: body.profile,
        documentId,
        template: body.template?.id ? { id: body.template.id, version: body.template.version } : undefined,
        publicOnly: !principal,
    }));
});
