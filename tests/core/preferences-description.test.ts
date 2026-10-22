import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { usePreferencesDescription } from "../../app/composables/usePreferencesDescription";

/** Mock the account/browser composable state without live Clerk credentials or production access. */
const mockedPreferences = (signedIn: boolean, source: "account" | "local", loaded = true) => vi.fn(() => ({
    signedIn: ref(signedIn), source: ref(source), loaded: ref(loaded),
}));

describe("settings storage description with mocked preferences state", () => {
    it("never tells a signed-in account user to sign in", () => {
        const preferences = mockedPreferences(true, "account")();
        const copy = usePreferencesDescription(preferences);
        expect(copy.value).toBe("Signed in: these settings are saved to your account and follow you across devices.");
        expect(copy.value).not.toContain("Sign in to");
    });

    it("explains account-store failure truthfully while the user remains signed in", () => {
        const preferences = mockedPreferences(true, "local")();
        const copy = usePreferencesDescription(preferences);
        expect(copy.value).toBe("Your account preferences are unavailable right now; changes are saved in this browser.");
        expect(copy.value).not.toContain("Sign in to");
        preferences.source.value = "account";
        expect(copy.value).toContain("saved to your account");
    });

    it("waits for storage resolution and reacts to sign out", () => {
        const preferences = mockedPreferences(true, "local", false)();
        const copy = usePreferencesDescription(preferences);
        expect(copy.value).toBe("Loading your preferences…");
        preferences.loaded.value = true;
        expect(copy.value).not.toContain("Sign in to");
        preferences.signedIn.value = false;
        preferences.source.value = "account"; // A stale source must never override the actual auth state.
        expect(copy.value).toBe("These settings are saved in this browser only. Sign in to keep them with your account.");
    });
});
