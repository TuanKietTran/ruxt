/**
 * Interfaces shared by the cloud-sync modules. Each module (records, state, push, coordinator, merge,
 * engine, UI) implements or consumes exactly these shapes; change them here first.
 */
import type { QuotaDto, ConsentViewDto, SyncKind, SyncMode, SyncSnapshot, CloudHistoryDto } from "./types";
import { isSyncKind } from "./kinds";

// ---------------------------------------------------------------------------------------------
// Records: browser-local data the user can choose to synchronize (app/utils/cloudSync/records.ts)
// ---------------------------------------------------------------------------------------------

/** One local record in canonical form. `snapshot.content` is canonical JSON (see records.ts). */
export interface LocalRecord {
   kind: SyncKind;
   id: string;
   title: string;
   /** ISO time of the last local write. */
   updatedAt: string;
   snapshot: SyncSnapshot;
   /** True when a local save landed on top of a cloud-applied version it did not start from. */
   syncConflict?: boolean;
}

export interface RecordAdapter {
   readonly kind: SyncKind;
   /** Every eligible local record of this kind (built-in templates are never eligible). */
   list(): LocalRecord[];
   get(id: string): LocalRecord | null;
   /**
    * Write cloud content to the local record `id` (create it when missing). Marks the record as
    * cloud-applied so a stale editor save is detected. Returns false when the browser refused.
    */
   write(id: string, snapshot: SyncSnapshot): boolean;
   /** Create a new local record (new id) from a snapshot; `title` replaces the snapshot title. */
   createCopy(snapshot: SyncSnapshot, title: string): string | null;
   /** Clear the syncConflict marker after the user resolved the conflict. */
   clearConflict(id: string): void;
   /** True when a localStorage key belongs to this kind (used for cross-tab storage events). */
   ownsStorageKey(key: string): boolean;
}

// ---------------------------------------------------------------------------------------------
// Persisted per-owner sync state (app/utils/cloudSync/state.ts)
// ---------------------------------------------------------------------------------------------

export type RecordKey = `${SyncKind}:${string}`;
export const recordKey = (kind: SyncKind, id: string): RecordKey => `${kind}:${id}`;
export const parseRecordKey = (key: string): { kind: SyncKind; id: string } | null => {
   const index = key.indexOf(":");
   const kind = key.slice(0, index);
   return index > 0 && isSyncKind(kind) ? { kind, id: key.slice(index + 1) } : null;
};

export type LinkState = "synced" | "pending" | "conflict" | "error" | "blocked" | "cloud-removed";

/** A local record the user selected for cloud sync on this device. */
export interface RecordLink {
   kind: SyncKind;
   id: string;
   /** Cloud head revision the local copy was last agreed with (0 = never uploaded). */
   baseRevision: number;
   /** Hash of that agreed content ("" before the first upload). */
   baseHash: string;
   state: LinkState;
   error?: { code: string; message: string; at: string };
   conflict?: { remoteRevision: number; remoteHash: string; detectedAt: string; reason: "both-changed" | "stale-editor" | "upload-rejected" };
   lastSyncedAt?: string;
}

/** What this device knows about a cloud head (metadata only; content lives in the blob store). */
export interface RemoteEntry {
   kind: SyncKind;
   id: string;
   revision: number;
   hash: string;
   title: string;
   updatedAt: string;
   bytes: number;
   checkpointCount: number;
   deleted?: { at: string; reason: "removed" | "expired" | "missing" };
}

/** A queued or in-flight mutation. `sentAt`+`snapshot` are set right before sending (exact retry). */
export interface PendingMutation {
   mutationId: string;
   operation: "save" | "remove";
   kind: SyncKind;
   id: string;
   expectedRevision: number;
   hash?: string;
   queuedAt: string;
   sentAt?: string;
   attempts: number;
   snapshot?: SyncSnapshot;
}

export interface JournalEntry {
   at: string;
   event: string;
   key?: string;
   detail?: string;
}

export interface RecoveryEntry {
   /** Blob-store key of the saved local snapshot. */
   blobKey: string;
   kind: SyncKind;
   id: string;
   title: string;
   savedAt: string;
   reason: "fast-forward" | "keep-cloud" | "merge" | "download" | "restore";
}

