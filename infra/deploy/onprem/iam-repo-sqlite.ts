import { eq } from "drizzle-orm";
import { getSqliteDb } from "@infra/db/sqlite";
import { iamSubjects } from "@infra/db/schema";
import { UserId } from "@ruxt/core/domain/iam/user-id";
import type { IamSubjectRepository, StoredSubject } from "@ruxt/core/repos/iam.repo";

export class SqliteIamRepo implements IamSubjectRepository {
   private get db() { return getSqliteDb(); }

   async findByUserId(userId: UserId): Promise<StoredSubject | null> {
      const row = this.db.select().from(iamSubjects).where(eq(iamSubjects.userId, userId.value)).get();
      if (!row) return null;
      return {
         userId: row.userId,
         orgId: row.orgId ?? null,
         tier: row.tier,
         isServiceAccount: row.isServiceAccount,
      };
   }

   async save(subject: StoredSubject): Promise<void> {
      const row = {
         userId: subject.userId,
         orgId: subject.orgId ?? null,
         tier: subject.tier,
         isServiceAccount: subject.isServiceAccount,
      };
      this.db.insert(iamSubjects).values(row)
         .onConflictDoUpdate({ target: iamSubjects.userId, set: row })
         .run();
   }

   async delete(userId: UserId): Promise<void> {
      this.db.delete(iamSubjects).where(eq(iamSubjects.userId, userId.value)).run();
   }
}
