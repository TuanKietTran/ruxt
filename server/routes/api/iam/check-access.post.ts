import { useMediator } from "@ruxt/shared/cqrs";
import { checkAccessQuery } from "@ruxt/core/handlers/check-access";
import { resolveSubject } from "../../../utils/commercial-access";

export default defineEventHandler(async (event) => {
   const body = await readBody(event);
   // Callers ask about themselves; asking about another subject (and so reading its tier) needs the administrator role.
   const { userId } = await resolveSubject(event, body?.userId);
   const mediator = useMediator();
   return sendApiRequest(mediator, checkAccessQuery({
      userId,
      action: body.action,
      resourceType: body.resourceType,
      resourceId: body.resourceId,
      ownerUserId: body.ownerUserId,
      ownerOrgId: body.ownerOrgId,
   }));
});