/** Counters for one UTC hour on this device. */
export interface HourMetrics {
   requests: number;
   noopRequests: number;
   failedRequests: number;
   retries: number;
   bytesUp: number;
   bytesDown: number;
   mutationsSent: number;
   changesReceived: number;
   conflicts: number;
   pushConnects: number;
   pushMessages: number;
   pushPings: number;
   latencyMsTotal: number;
   latencyMsMax: number;
   reasons: Record<string, number>;
}

export interface SyncState {
   v: 1;
   owner: string;
   deviceId: string;
   cursor: number | null;
   /** A full listing in progress (server answered reset). */
   listing: { after: number; seen: RecordKey[] } | null;
   lastSyncAt: string | null;
   lastAttemptAt: string | null;
   lastError: { code: string; message: string; at: string } | null;
   failures: number;
   backoffUntil: number | null;
   links: Record<RecordKey, RecordLink>;
   remote: Record<RecordKey, RemoteEntry>;
   outbox: Record<RecordKey, PendingMutation>;
   journal: JournalEntry[];
   recovery: RecoveryEntry[];
   quota: QuotaDto | null;
   consent: ConsentViewDto | null;
   retentionConfigured: boolean | null;
   /** When `quota` was last refreshed by a response; a blocked upload is retried only after a newer quota. */
   quotaAt: string | null;
   /** Per-kind sync mode on this device; absent means automatic. */
   modes: Partial<Record<SyncKind, SyncMode>>;
   /**
    * Records the user explicitly stopped syncing (unlink, remove from cloud). Automatic sync never links,
    * uploads or downloads them again until the user selects them; time of the choice.
    */
   optOut: Record<RecordKey, string>;
   /** UTC hour key "YYYY-MM-DDTHH" -> counters; the newest 48 are kept. */
   metrics: Record<string, HourMetrics>;
}

export interface SyncStateStore {
   /** Fresh read (other tabs may have written); creates a default state for a new owner. */
   load(): SyncState;
   save(state: SyncState): void;
   /** Fires when another tab changed this owner's state. Returns an unsubscribe function. */
   subscribe(listener: () => void): () => void;
}

// ---------------------------------------------------------------------------------------------
// Push channel (app/utils/cloudSync/push.ts)
// ---------------------------------------------------------------------------------------------

export type PushStatus = "idle" | "connecting" | "connected" | "down" | "unavailable";

export interface PushChannel {
   readonly status: PushStatus;
   /** Connect with a fresh ticket from the sync response (absolute or same-origin relative URL). */
   connect(url: string, ticket: string): void;
   close(): void;
}

export interface PushChannelEvents {
   /** Remote data changed up to `cursor` (from a "changed" or "hello" message). */
   onChanged(cursor: number): void;
   onStatus(status: PushStatus): void;
   /** The socket closed and a fresh ticket (one sync request) is needed to reconnect. */
   onNeedsTicket(): void;
   /** Counters: a ping was sent / a message arrived / a connection opened. */
   onMetric?(metric: "ping" | "message" | "connect"): void;
}

// ---------------------------------------------------------------------------------------------
// Cross-tab coordination (app/utils/cloudSync/coordinator.ts)
// ---------------------------------------------------------------------------------------------

export interface SyncCoordinator {
   /** True while this tab holds the per-owner leadership (owns timers and the push socket). */
   readonly isLeader: boolean;
   /** Resolves when leadership changes; callback receives the new value. Returns unsubscribe. */
   onLeadership(listener: (leader: boolean) => void): () => void;
   /** Run `task` while holding the exclusive per-owner network lock (one sync at a time, all tabs). */
   withNetworkLock<T>(task: () => Promise<T>): Promise<T>;
   /** Tell other tabs something happened (for example "state" or "flush-request"). */
   broadcast(message: { type: string; [key: string]: unknown }): void;
   onMessage(listener: (message: { type: string; [key: string]: unknown }) => void): () => void;
   dispose(): void;
}

