import { getKv } from "@infra/kv";
import { UserId } from "@ruxt/core/domain/iam/user-id";
import type { IamSubjectRepository, StoredSubject } from "@ruxt/core/repos/iam.repo";

// key schema:
//   ["iam_subject", userId] → StoredSubject JSON

export class DenoKvIamRepo implements IamSubjectRepository {
   async findByUserId(userId: UserId): Promise<StoredSubject | null> {
      const kv = await getKv();
      const entry = await kv.get<StoredSubject>(["iam_subject", userId.value]);
      return entry.value;
   }

   async save(subject: StoredSubject): Promise<void> {
      const kv = await getKv();
      await kv.set(["iam_subject", subject.userId], subject);
   }

   async delete(userId: UserId): Promise<void> {
      const kv = await getKv();
      await kv.delete(["iam_subject", userId.value]);
   }
}
