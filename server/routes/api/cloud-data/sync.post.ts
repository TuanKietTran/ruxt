import { createSyncCloudCopiesHandler, type SyncCloudCopiesInput } from "@ruxt/core/handlers/sync-cloud-copies";
import { isSyncDeviceId } from "@infra/crypto/cloud-sync-ticket";

/** Request bodies above this are refused before parsing (20 snapshots of 512 KiB would be ~10 MiB). */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

interface SyncBody extends SyncCloudCopiesInput {
   deviceId?: unknown;
   /** Include the consent view (initial sync, after a consent change). */
   wantConsent?: unknown;
   /** Include a push connection ticket when a hub is available. */
   wantPush?: unknown;
}

/**
 * The single cloud-data sync exchange: batched mutations up, acknowledgements and the delta since the
 * device's cursor down, plus (on request) consent and a push ticket, so a device needs one request
 * per meaningful batch. The owner always comes from the verified session; consent is re-read for
 * every request that writes.
 */
export default defineEventHandler(async (event) => {
   const startedAt = performance.now();
   const ownerId = await requireAuthUser(event);
   const declared = Number(getRequestHeader(event, "content-length") ?? 0);
   if (declared > MAX_BODY_BYTES) throw createError({ statusCode: 413, statusMessage: "Sync request too large" });
   const body = await readBody<SyncBody>(event);
   if (!body || typeof body !== "object") throw createError({ statusCode: 400, statusMessage: "Sync request must be an object" });
   if (!isSyncDeviceId(body.deviceId)) throw createError({ statusCode: 400, statusMessage: "A valid deviceId is required" });
   const deviceId = body.deviceId;
   const repo = requireCloudCopyRepository();
   const retention = cloudRetentionConfiguration(event);

   const writes = Array.isArray(body.mutations) && body.mutations.some(item => item?.operation === "save");
   let consent = writes || body.wantConsent === true ? await readCloudConsent(ownerId) : null;
   const handler = createSyncCloudCopiesHandler(repo, {
      ownerId: () => ownerId,
      canWrite: async (_owner, kind) => {
         consent ??= await readCloudConsent(ownerId);
         return consentAllows(consent, kind);
      },
   }, {
      retainCheckpoints: checkpointRetention(retention),
      lifecycle: () => retention,
   });

   const result = await handler.execute({
      mutations: body.mutations, since: body.since, after: body.after, limit: body.limit, maxBytes: body.maxBytes,
   });
   recordMetric("cqrs", "command SyncCloudCopies", { durationMs: performance.now() - startedAt, ok: result.success });
   if (!result.success) {
      const message = result.error;
      const statusCode = /must|invalid|required|cursor/i.test(message) ? 400 : 500;
      // The client only sees a generic 500; keep the real cause (e.g. a missing D1 table) in the Worker logs.
      if (statusCode === 500) console.error("[cloud-sync] sync failed", message);
      throw createError({ statusCode, statusMessage: statusCode === 500 ? "Internal server error" : message, data: { code: statusCode === 400 ? "BAD_REQUEST" : "INTERNAL_ERROR" } });
   }
   const data = result.data;
   if (data.changed) notifyOwnerDevices(event, ownerId, data.cursor, deviceId);

   return {
      protocol: CLOUD_SYNC_POLICY.protocol,
      policy: CLOUD_SYNC_POLICY,
      owner: await cloudSyncOwnerFingerprint(ownerId),
      serverTime: new Date().toISOString(),
      acks: data.acks,
      changes: data.changes,
      cursor: data.cursor,
      hasMore: data.hasMore,
      reset: data.reset,
      changed: data.changed,
      quota: data.quota,
      consent,
      retentionConfigured: retention !== null,
      push: body.wantPush === true && pushAvailable(event) ? await mintPushTicket(event, ownerId, deviceId) : null,
   };
});
