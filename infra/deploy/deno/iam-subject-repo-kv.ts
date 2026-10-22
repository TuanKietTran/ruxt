import { getKv } from "@infra/kv";
import type { IamSubjectRepository, StoredSubject } from "@ruxt/core/repos/iam.repo";
import { UserId } from "@ruxt/core/domain/iam/user-id";

// key schema:
//   ["iam_sub", userId]          → StoredSubject  (primary)
//   ["iam_sub_org", orgId, userId] → ""           (org index, for SameOrgPolicy lookups)

export class DenoKvIamSubjectRepo implements IamSubjectRepository {
   async findByUserId(userId: UserId): Promise<StoredSubject | null> {
      const kv = await getKv();
      const entry = await kv.get<StoredSubject>(["iam_sub", userId.value]);
      return entry.value ?? null;
   }

   async save(subject: StoredSubject): Promise<void> {
      const kv = await getKv();
      const existing = await kv.get<StoredSubject>(["iam_sub", subject.userId]);

      const op = kv.atomic();

      if (existing.value?.orgId && existing.value.orgId !== subject.orgId) {
         op.delete(["iam_sub_org", existing.value.orgId, subject.userId]);
      }

      op.set(["iam_sub", subject.userId], subject);

      if (subject.orgId) {
         op.set(["iam_sub_org", subject.orgId, subject.userId], "");
      }

      await op.commit();
   }

   async delete(userId: UserId): Promise<void> {
      const kv = await getKv();
      const existing = await kv.get<StoredSubject>(["iam_sub", userId.value]);

      const op = kv.atomic().delete(["iam_sub", userId.value]);

      if (existing.value?.orgId) {
         op.delete(["iam_sub_org", existing.value.orgId, userId.value]);
      }

      await op.commit();
   }
}
