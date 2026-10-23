import { eq } from "drizzle-orm";
import { getSqliteDb } from "@infra/db/sqlite";
import { users } from "@infra/db/schema";
import type { UserRepository, StoredUser } from "@ruxt/core/repos/user.repo";

export class SqliteUserRepo implements UserRepository {
  private get db() { return getSqliteDb(); }

  async findByEmail(email: string): Promise<StoredUser | null> {
    const row = this.db.select().from(users).where(eq(users.email, email)).get();
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
    };
  }

  async findById(id: string): Promise<StoredUser | null> {
    const row = this.db.select().from(users).where(eq(users.id, id)).get();
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      passwordHash: row.passwordHash,
      createdAt: row.createdAt,
    };
  }

  async save(user: StoredUser): Promise<void> {
    const row = {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
    };
    this.db.insert(users).values(row)
      .onConflictDoUpdate({ target: users.id, set: row })
      .run();
  }
}
