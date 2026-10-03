import { eq } from "drizzle-orm";
import type { UserPreferencesRepository } from "@core/repos/user-preferences.repo";
import { normalizeUserPreferences, type UserPreferencesRecord } from "@core/domain/preferences";
import { userPreferences } from "@infra/db/schema";
import { getSqliteDb } from "@infra/db/sqlite";

export class SqliteUserPreferencesRepo implements UserPreferencesRepository {
   private get db() { return getSqliteDb(); }

   async get(ownerId: string): Promise<UserPreferencesRecord | null> {
      const row = this.db.select().from(userPreferences).where(eq(userPreferences.ownerId, ownerId)).get();
      if (!row) return null;
      let stored: unknown = {};
      try { stored = JSON.parse(row.preferences); } catch { /* fall back to defaults */ }
      return { ownerId: row.ownerId, preferences: normalizeUserPreferences(stored), updatedAt: row.updatedAt };
   }

   async save(record: UserPreferencesRecord): Promise<void> {
      const preferences = JSON.stringify(record.preferences);
      this.db.insert(userPreferences).values({ ownerId: record.ownerId, preferences, updatedAt: record.updatedAt })
         .onConflictDoUpdate({ target: userPreferences.ownerId, set: { preferences, updatedAt: record.updatedAt } })
         .run();
   }
}
