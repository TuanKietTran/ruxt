import type { RecordKey } from "~/utils/cloudSync/contracts";
import type { SyncKind } from "~/utils/cloudSync/types";
import { bannerFor } from "~/utils/cloudSync/syncSummary";

/**
 * The one-line "what is cloud sync doing" banner for a list of record kinds (the editor's sessions, the
 * profiles page). Null while signed out, while sync is off, or when there is nothing to say. The wording and
 * priorities live in syncSummary.ts so every surface agrees.
 */
export function useCloudSyncBanner(kinds: readonly SyncKind[]) {
   const { authenticated } = useFeatureFlags();
   const { user } = useAppAuth();
   const sync = useCloudSync();
   const banner = computed(() => (authenticated.value && user.value ? bannerFor(sync.view.value, kinds) : null));
   const download = async (keys: RecordKey[]) => { await sync.download(keys); };
   return { banner, busy: sync.busy, download };
}
