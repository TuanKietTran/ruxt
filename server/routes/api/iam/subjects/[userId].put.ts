import { useMediator } from "@ruxt/core/cqrs";
import { upsertSubjectCommand } from "@ruxt/core/handlers/upsert-subject";

export default defineEventHandler(async (event) => {
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
