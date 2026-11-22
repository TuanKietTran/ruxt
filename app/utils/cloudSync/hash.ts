import type { SyncSnapshot } from "./types";

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");

/** SHA-256 of a snapshot's canonical bytes; equal hashes mean nothing needs to be uploaded or applied. */
export async function hashSnapshot(snapshot: SyncSnapshot): Promise<string> {
   const bytes = new TextEncoder().encode(JSON.stringify([snapshot.title, snapshot.content]));
   return hex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

/** The same fingerprint the server returns as `owner`, derived from the signed-in account id. */
export async function ownerFingerprint(ownerId: string): Promise<string> {
   const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ruxt-sync-owner:${ownerId}`));
   return hex(digest).slice(0, 32);
}

export const snapshotBytes = (snapshot: SyncSnapshot) => new TextEncoder().encode(snapshot.title).byteLength + new TextEncoder().encode(snapshot.content).byteLength;
