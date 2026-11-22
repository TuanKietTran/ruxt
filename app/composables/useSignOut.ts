import { hasUnsavedEditorEdits } from "~/utils/cloudSync/localChanges";
import { pendingWorkWarning, postSignOutTarget } from "~/utils/authSession";

/** How long sign-out waits for one last batched upload of already-linked records before warning. */
const FLUSH_BEFORE_SIGN_OUT_MS = 4_000;

/**
 * The one sign-out action shared by every layout and route. It warns about unsynchronised work without
 * ever blocking, ends the Clerk (and legacy cookie) session, reports failure instead of faking success,
 * and leaves every browser-local CV session, draft, template and profile exactly where it was.
 */
export function useSignOut() {
   const { logout, user } = useAppAuth();
   const cloudSync = useCloudSync();
   const appDialog = useAppDialog();
   const toast = useToast();
   const route = useRoute();
   // Read by the passive-sign-out watcher so our own sign-out is not mistaken for another tab's.
   const signingOut = useState<boolean>("auth:signing-out", () => false);

   const pendingWork = () => {
      const view = cloudSync.view.value;
      return {
         pendingUploads: view?.pendingCount ?? 0,
         conflicts: view?.conflictCount ?? 0,
         unsavedEdits: hasUnsavedEditorEdits(),
      };
   };

   let busy = false;
   const signOut = async (): Promise<boolean> => {
      if (busy || signingOut.value) return false;
      busy = true;
      try {
         // Records the user already linked to the cloud may have a change queued; give it one bounded
         // chance to go out while the session is still valid. This never links or uploads anything new.
         if (user.value && (cloudSync.view.value?.pendingCount ?? 0) > 0 && navigator.onLine !== false) {
            await Promise.race([cloudSync.syncNow(), new Promise(resolve => setTimeout(resolve, FLUSH_BEFORE_SIGN_OUT_MS))]);
         }
         const warning = pendingWorkWarning(pendingWork());
         if (warning) {
            const confirmed = await appDialog.confirm({
               title: "Sign out with unsynced changes?",
               message: warning,
               confirmLabel: "Sign out",
               cancelLabel: "Stay signed in",
            });
            if (!confirmed) return false;
         }
         signingOut.value = true;
         const target = postSignOutTarget(route.path);
         const result = await logout({ redirectUrl: target ?? route.fullPath });
         if (!result.ok) {
            toast.push(result.message, { tone: "error", timeout: 10_000 });
            return false;
         }
         if (target) await navigateTo(target);
         toast.push("Signed out. Your CVs, profiles and templates are still on this device.", { tone: "success" });
         return true;
      } finally {
         signingOut.value = false;
         busy = false;
      }
   };

   return { signOut, signingOut: readonly(signingOut) };
}
