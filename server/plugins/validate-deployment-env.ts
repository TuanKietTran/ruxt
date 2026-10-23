const DEVELOPMENT_SESSION_SECRET = "dev-only-secret-change-me-in-production!!";

/**
 * Fail a Deno timeline early when its Clerk environment is missing or unsafe.
 * Deno's Production context must use Clerk production keys; Preview and Git
 * Branch timelines intentionally use the isolated Clerk development instance.
 */
export default defineNitroPlugin(() => {
   const timeline = process.env.DENO_TIMELINE;
   if (!timeline) return;

   const production = timeline === "production";
   const expectedPublishablePrefix = production ? "pk_live_" : "pk_test_";
   const expectedSecretPrefix = production ? "sk_live_" : "sk_test_";
   const publishableKey = process.env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
   const secretKey = process.env.NUXT_CLERK_SECRET_KEY ?? "";
   const sessionSecret = process.env.NUXT_SESSION_SECRET ?? "";
   const context = production ? "Production" : "Development";

   const problems: string[] = [];
   if (!publishableKey.startsWith(expectedPublishablePrefix)) {
      problems.push(`NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with ${expectedPublishablePrefix}`);
   }
   if (!secretKey.startsWith(expectedSecretPrefix)) {
      problems.push(`NUXT_CLERK_SECRET_KEY must start with ${expectedSecretPrefix}`);
   }
   if (sessionSecret.length < 32 || sessionSecret === DEVELOPMENT_SESSION_SECRET) {
      problems.push("NUXT_SESSION_SECRET must be a unique secret of at least 32 characters");
   }

   if (problems.length) {
      throw new Error(
         `Invalid Deno ${context} context for timeline ${JSON.stringify(timeline)}: ${problems.join("; ")}`,
      );
   }
});
