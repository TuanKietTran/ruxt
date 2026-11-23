import { describe, expect, it } from "vitest";
import {
   CLOUD_DATA_POLICY_VERSION,
   projectCloudDataConsent,
   type CloudConsentCategoryState,
   type CloudConsentEvent,
   type CloudRetentionAcknowledgement,
} from "@ruxt/core/domain/cloud-data/consent";
import { createGetCloudDataConsentHandler } from "@ruxt/core/handlers/get-cloud-data-consent";
import { createSetCloudDataConsentHandler } from "@ruxt/core/handlers/set-cloud-data-consent";
import type { CloudConsentRepository } from "@ruxt/core/repos/cloud-consent.repo";

class InMemoryCloudConsentRepo implements CloudConsentRepository {
   readonly current = new Map<string, CloudConsentCategoryState>();
   readonly events: CloudConsentEvent[] = [];

   async listCurrent(ownerId: string) {
      return [...this.current.values()].filter(state => state.ownerId === ownerId);
   }

   async saveChange(state: CloudConsentCategoryState, event: CloudConsentEvent) {
      this.current.set(`${state.ownerId}:${state.category}`, structuredClone(state));
      this.events.push(structuredClone(event));
   }

   async listEvents(ownerId: string) {
      return this.events.filter(event => event.ownerId === ownerId);
   }

   readonly acknowledgements = new Map<string, CloudRetentionAcknowledgement>();

   async getRetentionAcknowledgement(ownerId: string) {
      return structuredClone(this.acknowledgements.get(ownerId) ?? null);
   }

   async acknowledgeRetention(acknowledgement: CloudRetentionAcknowledgement) {
      this.acknowledgements.set(acknowledgement.ownerId, structuredClone(acknowledgement));
   }
}

/** Labeled synthetic retention values for tests; no production values are implied. */
const TEST_RETENTION = {
   noticeVersion: "test-notice-1",
   sessionCurrentCopyRetentionDays: 30,
   templateRetentionDays: 30,
   profileRetentionDays: 30,
   checkpointRetentionDays: 7,
   retentionExtensionDays: 30,
};

const acknowledged = (userId = "user-1") => {
   const repo = new InMemoryCloudConsentRepo();
   repo.acknowledgements.set(userId, { ownerId: userId, policyVersion: TEST_RETENTION.noticeVersion, acknowledgedAt: "2026-09-19T00:00:00.000Z" });
   return repo;
};

const execute = async <I, O>(handler: { execute(input: I): Promise<{ success: true; data: O } | { success: false; error: string }> }, input: I) => handler.execute(input);

describe("cloud data consent", () => {
   it("defaults both optional categories to denied without persisting an implicit grant", async () => {
      const repo = new InMemoryCloudConsentRepo();
      const result = await execute(createGetCloudDataConsentHandler(repo), { userId: "user-1" });

      expect(result).toEqual({
         success: true,
         data: {
            policyVersion: CLOUD_DATA_POLICY_VERSION,
            retentionConfiguration: null,
            retentionConfigurationMissing: [
               "noticeVersion", "sessionCurrentCopyRetentionDays", "templateRetentionDays",
               "profileRetentionDays", "checkpointRetentionDays", "retentionExtensionDays",
            ],
            retentionAcknowledgement: { acknowledgedVersion: null, acknowledgedAt: null },
            cloudSessions: { granted: false, changedAt: null },
            cloudTemplates: { granted: false, changedAt: null },
            cloudProfiles: { granted: false, changedAt: null },
            cloudJobPreferences: { granted: false, changedAt: null },
         },
      });
      expect(repo.events).toHaveLength(0);
   });

   it("fails closed without retention configuration or a current notice acknowledgement", async () => {
      const unconfigured = new InMemoryCloudConsentRepo();
      await expect(createSetCloudDataConsentHandler(unconfigured).execute({ userId: "user-1", category: "cloudSessions", granted: true }))
         .resolves.toMatchObject({ success: false, error: expect.stringMatching(/configuration is incomplete/) });
      const unacknowledged = new InMemoryCloudConsentRepo();
      await expect(createSetCloudDataConsentHandler(unacknowledged, { retentionConfiguration: () => TEST_RETENTION })
         .execute({ userId: "user-1", category: "cloudSessions", granted: true }))
         .resolves.toMatchObject({ success: false, error: expect.stringMatching(/must be acknowledged/) });
      expect(unconfigured.events).toHaveLength(0);
      expect(unacknowledged.events).toHaveLength(0);
   });

   it("still records revocation without configuration", async () => {
      const repo = new InMemoryCloudConsentRepo();
      const result = await createSetCloudDataConsentHandler(repo).execute({ userId: "user-1", category: "cloudProfiles", granted: false });
      expect(result).toMatchObject({ success: true, data: { cloudProfiles: { granted: false } } });
      expect(repo.events).toHaveLength(1);
   });

   it("grants categories independently and records an append-only audit event", async () => {
      const repo = acknowledged();
      const handler = createSetCloudDataConsentHandler(repo, {
         now: () => new Date("2026-09-20T12:00:00.000Z"),
         newId: () => "event-1",
         retentionConfiguration: () => TEST_RETENTION,
      });

      const result = await execute(handler, { userId: "user-1", category: "cloudTemplates", granted: true });

      expect(result).toMatchObject({
         success: true,
         data: {
            cloudSessions: { granted: false, changedAt: null },
            cloudTemplates: { granted: true, changedAt: "2026-09-20T12:00:00.000Z" },
            cloudProfiles: { granted: false, changedAt: null },
         },
      });
      expect(repo.events).toEqual([{
         id: "event-1",
         ownerId: "user-1",
         actorUserId: "user-1",
         category: "cloudTemplates",
         granted: true,
         policyVersion: CLOUD_DATA_POLICY_VERSION,
         changedAt: "2026-09-20T12:00:00.000Z",
      }]);
   });

   it("records revocation without changing the other category", async () => {
      const repo = acknowledged();
      let tick = 0;
      const handler = createSetCloudDataConsentHandler(repo, {
         now: () => new Date(`2026-09-2${tick++}T12:00:00.000Z`),
         newId: () => `event-${tick}`,
         retentionConfiguration: () => TEST_RETENTION,
      });

      await execute(handler, { userId: "user-1", category: "cloudSessions", granted: true });
      await execute(handler, { userId: "user-1", category: "cloudTemplates", granted: true });
      const result = await execute(handler, { userId: "user-1", category: "cloudSessions", granted: false });

      expect(result).toMatchObject({
         success: true,
         data: {
            cloudSessions: { granted: false },
            cloudTemplates: { granted: true },
         },
      });
      expect(repo.events).toHaveLength(3);
   });

   it("denies grants recorded against an obsolete policy until renewed", () => {
      expect(projectCloudDataConsent([{
         ownerId: "user-1",
         category: "cloudSessions",
         granted: true,
         policyVersion: "obsolete",
         changedAt: "2026-01-01T00:00:00.000Z",
      }])).toMatchObject({ cloudSessions: { granted: false } });
   });

   it.each([
      [{ userId: "", category: "cloudSessions", granted: true }, "User id is required"],
      [{ userId: "user-1", category: "other", granted: true }, "Invalid cloud data category"],
      [{ userId: "user-1", category: "cloudSessions", granted: "yes" }, "Granted must be a boolean"],
   ])("rejects invalid mutations", async (input, error) => {
      const repo = new InMemoryCloudConsentRepo();
      const result = await execute(createSetCloudDataConsentHandler(repo), input as never);
      expect(result).toEqual({ success: false, error });
      expect(repo.events).toHaveLength(0);
   });
});
