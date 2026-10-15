import { useMediator } from "@core/cqrs";
import { resumeSubscriptionCommand } from "@core/handlers/resume-subscription";
import { requireOwnedSubscription } from "../../../../utils/auth-user";

export default defineEventHandler(async (event) => {
   const id = getRouterParam(event, "id")!;
   const mediator = useMediator();
   await requireOwnedSubscription(event, mediator, id);
   return sendApiRequest(mediator, resumeSubscriptionCommand({ subscriptionId: id }));
});
