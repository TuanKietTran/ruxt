import { normalizeUserPreferences, type UserPreferencesRecord, type UserPreferencesRepository } from "#shared/preferences";
import { getKv } from "@infra/kv";

export class DenoKvUserPreferencesRepo implements UserPreferencesRepository {
   async get(ownerId: string): Promise<UserPreferencesRecord | null> {
      const kv = await getKv();
      const entry = await kv.get<UserPreferencesRecord>(["user_preferences", ownerId]);
      return entry.value ? { ...entry.value, preferences: normalizeUserPreferences(entry.value.preferences) } : null;
   }

   async save(record: UserPreferencesRecord): Promise<void> {
      const kv = await getKv();
      await kv.set(["user_preferences", record.ownerId], record);
   }
}
