const DEVELOPMENT_SESSION_SECRET = "dev-only-secret-change-me-in-production!!";

/** Validate the selected Wrangler environment before serving requests. */
export default defineNitroPlugin(() => {
   const env = (globalThis as typeof globalThis & { __env__?: Record<string, unknown> }).__env__;
   if (!env?.RUXT_DB || !env?.RUXT_KV) return;
   const deploymentEnv = String(env.RUXT_DEPLOYMENT_ENV ?? "development");
   const production = deploymentEnv === "production";
   const publishableKey = String(env.NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "");
   const secretKey = String(env.NUXT_CLERK_SECRET_KEY ?? "");
   const sessionSecret = String(env.NUXT_SESSION_SECRET ?? "");
   const expectedPublishable = production ? "pk_live_" : "pk_test_";
   const expectedSecret = production ? "sk_live_" : "sk_test_";
   const problems: string[] = [];
   if (!publishableKey.startsWith(expectedPublishable)) problems.push(`NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with ${expectedPublishable}`);
   if (!secretKey.startsWith(expectedSecret)) problems.push(`NUXT_CLERK_SECRET_KEY must start with ${expectedSecret}`);
   if (sessionSecret.length < 32 || sessionSecret === DEVELOPMENT_SESSION_SECRET) problems.push("NUXT_SESSION_SECRET must be a unique secret of at least 32 characters");
   if (problems.length) throw new Error(`Invalid Cloudflare ${production ? "Production" : "Development"} environment: ${problems.join("; ")}`);
});
