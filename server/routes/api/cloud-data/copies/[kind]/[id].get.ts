import { createGetCloudCopyHandler } from "@ruxt/core/handlers/get-cloud-copy";
import type { CloudCopyKind } from "@ruxt/core/domain/cloud-copy";

/**
 * One cloud copy with its checkpoints (history, cherry-pick, recovery). Owner-scoped; another owner's
 * identity answers the same 404 as a missing one. Reading needs no consent.
 */
export default defineEventHandler(async (event) => {
   const ownerId = await requireAuthUser(event);
   const repo = requireCloudCopyRepository();
   const kind = getRouterParam(event, "kind") as CloudCopyKind;
   const clientItemId = decodeURIComponent(getRouterParam(event, "id") ?? "");
   const result = await createGetCloudCopyHandler(repo, { ownerId: () => ownerId }).execute({ kind, clientItemId });
   if (!result.success) {
      const notFound = /not found/i.test(result.error);
      throw createError({ statusCode: notFound ? 404 : 400, statusMessage: notFound ? "Cloud copy not found" : result.error });
   }
   const copy = result.data;
   return {
      kind: copy.kind,
      clientItemId: copy.clientItemId,
      revision: copy.headRevision,
      updatedAt: copy.updatedAt,
      snapshot: copy.snapshot,
      checkpoints: copy.checkpoints.map(checkpoint => ({
         day: checkpoint.day, revision: checkpoint.revision, changedAt: checkpoint.changedAt, snapshot: checkpoint.snapshot,
      })),
   };
});
