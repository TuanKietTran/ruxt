import { getAuthPrincipal } from "../utils/auth-user";

/**
 * The browser says which account it believes it is acting as (`x-ruxt-expected-owner`). A tab that
 * missed an account switch in another tab still holds the old account's records and sync state while the
 * shared session cookie now names someone else; without this check its next request would act as the new
 * account (an upload of the old account's records into the new account's cloud copies).
 *
 * The check is a safety net against accidents, not authentication: the session still decides who the
 * caller is. It runs before any handler, so a refused request changes nothing.
 */
const GUARDED = /^\/api\/(preferences|cloud-data|cv-templates|cv-imports|cv-applications|cv-artifacts|subscriptions|plans|jobs|iam)(\/|$)/;

export default defineEventHandler(async (event) => {
   const expected = getRequestHeader(event, "x-ruxt-expected-owner");
   if (!expected || !GUARDED.test(getRequestURL(event).pathname)) return;
   const principal = await getAuthPrincipal(event);
   // Anonymous callers are refused by each route; only a real, different account is a mismatch.
   if (principal && principal.ownerId !== expected) {
      throw createError({
         statusCode: 409,
         statusMessage: "The signed-in account changed. Reload this page to continue as the current account.",
         data: { code: "OWNER_MISMATCH" },
      });
   }
});
