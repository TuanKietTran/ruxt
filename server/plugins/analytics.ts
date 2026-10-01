import type { H3Event } from "h3";
import { setMediatorObserver } from "@core/cqrs";
import { normalizeRoutePath } from "@ruxt/core/domain/analytics";

const FLUSH_INTERVAL_MS = 30_000;
const isAsset = (path: string) => path.startsWith("/_") || /\.[a-z0-9]{1,8}$/i.test(path);

function routeKey(event: H3Event): string {
   const pattern = event.context.matchedRoute?.path as string | undefined;
   const path = pattern && !pattern.includes("*") ? pattern : normalizeRoutePath(event.path);
   return `${event.method} ${path}`;
}

/** Resolve the owner without creating a legacy session for anonymous requests. */
async function requestOwner(event: H3Event): Promise<string | null> {
   try {
      const clerk = event.context.auth ? await event.context.auth() : null;
      if (clerk?.userId) return clerkOwnerId(clerk.userId);
      if (!getCookie(event, "auth_session")) return null;
      return (await getAuthSession(event)).data?.userId ?? null;
   } catch {
      return null;
   }
}

/**
 * Produce route, user, and CQRS metrics for the dedicated admin app. Samples
 * are aggregated in-process per UTC hour and flushed to `analytics` storage.
 */
export default defineNitroPlugin((nitroApp) => {
   setMediatorObserver((request, outcome) => {
      recordMetric("cqrs", `${request._type} ${request.requestName}`, outcome);
   });

   nitroApp.hooks.hook("request", (event) => {
      event.context.analyticsStartedAt = performance.now();
   });

   nitroApp.hooks.hook("afterResponse", async (event) => {
      const startedAt = event.context.analyticsStartedAt;
      const pathname = event.path.split("?")[0] ?? "/";
      if (typeof startedAt !== "number" || isAsset(pathname)) return;
      const status = getResponseStatus(event);
      const ok = status < 500;
      recordMetric("routes", routeKey(event), { durationMs: performance.now() - startedAt, ok, status });
      if (pathname.startsWith("/api/")) {
         const owner = await requestOwner(event);
         if (owner) recordMetric("users", owner, { durationMs: 0, ok, status });
      }
   });

   const timer = setInterval(() => void flushMetrics(), FLUSH_INTERVAL_MS);
   (timer as { unref?: () => void }).unref?.();
   nitroApp.hooks.hook("close", async () => {
      clearInterval(timer);
      await flushMetrics();
   });
});
