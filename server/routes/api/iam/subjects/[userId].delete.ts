import { useMediator } from "@ruxt/core/cqrs";
import { deleteSubjectCommand } from "@ruxt/core/handlers/delete-subject";

export default defineEventHandler(async (event) => {
   const userId = getRouterParam(event, "userId")!;
   const mediator = useMediator();
   return sendApiRequest(mediator, deleteSubjectCommand({ userId }));
});
