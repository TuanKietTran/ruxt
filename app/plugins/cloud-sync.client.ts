import { onLocalChange } from "~/utils/cloudSync/localChanges";
import { createRecordAdapters } from "~/utils/cloudSync/kinds";
import { SYNC_KINDS } from "~/utils/cloudSync/kinds";
import { currentCloudSyncEngine, startCloudSync, stopCloudSync } from "~/composables/useCloudSync";
import type { EngineView } from "~/utils/cloudSync/contracts";

/**
 * Starts cloud sync for the signed-in account and feeds it browser events. Nothing here sends a request
 * by itself: the engine decides (leader tab only, batched, and only for records the user selected).
 */
export default defineNuxtPlugin(() => {
   const { user } = useAppAuth();
   const { authenticated } = useFeatureFlags();
   const view = useState<EngineView | null>("cloud-sync:view", () => null);
   const adapters = createRecordAdapters();

   watch(() => (authenticated.value ? user.value?.id ?? null : null), async (ownerId) => {
      if (!ownerId) {
         stopCloudSync();
         view.value = null;
         return;
      }
      await startCloudSync(ownerId, next => { view.value = next; });
   }, { immediate: true });

   onLocalChange(change => currentCloudSyncEngine()?.notifyLocalChange(change));
   // Writes made in other tabs of this browser arrive as storage events.
   window.addEventListener("storage", (event) => {
      if (!event.key) return;
      for (const kind of SYNC_KINDS) {
         if (adapters[kind].ownsStorageKey(event.key)) currentCloudSyncEngine()?.notifyLocalChange({ kind, id: "*", origin: "local" });
      }
   });
   document.addEventListener("visibilitychange", () => {
      const active = currentCloudSyncEngine();
      if (document.visibilityState === "visible") active?.onVisible();
      else active?.onPageHide();
   });
   window.addEventListener("pagehide", () => currentCloudSyncEngine()?.onPageHide());
   window.addEventListener("online", () => currentCloudSyncEngine()?.onOnline());
});
