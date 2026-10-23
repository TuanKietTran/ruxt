import type { H3Event } from "h3";

export type AuthProvider = "clerk" | "legacy";

export interface AuthPrincipal {
   ownerId: string;
   provider: AuthProvider;
   providerUserId: string;
}

/** Namespace broker ids so they can never collide with legacy UUID owners. */
export function clerkOwnerId(clerkUserId: string): string {
   if (!clerkUserId) throw new Error("Clerk user id is required");
   return `clerk:${clerkUserId}`;
}

export async function getAuthPrincipal(event: H3Event): Promise<AuthPrincipal | null> {
   const clerkAuth = event.context.auth ? await event.context.auth() : null;
   if (clerkAuth?.userId) {
      return {
         ownerId: clerkOwnerId(clerkAuth.userId),
         provider: "clerk",
         providerUserId: clerkAuth.userId,
      };
   }

   const session = await getAuthSession(event);
   const legacyUserId = session.data?.userId;
   return legacyUserId
      ? { ownerId: legacyUserId, provider: "legacy", providerUserId: legacyUserId }
      : null;
}

export async function requireAuthUser(event: H3Event): Promise<string> {
   const principal = await getAuthPrincipal(event);
   if (!principal) throw createError({ statusCode: 401, statusMessage: "Authentication required" });
   return principal.ownerId;
}
