/**
 * Pure decisions behind sign-in state and sign-out. Nothing here touches Vue, Clerk or the network, so
 * every branch is unit-testable; `useAppAuth`, `useSignOut` and `useAuthSession` supply the real effects.
 *
 * Sign-out never deletes browser-local work. It ends the account session only: CV sessions, drafts,
 * templates, profiles and the per-account sync bookkeeping stay in this browser.
 */

/** Server owner ids for Clerk accounts are `clerk:<clerk user id>`; legacy cookie sessions use a bare UUID. */
export const CLERK_OWNER_PREFIX = "clerk:";

export const isClerkOwner = (id: string | null | undefined): boolean => Boolean(id?.startsWith(CLERK_OWNER_PREFIX));

export const clerkOwnerOf = (clerkUserId: string): string => `${CLERK_OWNER_PREFIX}${clerkUserId}`;

export type SessionReconcile = "none" | "refresh" | "clear";

/**
 * Compare what Clerk says about this browser with the account the app is showing.
 *
 * `clerkUserId` is `undefined` while Clerk has not reported yet, `null` when it reports signed out, and
 * the user id otherwise. A legacy cookie session is independent of Clerk, so Clerk being signed out
 * never clears it.
 */
export function reconcileSession(input: {
   clerkUserId: string | null | undefined;
   appUserId: string | null | undefined;
}): SessionReconcile {
   const { clerkUserId, appUserId } = input;
   if (clerkUserId === undefined) return "none";
   if (clerkUserId) return appUserId === clerkOwnerOf(clerkUserId) ? "none" : "refresh";
   return isClerkOwner(appUserId) ? "clear" : "none";
}

/**
 * The Clerk user id named by the browser's session cookie, or null. Clerk keeps the short-lived session
 * token in `__session` (development instances add `__session_<suffix>`), readable by script. Only the
 * unverified `sub` is used, to notice that another tab changed account; the server still verifies the
 * token on every request, so nothing here grants access.
 */
export function sessionUserFromCookies(cookieHeader: string): string | null {
   for (const pair of cookieHeader.split(";")) {
      const separator = pair.indexOf("=");
      if (separator < 0) continue;
      const name = pair.slice(0, separator).trim();
      if (name !== "__session" && !name.startsWith("__session_")) continue;
      const payload = pair.slice(separator + 1).trim().split(".")[1];
      if (!payload) continue;
      try {
         const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
         const claims = JSON.parse(typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("utf8")) as { sub?: unknown };
         if (typeof claims.sub === "string" && claims.sub) return claims.sub;
      } catch { /* not a JWT */ }
   }
   return null;
}

/**
 * Another tab signed in, or switched account, without this tab's Clerk noticing (ClerkJS only syncs
 * sign-outs between tabs). The browser's cookie then names a different user than this tab's Clerk.
 */
export function reconcileBrowserSession(input: {
   clerkUserId: string | null | undefined;
   cookieUserId: string | null;
}): "none" | "resync" {
   if (input.clerkUserId === undefined || !input.cookieUserId) return "none";
   return input.cookieUserId === input.clerkUserId ? "none" : "resync";
}

/** Routes that need an account. Kept in step with the protected prefixes in `auth.global.ts`. */
const ACCOUNT_ROUTE_PREFIXES = ["/d", "/settings/cloud-data", "/settings/account"];

