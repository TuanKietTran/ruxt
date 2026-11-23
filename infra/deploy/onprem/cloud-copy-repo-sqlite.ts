import { cloudCopyQuota } from "@ruxt/core/domain/cloud-copy";
import type { CloudCopy, CloudCopyKind, CloudCopyOwnerState, CloudCopyTransition } from "@ruxt/core/domain/cloud-copy";
import type { CloudCopySyncHead, CloudCopySyncRepository } from "@ruxt/core/repos/cloud-copy.repo";
import { loadCloudCopyStatements, planCloudCopyWrites, QUOTA_SQL, rowsToCloudCopyState, SYNC_HEAD_SQL } from "@infra/deploy/cloud-copy-sql";
import { getSqliteClient } from "@infra/db/sqlite";

type Client = ReturnType<typeof getSqliteClient>;

/**
 * Cloud copies on the local SQLite database. better-sqlite3 runs the whole owner transition inside an
 * IMMEDIATE transaction (the write lock is taken before the read), so owner commits serialize.
 */
export class SqliteCloudCopyRepo implements CloudCopySyncRepository {
   constructor(private readonly client: () => Client = getSqliteClient) {}

   private read(db: Client, ownerId: string) {
      const rows = loadCloudCopyStatements(ownerId).map(statement => db.prepare(statement.sql).all(...statement.params));
      return rowsToCloudCopyState(ownerId, rows as any);
   }

   async transact<T>(ownerId: string, transition: (state: CloudCopyOwnerState) => CloudCopyTransition<T>): Promise<T> {
      const db = this.client();
      const run = db.transaction(() => {
         const { state, version } = this.read(db, ownerId);
         const working = structuredClone(state);
         const next = transition(working);
         if (next.state === working) return next.result;
         for (const statement of planCloudCopyWrites(ownerId, version, state, next.state, new Date().toISOString())) {
            db.prepare(statement.sql).run(...statement.params);
         }
         return next.result;
      });
      return run.immediate();
   }

   async load(ownerId: string) {
      return this.read(this.client(), ownerId).state;
   }

   async syncHead(ownerId: string): Promise<CloudCopySyncHead> {
      const row = this.client().prepare(SYNC_HEAD_SQL).get(ownerId) as { change_seq: number; oldest: string | null } | undefined;
      return { changeSeq: Number(row?.change_seq ?? 0), oldestUpdatedAt: row?.oldest ?? null };
   }

   async get(ownerId: string, kind: CloudCopyKind, clientItemId: string): Promise<CloudCopy | null> {
      return (await this.load(ownerId)).copies.find(copy => copy.kind === kind && copy.clientItemId === clientItemId) ?? null;
   }

   async list(ownerId: string) {
      return (await this.load(ownerId)).copies;
   }

   async quota(ownerId: string, limits?: Partial<Record<CloudCopyKind, unknown>> | null) {
      return cloudCopyQuota(this.client().prepare(QUOTA_SQL).all(ownerId) as Array<{ kind: CloudCopyKind }>, limits);
   }
}
