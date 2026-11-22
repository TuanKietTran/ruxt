import type { EngineView, RecordKey, ConflictChoice, RecoveryEntry } from "~/utils/cloudSync/contracts";
import { CloudSyncEngine } from "~/utils/cloudSync/engine";
import { createIndexedDbBlobStore } from "~/utils/cloudSync/blobs";
import { createSyncCoordinator } from "~/utils/cloudSync/coordinator";
import { ownerFingerprint } from "~/utils/cloudSync/hash";
import { isEditorDirty } from "~/utils/cloudSync/localChanges";
import { createPushChannel } from "~/utils/cloudSync/push";
import { createRecordAdapters } from "~/utils/cloudSync/records";
import { createSyncStateStore } from "~/utils/cloudSync/state";
import { SyncHttpError, type CloudHistoryDto, type SyncKind, type SyncRequestDto, type SyncResponseDto, type SyncSnapshot } from "~/utils/cloudSync/types";

/**
 * One sync engine per signed-in account in this tab. It only runs when the authenticated feature is
 * on and a user is signed in; signing out stops it and leaves every local record and the per-account
 * sync bookkeeping in place, so signing back in resumes without uploading anything new.
 */
let engine: CloudSyncEngine | null = null;
let engineOwner: string | null = null;
let engineAccount: string | null = null;
let unsubscribe: (() => void) | null = null;

/** Tells the app that the server refused a request because the session now belongs to another account. */
export const OWNER_MISMATCH_EVENT = "ruxt:owner-mismatch";
const ownerHeaders = (): Record<string, string> => (engineAccount ? { "x-ruxt-expected-owner": engineAccount } : {});

async function readError(response: Response): Promise<SyncHttpError> {
   let data: { statusMessage?: string; message?: string; data?: { code?: string } } | null = null;
   try { data = await response.json(); } catch { /* not JSON */ }
   if (response.status === 409 && data?.data?.code === "OWNER_MISMATCH" && typeof window !== "undefined") window.dispatchEvent(new Event(OWNER_MISMATCH_EVENT));
   return new SyncHttpError(response.status, data?.statusMessage || data?.message || response.statusText || "Request failed", data?.data?.code);
}

async function send(body: SyncRequestDto) {
   const json = JSON.stringify(body);
   let response: Response;
   try {
      response = await fetch("/api/cloud-data/sync", {
         method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", ...ownerHeaders() }, body: json,
      });
   } catch (error) {
      throw new SyncHttpError(0, error instanceof Error ? error.message : "Network error");
   }
   if (!response.ok) throw await readError(response);
   const text = await response.text();
   return { response: JSON.parse(text) as SyncResponseDto, bytesUp: json.length, bytesDown: text.length };
}

async function fetchHistory(kind: SyncKind, id: string): Promise<CloudHistoryDto> {
   let response: Response;
   try {
      response = await fetch(`/api/cloud-data/copies/${kind}/${encodeURIComponent(id)}`, { credentials: "same-origin", headers: ownerHeaders() });
   } catch (error) {
      throw new SyncHttpError(0, error instanceof Error ? error.message : "Network error");
   }
   if (!response.ok) throw await readError(response);
   return response.json() as Promise<CloudHistoryDto>;
}

export async function startCloudSync(ownerId: string, onView: (view: EngineView) => void): Promise<CloudSyncEngine> {
   const owner = await ownerFingerprint(ownerId);
   if (engine && engineOwner === owner) return engine;
   stopCloudSync();
   engineAccount = ownerId;
   engine = new CloudSyncEngine({
      owner,
      store: createSyncStateStore(owner),
      blobs: createIndexedDbBlobStore(),
      adapters: createRecordAdapters(),
      transport: send,
      fetchHistory,
      coordinator: createSyncCoordinator(owner),
      createPush: typeof WebSocket === "undefined" ? undefined : events => createPushChannel(events, {
         createSocket: url => new WebSocket(url),
         clock: { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: handle => clearTimeout(handle as number) },
         origin: window.location.origin,
      }),
      online: () => navigator.onLine !== false,
      isEditorDirty,
   });
   engineOwner = owner;
   unsubscribe = engine.subscribe(onView);
   engine.start();
   return engine;
}

export function stopCloudSync(): void {
   unsubscribe?.();
   unsubscribe = null;
   engine?.stop();
   engine = null;
   engineOwner = null;
   engineAccount = null;
}

export function currentCloudSyncEngine(): CloudSyncEngine | null {
   return engine;
}

/** Reactive view plus actions; every action is a no-op while sync is not running. */
export function useCloudSync() {
   const view = useState<EngineView | null>("cloud-sync:view", () => null);
   const busy = useState<boolean>("cloud-sync:busy", () => false);
   const lastActionError = useState<string>("cloud-sync:error", () => "");
   const run = async <T>(action: (active: CloudSyncEngine) => Promise<T>): Promise<T | null> => {
      if (!engine) return null;
      busy.value = true;
      lastActionError.value = "";
      try {
         return await action(engine);
      } catch (error) {
         lastActionError.value = error instanceof Error ? error.message : "The sync action failed.";
         return null;
      } finally {
         busy.value = false;
      }
   };
   return {
      view: readonly(view),
      busy: readonly(busy),
      error: readonly(lastActionError),
      syncNow: () => run(active => active.syncNow()),
      upload: (keys: RecordKey[]) => run(active => active.upload(keys)),
      download: (keys: RecordKey[]) => run(active => active.download(keys)),
      unlink: (keys: RecordKey[]) => run(active => active.unlink(keys)),
      removeFromCloud: (keys: RecordKey[]) => run(active => active.removeFromCloud(keys)),
      resolve: (key: RecordKey, choice: ConflictChoice) => run(active => active.resolve(key, choice)),
      resolveMerged: (key: RecordKey, snapshot: SyncSnapshot) => run(active => active.resolveMerged(key, snapshot)),
      compare: (key: RecordKey) => run(active => active.compare(key)),
      history: (key: RecordKey) => run(active => active.history(key)),
      restoreAsCopy: (key: RecordKey, snapshot: SyncSnapshot) => run(active => active.restoreAsCopy(key, snapshot)),
      promote: (key: RecordKey, snapshot: SyncSnapshot) => run(active => active.promote(key, snapshot)),
      restoreRecovery: (entry: RecoveryEntry) => run(active => active.restoreRecovery(entry)),
   };
}
