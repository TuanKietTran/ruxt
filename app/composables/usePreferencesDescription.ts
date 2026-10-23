import { computed, type Ref } from "vue";
import type { PreferencesSource } from "./usePreferences";

/** Describe the actual storage state, including an unavailable signed-in account store. */
export function usePreferencesDescription(state: {
    signedIn: Readonly<Ref<boolean>>;
    source: Readonly<Ref<PreferencesSource>>;
    loaded: Readonly<Ref<boolean>>;
}) {
    return computed(() => !state.loaded.value
        ? "Loading your preferences…"
        : state.signedIn.value
            ? state.source.value === "account"
                ? "Signed in: these settings are saved to your account and follow you across devices."
                : "Your account preferences are unavailable right now; changes are saved in this browser."
            : "These settings are saved in this browser only. Sign in to keep them with your account.");
}
