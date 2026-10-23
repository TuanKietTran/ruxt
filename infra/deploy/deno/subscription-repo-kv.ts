import { getKv } from "@infra/kv";
import type { SubscriptionRepository } from "@ruxt/core/repos/subscription.repo";
import { Subscription, SubscriptionId } from "@ruxt/core/domain/subscription/subscription";

// key schema:
//   ["sub", id]              → Subscription JSON  (primary)
//   ["sub_user", userId, id] → ""                 (user index)

export class DenoKvSubscriptionRepo implements SubscriptionRepository {
   async findById(id: SubscriptionId): Promise<Subscription | null> {
      const kv = await getKv();
      const entry = await kv.get<ReturnType<Subscription["toJSON"]>>(["sub", id.value]);
      if (entry.value === null) return null;
      return Subscription.fromJSON(entry.value);
   }

   async save(sub: Subscription): Promise<void> {
      const kv = await getKv();
      await kv.atomic()
         .set(["sub", sub.id.value], sub.toJSON())
         .set(["sub_user", sub.userId, sub.id.value], "")
         .commit();
   }

   async delete(id: SubscriptionId): Promise<void> {
      const kv = await getKv();
      // need userId to clean the index — look it up first
      const entry = await kv.get<ReturnType<Subscription["toJSON"]>>(["sub", id.value]);
      const op = kv.atomic().delete(["sub", id.value]);
      if (entry.value) op.delete(["sub_user", entry.value.userId, id.value]);
      await op.commit();
   }

   async findByUser(userId: string): Promise<Subscription[]> {
      const kv = await getKv();
      const results: Subscription[] = [];

      for await (const entry of kv.list<string>({ prefix: ["sub_user", userId] })) {
         const subId = entry.key[2] as string;
         const subEntry = await kv.get<ReturnType<Subscription["toJSON"]>>(["sub", subId]);
         if (subEntry.value !== null) {
            results.push(Subscription.fromJSON(subEntry.value));
         }
      }

      return results;
   }
}
