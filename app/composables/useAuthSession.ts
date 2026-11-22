import { hasUnsavedEditorEdits } from "~/utils/cloudSync/localChanges";
import {
   clerkOwnerOf,
   passiveSignOutTarget,
   reconcileBrowserSession,
   reconcileSession,
   sessionUserFromCookies,
} from "~/utils/authSession";

const RESYNC_GUARD_KEY = "ruxt:auth-resync";
const RESYNC_GUARD_MS = 60_000;

/** At most one automatic reload per account per minute, so a stubborn cookie can never loop. */
function claimResync(userId: string): boolean {
   try {
      const previous = JSON.parse(sessionStorage.getItem(RESYNC_GUARD_KEY) ?? "null") as { userId: string; at: number } | null;
      if (previous && previous.userId === userId && Date.now() - previous.at < RESYNC_GUARD_MS) return false;
      sessionStorage.setItem(RESYNC_GUARD_KEY, JSON.stringify({ userId, at: Date.now() }));
   } catch { /* storage unavailable: allow the one attempt */ }
   return true;
}

/**
 * Keeps the app's account in step with Clerk for the life of the page. Mounted once from app.vue.
 *
 * The account is described by `/api/auth/me`, which the server calls while rendering. Clerk signs
 * people in on the client without a reload, so without this the page keeps showing "signed out" after
 * sign-in (and has no sign-out control), and keeps showing the old account after Clerk ends the session
 * in another tab. It makes at most one `/api/auth/me` request per Clerk account change and never polls:
 * everything else is event-driven (Clerk's own state, a BroadcastChannel hint, tab focus).
 */
export function useAuthSession() {
   if (!import.meta.client) return;
   const { user, clerkSession, fetchMe, expireSession } = useAppAuth();
   const { authenticated } = useFeatureFlags();
   const signingOut = useState<boolean>("auth:signing-out", () => false);
   const route = useRoute();
   const toast = useToast();
   let describedFor: string | null = null;
   let announcedSwitch = false;

   const reconcile = async () => {
      if (!authenticated.value) return;
      const clerkUserId = clerkSession.value;
      const action = reconcileSession({ clerkUserId, appUserId: user.value?.id });
      if (action === "clear") {
         describedFor = null;
         expireSession();
         if (signingOut.value) return;
         toast.push("You were signed out. Your CVs, profiles and templates are still on this device.", { tone: "info", timeout: 8_000 });
         const target = passiveSignOutTarget(route.path, route.fullPath);
         if (target) await navigateTo(target);
         return;
      }
      if (action !== "refresh" || !clerkUserId || describedFor === clerkUserId) return;
      describedFor = clerkUserId;
      // Another account replaced the one on screen: drop it before describing the new one.
      if (user.value && user.value.id !== clerkOwnerOf(clerkUserId)) expireSession();
      if (await fetchMe()) authBroadcast().post({ type: "signed-in" });
   };

   watch(() => [authenticated.value, clerkSession.value, user.value?.id] as const, reconcile, { immediate: true });

   /**
    * ClerkJS tells other tabs about a sign-out but not about a sign-in or an account switch, so this tab
    * can keep showing the old account (or none) while the browser's session cookie names another. The
    * server always trusts the cookie, so rather than act as the wrong account this tab reloads onto the
    * right one, unless an editor still holds unsaved edits.
    */
   const checkBrowserSession = (): boolean => {
      if (!authenticated.value || signingOut.value) return false;
      const cookieUserId = sessionUserFromCookies(document.cookie);
      if (reconcileBrowserSession({ clerkUserId: clerkSession.value, cookieUserId }) !== "resync" || !cookieUserId) return false;
      if (hasUnsavedEditorEdits()) {
         if (!announcedSwitch) {
            announcedSwitch = true;
            toast.push("Your account changed in another tab. Reload this tab to switch; your local work is kept.", { tone: "warning", timeout: 12_000 });
         }
         return true;
      }
      if (claimResync(cookieUserId)) window.location.reload();
      return true;
   };

   const onVisible = () => { if (document.visibilityState === "visible") checkBrowserSession(); };
   document.addEventListener("visibilitychange", onVisible);
   window.addEventListener("focus", onVisible);

   // A legacy cookie session is invisible to Clerk; sign-in and sign-out in another tab arrive here.
   const stopListening = authBroadcast().subscribe((message) => {
      if (!authenticated.value) return;
      if (message.type === "signed-out" && user.value) {
         describedFor = null;
         expireSession();
      } else if (message.type === "signed-in") {
         if (checkBrowserSession()) return;
         if (!user.value) void fetchMe();
      }
   });

   onScopeDispose(() => {
      stopListening();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
   });
}
