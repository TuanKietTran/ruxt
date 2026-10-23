import { eq } from "drizzle-orm";
import { getSqliteDb } from "@infra/db/sqlite";
import { iamSubjects } from "@infra/db/schema";
import type { IamSubjectRepository, StoredSubject } from "@ruxt/core/repos/iam.repo";
import { UserId } from "@ruxt/core/domain/iam/user-id";

export class SqliteIamSubjectRepo implements IamSubjectRepository {
   private get db() {
      return getSqliteDb();
   }

   async findByUserId(userId: UserId): Promise<StoredSubject | null> {
      const row = this.db
         .select()
         .from(iamSubjects)
         .where(eq(iamSubjects.userId, userId.value))
         .get();

      if (!row) return null;
      return rowToStored(row);
   }

   async save(subject: StoredSubject): Promise<void> {
      const row = storedToRow(subject);
      this.db
         .insert(iamSubjects)
         .values(row)
         .onConflictDoUpdate({
            target: iamSubjects.userId,
            set: row,
         })
         .run();
   }

   async delete(userId: UserId): Promise<void> {
      this.db
         .delete(iamSubjects)
         .where(eq(iamSubjects.userId, userId.value))
         .run();
   }
}

type Row = typeof iamSubjects.$inferSelect;

function rowToStored(row: Row): StoredSubject {
   return {
      userId: row.userId,
      orgId: row.orgId ?? null,
      tier: row.tier,
      isServiceAccount: row.isServiceAccount,
   };
}

function storedToRow(s: StoredSubject): typeof iamSubjects.$inferInsert {
   return {
      userId: s.userId,
      orgId: s.orgId ?? null,
      tier: s.tier,
      isServiceAccount: s.isServiceAccount,
   };
}
