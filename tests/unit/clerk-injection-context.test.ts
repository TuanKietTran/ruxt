import { createSSRApp, defineComponent, h, type Ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it, vi } from "vitest";
import { clerkPlugin, useClerk } from "@clerk/vue";

/**
 * Root cause of the dead Logout button: Clerk's composables read Vue's injection context, which only
 * exists while a component or plugin is being set up. The old `logout()` called `useClerk()` from a
 * click handler, where there is no context, so it threw before signing anyone out.
 *
 * These tests run the real @clerk/vue plugin (in Node it installs its injection without loading
 * ClerkJS) and pin both halves: the failure mode, and the capture-in-setup pattern `useAppAuth` uses.
 */
type FakeClerk = { signOut: () => Promise<void> };

async function renderWith(setup: () => void) {
    const app = createSSRApp(defineComponent({ setup: () => { setup(); return () => h("div"); } }));
    app.use(clerkPlugin as never, { publishableKey: "pk_test_Y2xlcmsuZXhhbXBsZS5jb20k" });
    await renderToString(app);
}

describe("Clerk injection context", () => {
    it("throws when useClerk() runs outside component setup, as the old logout() did", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(() => useClerk()).toThrow(/can only be used when the Vue plugin is installed/);
        warn.mockRestore();
    });

    it("signs out through a handle captured during setup, long after setup has finished", async () => {
        const signOut = vi.fn(async () => {});
        let captured: Ref<FakeClerk | null> | undefined;
        await renderWith(() => {
            captured = useClerk() as unknown as Ref<FakeClerk | null>;
            captured.value = { signOut };
        });
        expect(captured).toBeDefined();
        // A later click handler uses the captured ref: no injection lookup, so no throw.
        await captured!.value!.signOut();
        expect(signOut).toHaveBeenCalledTimes(1);
    });
});
