import {
   DEFAULT_USER_PREFERENCES,
   normalizeUserPreferences,
   type UserPreferences,
   type UserPreferencesView,
} from "#shared/preferences";

export const LOCAL_PREFERENCES_KEY = "cv-sv:preferences:v1";

/** Where the current preferences live: this browser, or the signed-in account. */
export type PreferencesSource = "local" | "account";

const readLocal = (): UserPreferences => {
   try {
      return normalizeUserPreferences(JSON.parse(localStorage.getItem(LOCAL_PREFERENCES_KEY) || "{}"));
   } catch {
      return { ...DEFAULT_USER_PREFERENCES };
   }
};

/**
 * Editor preferences. Signed-out visitors (or hosts without the authenticated feature) keep them in
 * localStorage; signed-in users read and write them through `/api/preferences`. The two stores are
 * independent: signing in never uploads the browser copy, and signing out keeps it untouched.
 */
export function usePreferences() {
   const preferences = useState<UserPreferences>("preferences:value", () => ({ ...DEFAULT_USER_PREFERENCES }));
   const source = useState<PreferencesSource>("preferences:source", () => "local");
   const { user } = useAppAuth();
   const { authenticated } = useFeatureFlags();
   const signedIn = computed(() => authenticated.value && Boolean(user.value));

   const load = async () => {
      if (!import.meta.client) return;
      if (signedIn.value) {
         try {
            const view = await $fetch<UserPreferencesView>("/api/preferences");
            preferences.value = normalizeUserPreferences(view.preferences);
            source.value = "account";
            return;
         } catch {
            // Fall back to the browser copy when the account store is unreachable.
         }
      }
      preferences.value = readLocal();
      source.value = "local";
   };

   const update = async (patch: Partial<UserPreferences>) => {
      const previous = preferences.value;
      preferences.value = normalizeUserPreferences({ ...previous, ...patch });
      if (source.value === "account") {
         try {
            const view = await $fetch<UserPreferencesView>("/api/preferences", { method: "PUT", body: { preferences: patch } });
            preferences.value = normalizeUserPreferences(view.preferences);
         } catch (error) {
            preferences.value = previous;
            throw error;
         }
         return;
      }
      localStorage.setItem(LOCAL_PREFERENCES_KEY, JSON.stringify(preferences.value));
   };

   return { preferences: readonly(preferences), source: readonly(source), signedIn, load, update };
}
