import type { CloudConsentRepository } from "@ruxt/core/repos/cloud-consent.repo";
import { CLOUD_DATA_CATEGORIES, type CloudConsentCategoryState, type CloudConsentEvent, type CloudRetentionAcknowledgement } from "@ruxt/core/domain/cloud-data/consent";
import { getKv } from "@infra/kv";

export class DenoKvCloudConsentRepo implements CloudConsentRepository {
   async listCurrent(ownerId: string): Promise<CloudConsentCategoryState[]> {
      const kv = await getKv();
      const entries = await Promise.all(CLOUD_DATA_CATEGORIES.map(category =>
         kv.get<CloudConsentCategoryState>(["cloud_consent", ownerId, category])));
      return entries.flatMap(entry => entry.value ? [entry.value] : []);
   }

   async saveChange(state: CloudConsentCategoryState, event: CloudConsentEvent): Promise<void> {
      const kv = await getKv();
      await kv.atomic()
         .set(["cloud_consent", state.ownerId, state.category], state)
         .set(["cloud_consent_event", event.ownerId, event.changedAt, event.id], event)
         .commit();
   }

   async listEvents(ownerId: string): Promise<CloudConsentEvent[]> {
      const kv = await getKv();
      const events: CloudConsentEvent[] = [];
      for await (const entry of kv.list<CloudConsentEvent>({ prefix: ["cloud_consent_event", ownerId] })) {
         if (entry.value) events.push(entry.value);
      }
      return events;
   }

   async getRetentionAcknowledgement(ownerId: string): Promise<CloudRetentionAcknowledgement | null> {
      return (await (await getKv()).get<CloudRetentionAcknowledgement>(["cloud_retention_ack", ownerId])).value ?? null;
   }

   async acknowledgeRetention(acknowledgement: CloudRetentionAcknowledgement): Promise<void> {
      await (await getKv()).set(["cloud_retention_ack", acknowledgement.ownerId], acknowledgement);
   }
}
