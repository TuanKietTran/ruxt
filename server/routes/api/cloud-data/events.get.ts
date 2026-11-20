/**
 * Push channel placeholder for runtimes without a sync hub. On Cloudflare the Worker entry answers
 * this path before Nitro (see infra/deploy/cloudflare/worker-entry.ts); elsewhere devices fall back
 * to adaptive reconciliation, which the sync response signals with `push: null`.
 */
export default defineEventHandler(async (event) => {
   await requireAuthUser(event);
   throw createError({ statusCode: 503, statusMessage: "Push is unavailable on this deployment", data: { code: "CLOUD_SYNC_PUSH_UNAVAILABLE" } });
});
