import { describe, expect, it } from "vitest";
import { createSyncCloudCopiesHandler, type SyncCloudCopiesInput, type SyncCloudCopiesResult } from "@ruxt/core/handlers/sync-cloud-copies";
import { selectRetainedCloudCheckpoints } from "@ruxt/core/domain/cloud-data/retention";
import type { CloudCopyKind } from "@ruxt/core/domain/cloud-copy";
import type { CloudCopySyncRepository } from "@ruxt/core/repos/cloud-copy.repo";

const retain = (checkpoints: readonly any[], lastWriteAt: string) => selectRetainedCloudCheckpoints(checkpoints, lastWriteAt, 7);

export function syncAs(repo: CloudCopySyncRepository, ownerId: string, options: { now?: () => string; canWrite?: (kind: CloudCopyKind) => boolean } = {}) {
   let serial = 0;
   const handler = createSyncCloudCopiesHandler(repo, {
      ownerId: () => ownerId,
      canWrite: (_owner, kind) => options.canWrite?.(kind) ?? true,
   }, { now: options.now, retainCheckpoints: retain, createId: () => `${ownerId}-copy-${++serial}-${Math.random().toString(36).slice(2, 8)}` });
   return async (input: SyncCloudCopiesInput): Promise<SyncCloudCopiesResult> => {
      const result = await handler.execute(input);
      if (!result.success) throw new Error(result.error);
      return result.data;
   };
}

export const saveOp = (clientItemId: string, mutationId: string, expectedRevision = 0, content = "v1", kind: CloudCopyKind = "session") =>
   ({ mutationId, operation: "save" as const, kind, clientItemId, expectedRevision, snapshot: { title: `T ${clientItemId}`, content } });
export const removeOp = (clientItemId: string, mutationId: string, expectedRevision: number, kind: CloudCopyKind = "session") =>
   ({ mutationId, operation: "remove" as const, kind, clientItemId, expectedRevision });

/**
 * Behaviour every durable cloud-copy adapter must show with the real core handler on top: atomic
 * owner commits, owner isolation, the delta feed, checkpoints and the shared quota under concurrency.
 */
export function cloudCopyRepositoryContract(name: string, makeRepo: () => Promise<CloudCopySyncRepository> | CloudCopySyncRepository) {
   describe(`${name} cloud-copy repository contract`, () => {
      it("commits, replays, conflicts and serves the delta from durable rows", async () => {
         const repo = await makeRepo();
         const sync = syncAs(repo, "owner-a");
         const first = await sync({ since: 0, mutations: [saveOp("s1", "m1"), saveOp("t1", "m2", 0, "tpl", "template")] });
         expect(first.acks.map(ack => ack.status)).toEqual(["applied", "applied"]);
         expect(first).toMatchObject({ cursor: 2, changed: true, changes: [], quota: { used: 2 } });

         const retry = await sync({ since: 2, mutations: [saveOp("s1", "m1"), saveOp("t1", "m2", 0, "tpl", "template")] });
         expect(retry.acks.map(ack => ack.status)).toEqual(["replayed", "replayed"]);
         expect(retry.changed).toBe(false);

         const other = syncAs(repo, "owner-a");
         const stale = await other({ since: 0, mutations: [saveOp("s1", "x1", 0, "stale")] });
         expect(stale.acks[0]).toMatchObject({ status: "conflict", currentRevision: 1 });
         expect(stale.changes.map(change => change.clientItemId).sort()).toEqual(["s1", "t1"]);

         await sync({ since: 2, mutations: [saveOp("s1", "m3", 1, "v2"), removeOp("t1", "m4", 1, "template")] });
         const delta = await other({ since: 2 });
         expect(delta.changes.map(change => [change.clientItemId, change.deleted, change.revision])).toEqual([["s1", false, 2], ["t1", true, 1]]);
         expect(delta.cursor).toBe(4);
         const head = await repo.syncHead("owner-a");
         expect(head.changeSeq).toBe(4);
         expect(await other({ since: 4 })).toMatchObject({ changes: [], quota: null });

         const copy = await repo.get("owner-a", "session", "s1");
         expect(copy).toMatchObject({ headRevision: 2, snapshot: { content: "v2" }, changeSeq: 3 });
         expect(copy?.checkpoints.map(checkpoint => [checkpoint.revision, checkpoint.snapshot.content])).toEqual([[1, "v1"]]);
         expect((await repo.load("owner-a")).tombstones).toEqual([expect.objectContaining({ clientItemId: "t1", reason: "removed" })]);
      });

      it("keeps owners isolated in reads, deltas and quota", async () => {
         const repo = await makeRepo();
         await syncAs(repo, "owner-a")({ mutations: [saveOp("shared-id", "m1", 0, "alice")] });
         const bob = syncAs(repo, "owner-b");
         expect((await bob({ since: null })).changes).toEqual([]);
         expect(await repo.get("owner-b", "session", "shared-id")).toBeNull();
         const created = await bob({ mutations: [saveOp("shared-id", "m1", 0, "bob")] });
         expect(created.acks[0]).toMatchObject({ status: "applied", revision: 1 });
         expect((await repo.get("owner-a", "session", "shared-id"))?.snapshot.content).toBe("alice");
         expect((await repo.quota("owner-a")).used).toBe(1);
      });

      it("admits exactly one new identity at 9/10 under concurrent writers", async () => {
         const repo = await makeRepo();
         const seed = syncAs(repo, "owner-q");
         await seed({ mutations: Array.from({ length: 9 }, (_, index) => saveOp(`seed-${index}`, `seed-m${index}`)) });
         const writers = Array.from({ length: 4 }, (_, index) => syncAs(repo, "owner-q")({ mutations: [saveOp(`race-${index}`, `race-m${index}`)] }));
         const results = await Promise.all(writers);
         const statuses = results.map(result => result.acks[0]!.status === "rejected" ? (result.acks[0] as any).code : result.acks[0]!.status);
         expect(statuses.filter(status => status === "applied")).toHaveLength(1);
         expect(statuses.filter(status => status === "CLOUD_COPY_LIMIT")).toHaveLength(3);
         expect((await repo.quota("owner-q")).used).toBe(10);
         expect((await repo.load("owner-q")).changeSeq).toBe(10);
      });

      it("serializes concurrent edits of one identity by head revision", async () => {
         const repo = await makeRepo();
         const sync = syncAs(repo, "owner-c");
         await sync({ mutations: [saveOp("doc", "m0")] });
         const racers = await Promise.all(["a", "b", "c"].map(tag => syncAs(repo, "owner-c")({ mutations: [saveOp("doc", `m-${tag}`, 1, `edit-${tag}`)] })));
         const outcomes = racers.map(result => result.acks[0]!.status);
         expect(outcomes.filter(status => status === "applied")).toHaveLength(1);
         expect(outcomes.filter(status => status === "conflict")).toHaveLength(2);
         const copy = await repo.get("owner-c", "session", "doc");
         expect(copy?.headRevision).toBe(2);
         expect(copy?.checkpoints).toHaveLength(1);
      });
   });
}
