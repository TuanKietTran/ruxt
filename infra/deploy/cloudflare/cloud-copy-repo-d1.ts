import { cloudCopyQuota } from "@ruxt/core/domain/cloud-copy";
import type { CloudCopy, CloudCopyKind, CloudCopyOwnerState, CloudCopyTransition } from "@ruxt/core/domain/cloud-copy";
import type { CloudCopySyncHead, CloudCopySyncRepository } from "@ruxt/core/repos/cloud-copy.repo";
import {
   isOwnerContention, loadCloudCopyStatements, planCloudCopyWrites, QUOTA_SQL, rowsToCloudCopyState, SYNC_HEAD_SQL,
   type SqlStatement,
} from "../cloud-copy-sql";
import { getD1, type D1Database } from "./d1";

const MAX_ATTEMPTS = 6;
const pause = (attempt: number) => new Promise(resolve => setTimeout(resolve, 5 * 2 ** attempt + Math.random() * 20));

/**
 * Cloud copies on Cloudflare D1. One owner transaction = one batched read (a D1 batch is a single
 * transaction, so the snapshot is consistent) plus one batched write led by the owner version
 * compare-and-swap; a concurrent commit aborts the write batch and the transition is re-run.
 */
export class D1CloudCopyRepo implements CloudCopySyncRepository {
   constructor(private readonly database: () => D1Database = getD1) {}

   private prepare(statements: SqlStatement[]) {
      const db = this.database();
      return statements.map(statement => db.prepare(statement.sql).bind(...statement.params));
   }

   private async read(ownerId: string) {
      const results = await this.database().batch<Record<string, unknown>>(this.prepare(loadCloudCopyStatements(ownerId)));
      return rowsToCloudCopyState(ownerId, results.map(result => result.results ?? []) as any);
   }

   async transact<T>(ownerId: string, transition: (state: CloudCopyOwnerState) => CloudCopyTransition<T>): Promise<T> {
      for (let attempt = 1; ; attempt += 1) {
         const { state, version } = await this.read(ownerId);
         const working = structuredClone(state);
         const next = transition(working);
         if (next.state === working) return next.result;
         const writes = planCloudCopyWrites(ownerId, version, state, next.state, new Date().toISOString());
         try {
            const results = await this.database().batch(this.prepare(writes));
            if (results.some(result => !result.success)) throw new Error("Cloudflare D1 cloud-copy transaction failed");
            return next.result;
         } catch (error) {
            if (!isOwnerContention(error) || attempt >= MAX_ATTEMPTS) throw error;
            await pause(attempt);
         }
      }
   }

   async load(ownerId: string): Promise<CloudCopyOwnerState> {
      return (await this.read(ownerId)).state;
   }

   async syncHead(ownerId: string): Promise<CloudCopySyncHead> {
      const row = await this.database().prepare(SYNC_HEAD_SQL).bind(ownerId).first<{ change_seq: number; oldest: string | null }>();
      return { changeSeq: Number(row?.change_seq ?? 0), oldestUpdatedAt: row?.oldest ?? null };
   }

   async get(ownerId: string, kind: CloudCopyKind, clientItemId: string): Promise<CloudCopy | null> {
      const { state } = await this.read(ownerId);
      return state.copies.find(copy => copy.kind === kind && copy.clientItemId === clientItemId) ?? null;
   }

   async list(ownerId: string): Promise<CloudCopy[]> {
      return (await this.read(ownerId)).state.copies;
   }

   async quota(ownerId: string) {
      const rows = (await this.database().prepare(QUOTA_SQL).bind(ownerId).all<{ kind: CloudCopyKind }>()).results ?? [];
      return cloudCopyQuota(rows);
   }
}
