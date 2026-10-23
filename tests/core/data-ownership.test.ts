import { describe, expect, it } from "vitest";
import type { CloudConsentCategoryState, CloudConsentEvent } from "@ruxt/core/domain/cloud-data/consent";
import { createGetCloudDataConsentHandler } from "@ruxt/core/handlers/get-cloud-data-consent";
import { createSetCloudDataConsentHandler } from "@ruxt/core/handlers/set-cloud-data-consent";
import type { CloudConsentRepository } from "@ruxt/core/repos/cloud-consent.repo";
import { clerkOwnerId } from "../../server/utils/auth-user";

class OwnerScopedConsentRepo implements CloudConsentRepository {
   readonly current = new Map<string, CloudConsentCategoryState>();
   readonly events: CloudConsentEvent[] = [];

   async listCurrent(ownerId: string) {
      return [...this.current.values()]
         .filter(state => state.ownerId === ownerId)
         .map(state => structuredClone(state));
   }

   async saveChange(state: CloudConsentCategoryState, event: CloudConsentEvent) {
      this.current.set(`${state.ownerId}:${state.category}`, structuredClone(state));
      this.events.push(structuredClone(event));
   }

   async listEvents(ownerId: string) {
      return this.events.filter(event => event.ownerId === ownerId).map(event => structuredClone(event));
   }
}

const data = async <I, O>(handler: {
   execute(input: I): Promise<{ success: true; data: O } | { success: false; error: string }>;
}, input: I): Promise<O> => {
   const result = await handler.execute(input);
   if (!result.success) throw new Error(result.error);
   return result.data;
};

describe("authenticated cloud-data ownership", () => {
   it("starts every authenticated owner independently denied", async () => {
      const repo = new OwnerScopedConsentRepo();
      const get = createGetCloudDataConsentHandler(repo);

      const [alice, bob] = await Promise.all([
         data(get, { userId: "owner-alice" }),
         data(get, { userId: "owner-bob" }),
      ]);

      expect(alice).toMatchObject({
         cloudSessions: { granted: false },
         cloudTemplates: { granted: false },
      });
      expect(bob).toEqual(alice);
      expect(repo.current.size).toBe(0);
      expect(repo.events).toHaveLength(0);
   });

   it("never exposes one authenticated owner's grant to another owner", async () => {
      const repo = new OwnerScopedConsentRepo();
      const set = createSetCloudDataConsentHandler(repo, {
         now: () => new Date("2026-09-21T12:00:00.000Z"),
         newId: () => "event-alice",
      });
      const get = createGetCloudDataConsentHandler(repo);

      await data(set, { userId: "owner-alice", category: "cloudSessions", granted: true });

      await expect(data(get, { userId: "owner-alice" })).resolves.toMatchObject({
         cloudSessions: { granted: true },
      });
      await expect(data(get, { userId: "owner-bob" })).resolves.toMatchObject({
         cloudSessions: { granted: false },
      });
      expect(await repo.listEvents("owner-bob")).toEqual([]);
      expect(await repo.listEvents("owner-alice")).toEqual([
         expect.objectContaining({ ownerId: "owner-alice", actorUserId: "owner-alice" }),
      ]);
   });

   it("keeps legacy and Clerk ownership namespaces separate", async () => {
      const repo = new OwnerScopedConsentRepo();
      let event = 0;
      const set = createSetCloudDataConsentHandler(repo, {
         now: () => new Date("2026-09-21T12:00:00.000Z"),
         newId: () => `event-${++event}`,
      });
      const get = createGetCloudDataConsentHandler(repo);
      const legacyOwner = "user_123";
      const brokerOwner = clerkOwnerId("user_123");

      await data(set, { userId: legacyOwner, category: "cloudTemplates", granted: true });

      await expect(data(get, { userId: legacyOwner })).resolves.toMatchObject({
         cloudTemplates: { granted: true },
      });
      await expect(data(get, { userId: brokerOwner })).resolves.toMatchObject({
         cloudTemplates: { granted: false },
      });
   });
});

describe("unauthenticated ownership boundary", () => {
   it("cannot manufacture an owner id through domain input validation", async () => {
      const repo = new OwnerScopedConsentRepo();
      const set = createSetCloudDataConsentHandler(repo);
      const get = createGetCloudDataConsentHandler(repo);

      await expect(set.execute({ userId: "", category: "cloudSessions", granted: true }))
         .resolves.toEqual({ success: false, error: "User id is required" });
      await expect(get.execute({ userId: "" }))
         .resolves.toEqual({ success: false, error: "User id is required" });
      expect(repo.current.size).toBe(0);
      expect(repo.events).toHaveLength(0);
   });
});
