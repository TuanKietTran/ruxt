import { describe, expect, it, vi } from "vitest";
import {
    AUTH_CHANNEL_NAME,
    clerkOwnerOf,
    createAuthBroadcast,
    isAccountRoute,
    isClerkOwner,
    passiveSignOutTarget,
    pendingWorkWarning,
    postSignOutTarget,
    reconcileBrowserSession,
    reconcileSession,
    sessionUserFromCookies,
    signOutAccount,
    type SignOutDeps,
} from "../../app/utils/authSession";

describe("session reconciliation with Clerk", () => {
    it("does nothing until Clerk has reported", () => {
        expect(reconcileSession({ clerkUserId: undefined, appUserId: null })).toBe("none");
        expect(reconcileSession({ clerkUserId: undefined, appUserId: "clerk:user_1" })).toBe("none");
    });

    it("describes the account when Clerk is signed in but the app shows nobody (sign-in without a reload)", () => {
        expect(reconcileSession({ clerkUserId: "user_1", appUserId: null })).toBe("refresh");
    });

    it("refreshes when another account replaced the one on screen", () => {
        expect(reconcileSession({ clerkUserId: "user_2", appUserId: clerkOwnerOf("user_1") })).toBe("refresh");
    });

    it("is stable when both agree", () => {
        expect(reconcileSession({ clerkUserId: "user_1", appUserId: clerkOwnerOf("user_1") })).toBe("none");
    });

    it("clears a Clerk-backed account when Clerk reports signed out (other tab, expiry)", () => {
        expect(reconcileSession({ clerkUserId: null, appUserId: clerkOwnerOf("user_1") })).toBe("clear");
    });

    it("never clears a legacy cookie session because Clerk is signed out", () => {
        expect(reconcileSession({ clerkUserId: null, appUserId: "7d0e5f3a-0000-4000-8000-000000000001" })).toBe("none");
        expect(isClerkOwner("7d0e5f3a-0000-4000-8000-000000000001")).toBe(false);
    });
});

describe("routes around sign-out", () => {
    it("keeps editor pages where they are and sends account-only pages to the editor", () => {
        for (const path of ["/", "/p", "/jobs", "/jobs/applications/1", "/settings", "/about", "/e/abc"]) {
            expect(isAccountRoute(path)).toBe(false);
            expect(postSignOutTarget(path)).toBeNull();
            expect(passiveSignOutTarget(path, `${path}?s=1`)).toBeNull();
        }
        for (const path of ["/d", "/d/providers", "/settings/cloud-data", "/settings/account"]) {
            expect(isAccountRoute(path)).toBe(true);
            expect(postSignOutTarget(path)).toBe("/");
        }
        expect(passiveSignOutTarget("/settings/cloud-data", "/settings/cloud-data?x=1"))
            .toEqual({ path: "/login", query: { redirect: "/settings/cloud-data?x=1" } });
    });

    it("does not treat look-alike prefixes as account routes", () => {
        expect(isAccountRoute("/dashboard")).toBe(false);
        expect(isAccountRoute("/settings/cloud-data-export")).toBe(false);
    });
});

describe("pending work warning", () => {
    it("stays silent when nothing is waiting", () => {
        expect(pendingWorkWarning({ pendingUploads: 0, conflicts: 0, unsavedEdits: false })).toBeNull();
    });

    it("names each kind of unsynchronised work and promises nothing is deleted", () => {
        const text = pendingWorkWarning({ pendingUploads: 2, conflicts: 1, unsavedEdits: true })!;
        expect(text).toContain("An open editor has edits");
        expect(text).toContain("2 changes have not been uploaded");
        expect(text).toContain("1 record has a sync conflict");
        expect(text).toContain("Nothing is deleted");
        expect(pendingWorkWarning({ pendingUploads: 1, conflicts: 0, unsavedEdits: false })).toContain("1 change has not been uploaded");
    });
});

