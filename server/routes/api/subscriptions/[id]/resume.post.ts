import { requireOwnedSubscription } from "../../../../utils/commercial-access";
import { useMediator } from "@ruxt/shared/cqrs";
import { resumeSubscriptionCommand } from "@ruxt/core/handlers/resume-subscription";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   await requireOwnedSubscription(event, id);
   const mediator = useMediator();
   return sendApiRequest(mediator, resumeSubscriptionCommand({ subscriptionId: id }));
});