// ---------------------------------------------------------------------------------------------
// Merge (app/utils/cloudSync/merge.ts)
// ---------------------------------------------------------------------------------------------

export type DiffLine = { op: "equal" | "insert" | "delete"; text: string };

export type MergeHunk =
   | { kind: "clean"; lines: string[] }
   | { kind: "conflict"; base: string[]; local: string[]; cloud: string[] };

export interface TextMergeResult {
   hunks: MergeHunk[];
   conflicts: number;
   /** Merged text when there are no conflicts, otherwise null. */
   merged: string | null;
}

// ---------------------------------------------------------------------------------------------
// Engine view and actions consumed by the UI (engine.ts implements, components consume)
// ---------------------------------------------------------------------------------------------

export type RecordStatus =
   | "local-only" | "cloud-only" | "synced" | "modified" | "behind" | "pending"
   | "conflict" | "error" | "blocked" | "over-limit" | "cloud-removed" | "local-missing";

export interface SyncRecordView {
   key: RecordKey;
   kind: SyncKind;
   id: string;
   title: string;
   status: RecordStatus;
   linked: boolean;
   localUpdatedAt?: string;
   cloudUpdatedAt?: string;
   cloudRevision?: number;
   baseRevision?: number;
   bytes?: number;
   checkpointCount?: number;
   message?: string;
   /** The user stopped syncing this record on this device; automatic sync leaves it alone. */
   optedOut?: boolean;
}

export type EngineStatus = "disabled" | "idle" | "syncing" | "offline" | "error" | "signed-out" | "unavailable";

/** What automatic sync does for one kind on this device. */
export interface KindSyncView {
   mode: SyncMode;
   /** Consent granted for the kind (server truth). */
   consented: boolean;
   /** Consent granted, retention notice acknowledged and mode automatic: the kind syncs with no clicks. */
   automatic: boolean;
}

export interface EngineView {
   status: EngineStatus;
   leader: boolean;
   push: PushStatus;
   lastSyncAt: string | null;
   lastError: { code: string; message: string; at: string } | null;
   pendingCount: number;
   conflictCount: number;
   quota: QuotaDto | null;
   consent: ConsentViewDto | null;
   retentionConfigured: boolean | null;
   records: SyncRecordView[];
   recovery: RecoveryEntry[];
   metrics: Record<string, HourMetrics>;
   kinds: Record<SyncKind, KindSyncView>;
}

export type ConflictChoice = "local" | "cloud" | "both";

export interface EngineActions {
   syncNow(): Promise<void>;
   /** Choose automatic sync or "only records I select" for a kind. Never deletes anything. */
   setMode(kind: SyncKind, mode: SyncMode): Promise<void>;
   /** Select records for upload (creates cloud copies on the next exchange). */
   upload(keys: RecordKey[]): Promise<void>;
   /** Bring cloud-only records to this device (or link identical local ones). */
   download(keys: RecordKey[]): Promise<void>;
   /** Stop syncing on this device; the cloud copy stays. */
   unlink(keys: RecordKey[]): Promise<void>;
   /** Explicitly remove cloud copies (local data untouched). */
   removeFromCloud(keys: RecordKey[]): Promise<void>;
   resolve(key: RecordKey, choice: ConflictChoice): Promise<void>;
   /** Resolve with a merged snapshot (written locally, then uploaded over the current cloud head). */
   resolveMerged(key: RecordKey, snapshot: SyncSnapshot): Promise<void>;
   /** Content of each side for diffs: local record, cloud head, last agreed base. */
   compare(key: RecordKey): Promise<{ local: SyncSnapshot | null; cloud: SyncSnapshot | null; base: SyncSnapshot | null }>;
   history(key: RecordKey): Promise<CloudHistoryDto>;
   /** Create a new local record from a cloud checkpoint (never changes the cloud head). */
   restoreAsCopy(key: RecordKey, snapshot: SyncSnapshot): Promise<string | null>;
   /** Explicit: make `snapshot` the local content and the new cloud head. */
   promote(key: RecordKey, snapshot: SyncSnapshot): Promise<void>;
   restoreRecovery(entry: RecoveryEntry): Promise<string | null>;
}
