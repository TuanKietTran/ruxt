import { getAuthPrincipal } from "../../../utils/auth-user";

/**
 * Job automation proxy. The browser talks to Ruxt only; Ruxt forwards signed-in requests from the
 * configured owner to the Job CV Finder core with a server-held bearer token. The token, platform
 * credentials and worker endpoints never reach the browser.
 *
 * Configuration (runtimeConfig.jobAutomation, set via NUXT_JOB_AUTOMATION_*):
 *   url    core base URL (empty = feature unavailable, 503)
 *   token  core API token
 *   owner  the single owner id allowed to use the feature (job automation is single-candidate)
 */
const ALLOWED = /^v1\/(?:integration\/health|overview|analytics|sources(?:\/[^/]+(?:\/discover)?|\/ats)?|accounts(?:\/[^/]+(?:\/credential)?)?|jobs(?:\/manual|\/[^/]+(?:\/description)?)?|candidate(?:\/snapshots|\/facts)?|applications(?:\/[^/]+(?:\/actions\/[a-z-]+|\/documents\/[^/]+\/registration)?)?|intake\/(?:emails|messages)|events(?:\/stream)?|tasks)$/;
const METHODS = new Set(["GET", "POST", "PUT", "PATCH"]);

export default defineEventHandler(async (event) => {
   const principal = await getAuthPrincipal(event);
   if (!principal) throw createError({ statusCode: 401, statusMessage: "Authentication required" });
   const config = useRuntimeConfig(event).jobAutomation as { url?: string; token?: string; owner?: string } | undefined;
   if (!config?.url || !config.token || !config.owner) {
      throw createError({ statusCode: 503, statusMessage: "Job automation is not configured on this deployment" });
   }
   // Same response as an unknown route, so the feature's existence is not revealed to other accounts.
   if (principal.ownerId !== config.owner) throw createError({ statusCode: 404, statusMessage: "Not found" });

   const path = getRouterParam(event, "path") ?? "";
   const method = event.method.toUpperCase();
   if (!ALLOWED.test(path) || !METHODS.has(method) || path.includes("..")) {
      throw createError({ statusCode: 404, statusMessage: "Not found" });
   }
   const query = getRequestURL(event).search;
   const headers: Record<string, string> = { authorization: `Bearer ${config.token}` };
   const contentType = getRequestHeader(event, "content-type");
   if (contentType) headers["content-type"] = contentType;
   const lastEventId = getRequestHeader(event, "last-event-id");
   if (lastEventId) headers["last-event-id"] = lastEventId;

   const body = method === "GET" ? undefined : await readRawBody(event, "utf8");
   const upstream = await fetch(`${config.url.replace(/\/$/, "")}/api/${path}${query}`, {
      method, headers, body: body ?? undefined, signal: path === "v1/events/stream" ? undefined : AbortSignal.timeout(120_000),
   }).catch(() => null);
   if (!upstream) throw createError({ statusCode: 502, statusMessage: "Job automation core unreachable" });

   setResponseStatus(event, upstream.status);
   setHeader(event, "cache-control", "private, no-store");
   const type = upstream.headers.get("content-type");
   if (type) setHeader(event, "content-type", type);
   if (type?.startsWith("text/event-stream")) return sendStream(event, upstream.body!);
   return upstream.status === 204 ? null : new Uint8Array(await upstream.arrayBuffer());
});
