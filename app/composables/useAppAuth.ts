import { hasInjectionContext, type Ref } from "vue";
import {
  createAuthBroadcast,
  signOutAccount,
  type AuthBroadcast,
  type SignOutResult,
} from "~/utils/authSession";

export interface AuthUser {
  id: string;
  email: string;
}

type ClerkHandle = { loaded?: boolean; signOut(options?: { redirectUrl?: string }): Promise<unknown> };

let broadcast: AuthBroadcast | null = null;
/** One BroadcastChannel per tab, created on first use in the browser. */
export function authBroadcast(): AuthBroadcast {
  broadcast ??= createAuthBroadcast();
  return broadcast;
}

/**
 * Clerk's composables read the Vue injection context, which exists only while a component or plugin
 * is being set up. A click handler runs later with no context, so `useClerk()` called there throws and
 * the Logout button silently does nothing. Capture the handles once, here, while a context exists.
 */
function captureClerk() {
  if (!hasInjectionContext()) return { clerk: null, userId: null };
  let clerk: Ref<ClerkHandle | null | undefined> | null = null;
  let userId: Ref<string | null | undefined> | null = null;
  try { clerk = useClerk() as unknown as Ref<ClerkHandle | null | undefined>; } catch { /* Clerk plugin absent */ }
  try { userId = useAuth().userId as unknown as Ref<string | null | undefined>; } catch { /* Clerk plugin absent */ }
  return { clerk, userId };
}

export function useAppAuth() {
  const user = useState<AuthUser | null>("auth:user", () => null);
  const { clerk, userId: clerkUserId } = captureClerk();

  // Clerk's own view of this browser: undefined while unknown, null signed out, else the user id.
  const clerkSession = computed(() => clerkUserId?.value);
  // The app account when known; otherwise a signed-in Clerk session the server has not described yet.
  // Sign-out controls follow this, so a failed or late /api/auth/me never hides them.
  const signedIn = computed(() => Boolean(user.value) || Boolean(clerkSession.value));

  // No network logout or navigation on expiry: preserve all browser-local content.
  const expireSession = () => { user.value = null; };

  const fetchMe = async () => {
    try {
      const fetch = useRequestFetch();
      const data = await fetch<AuthUser>("/api/auth/me");
      user.value = data;
      return true;
    } catch {
      user.value = null;
      return false;
    }
  };

  const login = async (email: string, password: string) => {
    await $fetch("/api/auth/login", { method: "POST", body: { email, password } });
    await fetchMe();
    if (import.meta.client) authBroadcast().post({ type: "signed-in" });
  };

  const register = async (email: string, password: string) => {
    await $fetch("/api/auth/register", { method: "POST", body: { email, password } });
    await fetchMe();
    if (import.meta.client) authBroadcast().post({ type: "signed-in" });
  };

  const resolveClerk = (): ClerkHandle | null => {
    const instance = clerk?.value ?? (import.meta.client ? (window as unknown as { Clerk?: ClerkHandle }).Clerk : null) ?? null;
    return instance && instance.loaded !== false ? instance : null;
  };

  /**
   * End the account session. Resolves `{ ok: false }` (and leaves the user signed in) when the session
   * could not be ended; it never touches browser-local CV sessions, drafts, templates or profiles.
   */
  const logout = async (options: { redirectUrl?: string } = {}): Promise<SignOutResult> => {
    const result = await signOutAccount({
      appUserId: user.value?.id ?? null,
      clerkSignedIn: Boolean(clerkSession.value),
      clerk: resolveClerk(),
      // The transport signature rather than Nitro's route-inferred union, whose type depth the compiler cannot bear.
      serverLogout: () => ($fetch as unknown as typeof import("ofetch").$fetch)("/api/auth/logout", { method: "POST", retry: 0 }),
      onSignedOut: () => { user.value = null; },
      redirectUrl: options.redirectUrl,
      online: () => !import.meta.client || navigator.onLine !== false,
    });
    if (result.ok && import.meta.client) authBroadcast().post({ type: "signed-out" });
    return result;
  };

  return {
    user: readonly(user),
    signedIn,
    clerkSession,
    fetchMe,
    login,
    register,
    logout,
    expireSession,
  };
}
