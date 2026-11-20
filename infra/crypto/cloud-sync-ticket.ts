/**
 * Short-lived, HMAC-signed connection tickets for the cloud-sync push channel.
 *
 * The authenticated sync route mints a ticket for the verified owner and the caller's device; the
 * Worker entry verifies it before handing the WebSocket to that owner's hub. A ticket carries only an
 * opaque owner key (an HMAC of the owner id, never the id itself), the device id and an expiry. Push
 * messages carry no record content, so a ticket grants no data access: data still moves only through
 * the authenticated sync route. Web Crypto only (Workers and Node 22).
 */

const encoder = new TextEncoder();
export const SYNC_TICKET_TTL_SECONDS = 5 * 60;
const DEVICE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export interface SyncTicketClaims {
   /** Opaque owner key; names the owner's hub. */
   k: string;
   /** Device id, used to skip notifying the device that made a change. */
   d: string;
   /** Expiry, seconds since the epoch. */
   e: number;
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));

const keys = new Map<string, Promise<CryptoKey>>();
function hmacKey(secret: string): Promise<CryptoKey> {
   if (!secret || secret.length < 32) throw new Error("Cloud sync ticket secret must be at least 32 characters");
   let key = keys.get(secret);
   if (!key) {
      key = crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
      keys.set(secret, key);
   }
   return key;
}

async function sign(secret: string, purpose: string, value: string): Promise<Uint8Array> {
   return new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(`ruxt-cloud-sync:${purpose}:v1|${value}`)));
}

export const isSyncDeviceId = (value: unknown): value is string => typeof value === "string" && DEVICE_ID.test(value);

/** Stable opaque key for an owner: safe to show the browser and to name a Durable Object. */
export async function cloudSyncOwnerKey(secret: string, ownerId: string): Promise<string> {
   return base64url((await sign(secret, "owner", ownerId)).slice(0, 18));
}

export async function mintSyncTicket(secret: string, claims: SyncTicketClaims): Promise<string> {
   if (!isSyncDeviceId(claims.d)) throw new Error("Invalid sync device id");
   const payload = base64url(encoder.encode(JSON.stringify(claims)));
   return `${payload}.${base64url(await sign(secret, "ticket", payload))}`;
}

/** Returns the claims of a valid, unexpired ticket, or null. */
export async function verifySyncTicket(secret: string, ticket: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<SyncTicketClaims | null> {
   if (typeof ticket !== "string" || ticket.length > 1024) return null;
   const [payload, signature, extra] = ticket.split(".");
   if (!payload || !signature || extra !== undefined) return null;
   try {
      const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromBase64url(signature),
         encoder.encode(`ruxt-cloud-sync:ticket:v1|${payload}`));
      if (!valid) return null;
      const claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as SyncTicketClaims;
      if (typeof claims?.k !== "string" || !isSyncDeviceId(claims.d) || !Number.isSafeInteger(claims.e)) return null;
      return claims.e > nowSeconds ? claims : null;
   } catch {
      return null;
   }
}
