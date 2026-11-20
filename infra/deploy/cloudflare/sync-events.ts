import type { SyncTicketClaims } from "../../crypto/cloud-sync-ticket";

/** Bindings the push channel needs on the Worker. */
export interface SyncHubEnv {
   SYNC_HUB?: {
      idFromName(name: string): unknown;
      get(id: unknown): { fetch(input: string | Request, init?: RequestInit): Promise<Response> };
   };
   NUXT_CLOUD_SYNC_TICKET_SECRET?: string;
   NUXT_SESSION_SECRET?: string;
}

type Verify = (secret: string, ticket: string) => Promise<SyncTicketClaims | null>;

export const syncTicketSecret = (env: SyncHubEnv) => env.NUXT_CLOUD_SYNC_TICKET_SECRET || env.NUXT_SESSION_SECRET || "";

/**
 * Accept a push connection: a WebSocket upgrade carrying a valid ticket goes to the hub named by the
 * ticket's owner key; anything else is refused without touching a Durable Object. The response never
 * says whether an owner exists.
 */
export async function handleSyncEvents(request: Request, env: SyncHubEnv, verify: Verify): Promise<Response> {
   if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
   if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
   const secret = syncTicketSecret(env);
   if (!env.SYNC_HUB || secret.length < 32) return new Response("Push unavailable", { status: 503 });
   const ticket = new URL(request.url).searchParams.get("ticket") ?? "";
   const claims = await verify(secret, ticket);
   if (!claims) return new Response("Invalid or expired ticket", { status: 401 });
   const hub = env.SYNC_HUB.get(env.SYNC_HUB.idFromName(claims.k));
   const target = new URL("https://sync-hub/connect");
   target.searchParams.set("device", claims.d);
   return hub.fetch(new Request(target, request));
}

/** Tell an owner's other devices that the cloud set changed. Best effort: delivery is never awaited by the writer. */
export async function notifySyncHub(env: SyncHubEnv, ownerKey: string, cursor: number, originDevice: string): Promise<void> {
   if (!env.SYNC_HUB) return;
   const hub = env.SYNC_HUB.get(env.SYNC_HUB.idFromName(ownerKey));
   await hub.fetch("https://sync-hub/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cursor, origin: originDevice }),
   });
}
