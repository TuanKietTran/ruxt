import { getKv } from "@infra/kv";
import type { UserRepository, StoredUser } from "@ruxt/core/repos/user.repo";

// key schema:
//   ["user", id]           → StoredUser (primary)
//   ["user_email", email]  → id         (email index)

export class DenoKvUserRepo implements UserRepository {
  async findByEmail(email: string): Promise<StoredUser | null> {
    const kv = await getKv();
    const idEntry = await kv.get<string>(["user_email", email]);
    if (!idEntry.value) return null;
    const entry = await kv.get<StoredUser>(["user", idEntry.value]);
    return entry.value;
  }

  async findById(id: string): Promise<StoredUser | null> {
    const kv = await getKv();
    const entry = await kv.get<StoredUser>(["user", id]);
    return entry.value;
  }

  async save(user: StoredUser): Promise<void> {
    const kv = await getKv();

    // If the user already exists with a different email, remove the old email index
    const existing = await kv.get<StoredUser>(["user", user.id]);
    if (existing.value && existing.value.email !== user.email) {
      await kv.atomic()
        .delete(["user_email", existing.value.email])
        .set(["user", user.id], user)
        .set(["user_email", user.email], user.id)
        .commit();
    } else {
      await kv.atomic()
        .set(["user", user.id], user)
        .set(["user_email", user.email], user.id)
        .commit();
    }
  }
}
