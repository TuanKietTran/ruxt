import { afterAll, describe, expect, it, vi } from "vitest";
import { clerkFetcher, clerkTestSecret, createClerkTestUser, deleteClerkTestUser, type ClerkTestUser } from "../helpers/clerk-e2e";

/**
 * A tab that missed an account switch must never act as the account now in the session cookie. Real
 * server, real Clerk session tokens, a real cloud-copy store. Needs cloud retention configured on the
 * server (NUXT_CLOUD_RETENTION_*, see tests/e2e/README.md); otherwise the write checks are skipped.
 */
const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (base && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("These tests create Clerk users and need a local server");
const secret = clerkTestSecret();
const suite = base && secret ? describe : describe.skip;
vi.setConfig({ testTimeout: 90_000, hookTimeout: 30_000 });

const users: ClerkTestUser[] = [];
afterAll(async () => { await Promise.all(users.map(user => deleteClerkTestUser(secret!, user))); });

const DEVICE = "device-owner-guard-0001";
const save = (id: string, content: string) => ({
   mutationId: `m-${id}`, operation: "save", kind: "session", clientItemId: id, expectedRevision: 0, snapshot: { title: id, content },
});

suite("expected-owner guard", () => {
   it("refuses a request made for another account before any handler runs, and leaves the real account untouched", async () => {
      const alice = await createClerkTestUser(secret!, "guard-alice"); users.push(alice);
      const bob = await createClerkTestUser(secret!, "guard-bob"); users.push(bob);
      const asBob = clerkFetcher(secret!, base!, bob);

      const consent = await asBob("/api/cloud-data/consent");
      expect(consent.status).toBe(200);
      const configured = (consent.json?.retentionConfigurationMissing ?? []).length === 0;
      if (configured) {
         expect((await asBob("/api/cloud-data/retention-acknowledgement", { method: "POST" })).status).toBe(200);
         expect((await asBob("/api/cloud-data/consent", { method: "PUT", body: { category: "cloudSessions", granted: true } })).status).toBe(200);
      }

      // The tab believes it is Alice; the session is Bob's. Nothing may be written for Bob.
      const mismatched = await asBob("/api/cloud-data/sync", {
         method: "POST", headers: { "x-ruxt-expected-owner": alice.ownerId },
         body: { deviceId: DEVICE, since: null, mutations: [save("alice-record", "Alice's private content")] },
      });
      expect(mismatched.status).toBe(409);
      expect(mismatched.json?.data?.code).toBe("OWNER_MISMATCH");

      for (const path of ["/api/preferences", "/api/cloud-data/consent", "/api/cloud-data/copies/session/alice-record", "/api/subscriptions?userId=" + encodeURIComponent(bob.ownerId)]) {
         expect((await asBob(path, { headers: { "x-ruxt-expected-owner": alice.ownerId } })).status).toBe(409);
      }
      expect((await asBob("/api/preferences", { method: "PUT", headers: { "x-ruxt-expected-owner": alice.ownerId }, body: { preferences: { profileSaveMode: "manual" } } })).status).toBe(409);

      // The correct account, or no claim at all (an older bundle), is served as before.
      expect((await asBob("/api/preferences", { headers: { "x-ruxt-expected-owner": bob.ownerId } })).status).toBe(200);
      expect((await asBob("/api/preferences")).status).toBe(200);
      expect((await asBob("/api/preferences", { headers: { "x-ruxt-expected-owner": "" } })).status).toBe(200);

      if (configured) {
         const listing = await asBob("/api/cloud-data/sync", {
            method: "POST", headers: { "x-ruxt-expected-owner": bob.ownerId },
            body: { deviceId: DEVICE, since: null, mutations: [] },
         });
         expect(listing.status).toBe(200);
         expect(JSON.stringify(listing.json.changes)).not.toContain("alice-record");
         expect(JSON.stringify(listing.json.changes)).not.toContain("Alice's private content");
      }
   });
});
