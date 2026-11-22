import { useMediator } from "@ruxt/shared/cqrs";
import { upsertSubjectCommand } from "@ruxt/core/handlers/upsert-subject";
import { requireAdminPrincipal } from "../../../../utils/commercial-access";

// A subject carries tier, organisation and service-account flags that other policies trust, so only
// an administrator may write one: a caller must never be able to grant themselves a tier.
export default defineEventHandler(async (event) => {
   await requireAdminPrincipal(event);
   const userId = getRouterParam(event, "userId")!;
   const body = await readBody(event);
   const mediator = useMediator();
   return sendApiRequest(mediator, upsertSubjectCommand({
      userId,
      tier: body.tier,
      orgId: body.orgId,
      isServiceAccount: body.isServiceAccount,
   }));
});
