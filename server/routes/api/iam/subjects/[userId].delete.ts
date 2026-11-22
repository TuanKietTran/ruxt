import { useMediator } from "@ruxt/shared/cqrs";
import { deleteSubjectCommand } from "@ruxt/core/handlers/delete-subject";
import { requireAdminPrincipal } from "../../../../utils/commercial-access";

export default defineEventHandler(async (event) => {
   await requireAdminPrincipal(event);
   const userId = getRouterParam(event, "userId")!;
   const mediator = useMediator();
   return sendApiRequest(mediator, deleteSubjectCommand({ userId }));
});
