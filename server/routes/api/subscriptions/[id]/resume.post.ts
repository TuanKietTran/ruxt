import { useMediator } from "@ruxt/shared/cqrs";
import { resumeSubscriptionCommand } from "@ruxt/core/handlers/resume-subscription";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const mediator = useMediator();
   return sendApiRequest(mediator, resumeSubscriptionCommand({ subscriptionId: id }));
});