function deps(overrides: Partial<SignOutDeps> = {}): SignOutDeps & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        appUserId: clerkOwnerOf("user_1"),
        clerkSignedIn: true,
        clerk: { signOut: vi.fn(async () => { calls.push("clerk"); }) },
        serverLogout: vi.fn(async () => { calls.push("server"); }),
        onSignedOut: vi.fn(() => { calls.push("forget"); }),
        timeoutMs: 50,
        ...overrides,
    };
}

describe("signOutAccount", () => {
    it("ends the Clerk session, then the server cookie, then forgets the account", async () => {
        const d = deps({ redirectUrl: "/p" });
        expect(await signOutAccount(d)).toEqual({ ok: true });
        expect(d.calls).toEqual(["clerk", "server", "forget"]);
        expect(d.clerk!.signOut).toHaveBeenCalledWith({ redirectUrl: "/p" });
    });

    it("keeps the user signed in and says why when Clerk is unreachable", async () => {
        const d = deps({ clerk: { signOut: vi.fn(async () => { throw new Error("Failed to fetch"); }) } });
        const result = await signOutAccount(d);
        expect(result.ok).toBe(false);
        expect(!result.ok && result.message).toMatch(/still signed in/);
        expect(!result.ok && result.message).toMatch(/local work is untouched/);
        expect(d.onSignedOut).not.toHaveBeenCalled();
        expect(d.serverLogout).not.toHaveBeenCalled();
    });

    it("times out a hung Clerk call instead of waiting forever", async () => {
        const d = deps({ clerk: { signOut: () => new Promise(() => {}) } });
        const result = await signOutAccount(d);
        expect(result.ok).toBe(false);
        expect(d.onSignedOut).not.toHaveBeenCalled();
    });

    it("reports a missing Clerk client rather than pretending to sign out", async () => {
        const d = deps({ clerk: null });
        const result = await signOutAccount(d);
        expect(!result.ok && result.message).toMatch(/has not loaded/);
        expect(d.onSignedOut).not.toHaveBeenCalled();
        expect(d.serverLogout).not.toHaveBeenCalled();
    });

    it("signs a legacy cookie account out through the server only", async () => {
        const d = deps({ appUserId: "legacy-uuid", clerkSignedIn: false, clerk: null });
        expect(await signOutAccount(d)).toEqual({ ok: true });
        expect(d.calls).toEqual(["server", "forget"]);
    });

    it("fails a legacy sign-out when the server cannot clear the cookie", async () => {
        const d = deps({ appUserId: "legacy-uuid", clerkSignedIn: false, clerk: null, serverLogout: vi.fn(async () => { throw new Error("offline"); }) });
        expect((await signOutAccount(d)).ok).toBe(false);
        expect(d.onSignedOut).not.toHaveBeenCalled();
    });

    it("refuses to sign out while offline, because ClerkJS would only clear this page and the session would return", async () => {
        const d = deps({ online: () => false });
        const result = await signOutAccount(d);
        expect(!result.ok && result.message).toMatch(/offline/);
        expect(!result.ok && result.message).toMatch(/still signed in/);
        expect(d.clerk!.signOut).not.toHaveBeenCalled();
        expect(d.serverLogout).not.toHaveBeenCalled();
        expect(d.onSignedOut).not.toHaveBeenCalled();
    });

    it("does not need a connection when nobody is signed in", async () => {
        const d = deps({ online: () => false, appUserId: null, clerkSignedIn: false, clerk: null });
        expect(await signOutAccount(d)).toEqual({ ok: true });
        expect(d.serverLogout).not.toHaveBeenCalled();
        expect(d.onSignedOut).toHaveBeenCalledTimes(1);
    });

    it("treats a failed server call as harmless once Clerk has ended a Clerk account", async () => {
        const d = deps({ serverLogout: vi.fn(async () => { throw new Error("offline"); }) });
        expect(await signOutAccount(d)).toEqual({ ok: true });
        expect(d.onSignedOut).toHaveBeenCalledTimes(1);
    });

    it("signs out a Clerk session the server never described (late or failed /api/auth/me)", async () => {
        const d = deps({ appUserId: null, clerkSignedIn: true });
        expect(await signOutAccount(d)).toEqual({ ok: true });
        expect(d.clerk!.signOut).toHaveBeenCalledTimes(1);
    });
});

