import { useMediator } from "@core/cqrs";
import { getUserQuery } from "@core/handlers/get-user";
import { clerkClient } from "@clerk/nuxt/server";

export default defineEventHandler(async (event) => {
  const principal = await getAuthPrincipal(event);
  if (!principal) {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }

  if (principal.provider === "clerk") {
    try {
      const user = await clerkClient(event as any).users.getUser(principal.providerUserId);
      const primary = user.emailAddresses.find(address => address.id === user.primaryEmailAddressId)
        ?? user.emailAddresses[0];
      if (!primary?.emailAddress) throw new Error("Clerk user has no email address");
      return { id: principal.ownerId, email: primary.emailAddress };
    } catch {
      throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
    }
  }

  const mediator = useMediator();
  try {
    return await mediator.send(getUserQuery({ userId: principal.providerUserId }));
  } catch {
    throw createError({ statusCode: 401, statusMessage: "Not authenticated" });
  }
});