export function isAccountRoute(path: string): boolean {
   return ACCOUNT_ROUTE_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Where to go after the account session ended. Editor pages are local-first and stay where they are
 * (the user keeps working on the same CV); pages that only make sense for an account go to the editor.
 */
export function postSignOutTarget(path: string): string | null {
   return isAccountRoute(path) ? "/" : null;
}

/** What to do when another tab or an expired session ends the account while this page is open. */
export function passiveSignOutTarget(path: string, fullPath: string): { path: string; query: { redirect: string } } | null {
   return isAccountRoute(path) ? { path: "/login", query: { redirect: fullPath } } : null;
}

export interface PendingWork {
   /** Records linked to the cloud whose latest local changes have not been uploaded. */
   pendingUploads: number;
   /** Records whose local and cloud copies diverged and still need a decision. */
   conflicts: number;
   /** An open editor holds edits it has not written to browser storage yet. */
   unsavedEdits: boolean;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * The text of the sign-out warning, or null when there is nothing to warn about. The warning never
 * blocks sign-out: every item it names stays on this device either way.
 */
export function pendingWorkWarning(work: PendingWork): string | null {
   const parts: string[] = [];
   if (work.unsavedEdits) parts.push("an open editor has edits that are still being saved to this browser");
   if (work.pendingUploads > 0) {
      parts.push(`${work.pendingUploads} ${plural(work.pendingUploads, "change has", "changes have")} not been uploaded to your cloud copy yet`);
   }
   if (work.conflicts > 0) {
      parts.push(`${work.conflicts} ${plural(work.conflicts, "record has", "records have")} a sync conflict you have not resolved`);
   }
   if (!parts.length) return null;
   const [first = "", ...rest] = parts;
   const sentence = [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join("; ");
   return `${sentence}. Nothing is deleted: your CVs, profiles and templates stay on this device, and uploads resume the next time you sign in.`;
}

export type SignOutResult = { ok: true } | { ok: false; message: string };

export interface SignOutDeps {
   /** The app's current account, if any. */
   appUserId: string | null;
   /** Clerk reports an active session in this browser. */
   clerkSignedIn: boolean;
   /** The Clerk client, or null while it has not loaded (blocked script, offline first load). */
   clerk: { signOut(options?: { redirectUrl?: string }): Promise<unknown> } | null;
   /** Ends the legacy cookie session on the server. */
   serverLogout(): Promise<unknown>;
   /** Runs once the session is really over: forget the account in memory. */
   onSignedOut(): void;
   redirectUrl?: string;
   timeoutMs?: number;
   /**
    * Whether the browser has a connection. ClerkJS signs out locally and swallows a network error, so
    * an offline "sign-out" would clear the page while the session stays valid on the server and comes
    * back after a reload. Offline is therefore refused up front instead.
    */
   online?: () => boolean;
}

export const SIGN_OUT_TIMEOUT_MS = 10_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
   return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), ms);
      work.then(
         (value) => { clearTimeout(timer); resolve(value); },
         (error) => { clearTimeout(timer); reject(error); },
      );
   });
}

/**
 * End the account session. The account is only forgotten after the session really ended: when Clerk
 * cannot be reached the user stays signed in and is told so, rather than seeing a signed-out page whose
 * session is still valid on the server.
 */
export async function signOutAccount(deps: SignOutDeps): Promise<SignOutResult> {
   const timeoutMs = deps.timeoutMs ?? SIGN_OUT_TIMEOUT_MS;
   const clerkSession = deps.clerkSignedIn || isClerkOwner(deps.appUserId);
   const legacySession = Boolean(deps.appUserId) && !isClerkOwner(deps.appUserId);

   if (!clerkSession && !legacySession) {
      deps.onSignedOut();
      return { ok: true };
   }

   if (deps.online && !deps.online()) {
      return { ok: false, message: "You are offline, so the session cannot be ended on the server yet and you are still signed in. Reconnect and sign out again. Your local work is untouched." };
   }

   if (clerkSession) {
      if (!deps.clerk) {
         return { ok: false, message: "The sign-in service has not loaded, so you could not be signed out. Reload the page and try again. Your local work is untouched." };
      }
      try {
         await withTimeout(Promise.resolve(deps.clerk.signOut(deps.redirectUrl ? { redirectUrl: deps.redirectUrl } : undefined)), timeoutMs);
      } catch {
         return { ok: false, message: "Could not reach the sign-in service, so you are still signed in. Check your connection and try again. Your local work is untouched." };
      }
   }

   try {
      await withTimeout(Promise.resolve(deps.serverLogout()), timeoutMs);
   } catch {
      // A Clerk account has no server cookie to clear; only a legacy session depends on this call.
      if (legacySession) {
         return { ok: false, message: "Could not reach the server, so you are still signed in. Check your connection and try again. Your local work is untouched." };
      }
   }

   deps.onSignedOut();
   return { ok: true };
}

/** A single-tab-safe hook for telling other tabs that the account changed. */
export interface AuthBroadcast {
   post(message: AuthBroadcastMessage): void;
   subscribe(listener: (message: AuthBroadcastMessage) => void): () => void;
   close(): void;
}

export type AuthBroadcastMessage = { type: "signed-out" } | { type: "signed-in" };

export const AUTH_CHANNEL_NAME = "ruxt:auth";

/** BroadcastChannel wrapper; a browser without it simply has no cross-tab hint (Clerk still syncs its own tabs). */
export function createAuthBroadcast(factory: ((name: string) => BroadcastChannel) | null = typeof BroadcastChannel === "undefined" ? null : name => new BroadcastChannel(name)): AuthBroadcast {
   const channel = factory ? factory(AUTH_CHANNEL_NAME) : null;
   return {
      post: (message) => { try { channel?.postMessage(message); } catch { /* channel closed */ } },
      subscribe: (listener) => {
         if (!channel) return () => {};
         const handler = (event: MessageEvent) => {
            const data = event.data as AuthBroadcastMessage | undefined;
            if (data?.type === "signed-out" || data?.type === "signed-in") listener(data);
         };
         channel.addEventListener("message", handler);
         return () => channel.removeEventListener("message", handler);
      },
      close: () => { try { channel?.close(); } catch { /* already closed */ } },
   };
}