describe("browser session cookie", () => {
    const jwt = (claims: object) => {
        const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
        return `${encode({ alg: "RS256" })}.${encode(claims)}.signature`;
    };

    it("reads the user id from the session token cookie", () => {
        expect(sessionUserFromCookies(`theme=mocha; __session=${jwt({ sub: "user_bob" })}; other=1`)).toBe("user_bob");
        expect(sessionUserFromCookies(`__session_VufoYsE8=${jwt({ sub: "user_dev" })}`)).toBe("user_dev");
    });

    it("ignores absent, malformed or unrelated cookies", () => {
        expect(sessionUserFromCookies("")).toBeNull();
        expect(sessionUserFromCookies("__client_uat=1795330000; theme=mocha")).toBeNull();
        expect(sessionUserFromCookies("__session=not-a-jwt")).toBeNull();
        expect(sessionUserFromCookies(`__session=${jwt({ iat: 1 })}`)).toBeNull();
        expect(sessionUserFromCookies("__session=a.%%%.c")).toBeNull();
    });

    it("asks for a resync only when the cookie names a different user than this tab's Clerk", () => {
        expect(reconcileBrowserSession({ clerkUserId: "user_alice", cookieUserId: "user_bob" })).toBe("resync");
        expect(reconcileBrowserSession({ clerkUserId: null, cookieUserId: "user_bob" })).toBe("resync");
        expect(reconcileBrowserSession({ clerkUserId: "user_bob", cookieUserId: "user_bob" })).toBe("none");
        expect(reconcileBrowserSession({ clerkUserId: "user_alice", cookieUserId: null })).toBe("none");
        expect(reconcileBrowserSession({ clerkUserId: undefined, cookieUserId: "user_bob" })).toBe("none");
    });
});

describe("auth broadcast", () => {
    it("delivers only well-formed messages and unsubscribes cleanly", () => {
        const listeners = new Set<(event: MessageEvent) => void>();
        const posted: unknown[] = [];
        const channel = {
            postMessage: (message: unknown) => { posted.push(message); },
            addEventListener: (_: string, fn: (event: MessageEvent) => void) => listeners.add(fn),
            removeEventListener: (_: string, fn: (event: MessageEvent) => void) => listeners.delete(fn),
            close: vi.fn(),
        } as unknown as BroadcastChannel;
        const names: string[] = [];
        const broadcast = createAuthBroadcast((name) => { names.push(name); return channel; });
        const seen: unknown[] = [];
        const stop = broadcast.subscribe(message => seen.push(message));

        broadcast.post({ type: "signed-out" });
        expect(posted).toEqual([{ type: "signed-out" }]);
        expect(names).toEqual([AUTH_CHANNEL_NAME]);

        for (const fn of listeners) {
            fn({ data: { type: "signed-out" } } as MessageEvent);
            fn({ data: { type: "something-else" } } as MessageEvent);
            fn({ data: null } as MessageEvent);
        }
        expect(seen).toEqual([{ type: "signed-out" }]);

        stop();
        expect(listeners.size).toBe(0);
    });

    it("is a no-op where BroadcastChannel does not exist", () => {
        const broadcast = createAuthBroadcast(null);
        expect(() => broadcast.post({ type: "signed-in" })).not.toThrow();
        expect(broadcast.subscribe(() => {})).toBeTypeOf("function");
        expect(() => broadcast.close()).not.toThrow();
    });
});
