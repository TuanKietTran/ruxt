import type { H3Event } from "h3";

/** Responses that are identical for every visitor and change at most a few times a day. */
export const PUBLIC_NEAR_STATIC = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
const EDGE_TTL_SECONDS = 3600;

interface EdgeCache {
   match(key: Request): Promise<Response | undefined>;
   put(key: Request, response: Response): Promise<void>;
   delete(key: Request): Promise<boolean>;
}
const edgeCache = () => (globalThis as typeof globalThis & { caches?: { default?: EdgeCache } }).caches?.default;
// The build id keeps a new deployment from serving the previous one's cached bodies.
const edgeKey = (event: H3Event, path: string) =>
   new Request(new URL(`${path}${path.includes("?") ? "&" : "?"}build=${useRuntimeConfig(event).app.buildId}`, getRequestURL(event).origin));

/**
 * A response that depends on who asks: browsers may keep it (`maxAge` seconds, or revalidate every
 * time when 0) but shared caches never store it, and a sign-in or sign-out changes the cache entry.
 */
export function setPrivateCache(event: H3Event, maxAge = 0) {
   setResponseHeaders(event, {
      "cache-control": maxAge > 0 ? `private, max-age=${maxAge}` : "private, no-cache",
      vary: "Cookie, Authorization",
   });
}

/** Answer a conditional GET whose validator still matches. */
export function sendNotModified(event: H3Event, etag: string) {
   setResponseHeader(event, "etag", etag);
   setResponseStatus(event, 304);
   return null;
}

/**
 * Serve a public JSON GET through the Workers Cache API (`caches.default`) so repeat hits in one data
 * center skip KV and D1. The Worker still runs for each request; only the browser max-age in
 * PUBLIC_NEAR_STATIC avoids one. Without the Cache API (self-hosted, workers.dev) it only sets headers.
 */
export async function cachePublicJson<T>(event: H3Event, load: () => Promise<T>): Promise<T | string> {
   setResponseHeader(event, "cache-control", PUBLIC_NEAR_STATIC);
   const cache = edgeCache();
   if (!cache) return load();
   const url = getRequestURL(event);
   const key = edgeKey(event, `${url.pathname}${url.search}`);
   const hit = await cache.match(key);
   if (hit) {
      setResponseHeader(event, "content-type", "application/json");
      return hit.text();
   }
   const value = await load();
   const stored = new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json", "cache-control": `public, max-age=${EDGE_TTL_SECONDS}` },
   });
   event.waitUntil?.(cache.put(key, stored));
   return value;
}

/** Drop this data center's cached copy of a public response after a write that changes it. */
export async function purgePublicJson(event: H3Event, path: string) {
   await edgeCache()?.delete(edgeKey(event, path));
}
