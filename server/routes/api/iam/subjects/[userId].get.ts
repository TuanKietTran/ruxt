import { useMediator } from "@ruxt/shared/cqrs";
import { getSubjectQuery } from "@ruxt/core/handlers/get-subject";
import { resolveSubject } from "../../../../utils/commercial-access";

export default defineEventHandler(async (event) => {
   // Your own subject, or any subject for an administrator.
   const { userId } = await resolveSubject(event, getRouterParam(event, "userId"));
   const mediator = useMediator();
   return sendApiRequest(mediator, getSubjectQuery({ userId }));
});
