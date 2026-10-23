import { asc, eq } from "drizzle-orm";
import type { CloudConsentRepository } from "@ruxt/core/repos/cloud-consent.repo";
import type { CloudConsentCategoryState, CloudConsentEvent } from "@ruxt/core/domain/cloud-data/consent";
import { cloudConsentEvents, cloudConsentStates } from "@infra/db/schema";
import { getSqliteDb } from "@infra/db/sqlite";

export class SqliteCloudConsentRepo implements CloudConsentRepository {
   private get db() { return getSqliteDb(); }

   async listCurrent(ownerId: string): Promise<CloudConsentCategoryState[]> {
      return this.db.select().from(cloudConsentStates)
         .where(eq(cloudConsentStates.ownerId, ownerId)).all();
   }

   async saveChange(state: CloudConsentCategoryState, event: CloudConsentEvent): Promise<void> {
      this.db.transaction((tx) => {
         tx.insert(cloudConsentStates).values(state)
            .onConflictDoUpdate({
               target: [cloudConsentStates.ownerId, cloudConsentStates.category],
               set: {
                  granted: state.granted,
                  policyVersion: state.policyVersion,
                  changedAt: state.changedAt,
               },
            }).run();
         tx.insert(cloudConsentEvents).values(event).run();
      });
   }

   async listEvents(ownerId: string): Promise<CloudConsentEvent[]> {
      return this.db.select().from(cloudConsentEvents)
         .where(eq(cloudConsentEvents.ownerId, ownerId))
         .orderBy(asc(cloudConsentEvents.changedAt), asc(cloudConsentEvents.id)).all();
   }
}
