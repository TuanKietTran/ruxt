import { useMediator } from "@ruxt/shared/cqrs";
import { getUserPreferencesQuery } from "@ruxt/core/handlers/get-user-preferences";
import { cloudCopyQuota } from "@ruxt/core/domain/cloud-copy";

/**
 * Everything the account holds in the cloud, in one response: consent and retention acknowledgement,
 * account preferences, every cloud copy with its checkpoints, and quota. Available after consent is
 * revoked. Subscriptions are excluded.
 */
export default defineEventHandler(async (event) => {
   const ownerId = await requireAuthUser(event);
   const repo = requireCloudCopyRepository();
   const [consent, preferences, copies] = await Promise.all([
      readCloudConsent(ownerId),
      sendApiRequest(useMediator(), getUserPreferencesQuery({ userId: ownerId })).catch(() => null),
      repo.list(ownerId),
   ]);
   setResponseHeader(event, "content-disposition", `attachment; filename="ruxt-cloud-export-${new Date().toISOString().slice(0, 10)}.json"`);
   return {
      format: "ruxt.cloud-export/1",
      exportedAt: new Date().toISOString(),
      consent,
      preferences,
      quota: cloudCopyQuota(copies, cloudCopyLimits(event)),
      copies: copies.map(copy => ({
         kind: copy.kind, clientItemId: copy.clientItemId, revision: copy.headRevision, updatedAt: copy.updatedAt,
         snapshot: copy.snapshot,
         checkpoints: copy.checkpoints.map(({ day, revision, changedAt, snapshot }) => ({ day, revision, changedAt, snapshot })),
      })),
   };
});
