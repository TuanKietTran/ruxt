/**
 * What the sync UI says about a record or about sync as a whole, derived from an EngineView only (no DOM, no
 * network). The Records tab, the header chip, the banners and the Overview all read this module, so they cannot
 * disagree.
 *
 * The model: a record that cloud sync is responsible for ends in exactly one place, "In your cloud" (it is on this
 * device and in the cloud and both agree). "On this device only" is final only when sync is not responsible for
 * the record (the kind is not consented, the mode is "Only records I select", or the user stopped syncing it).
 * For a record sync is responsible for, "only on this device" and "only in the cloud" are passing states: they
 * show as "Syncing" while something is working on them and as "Waiting for sync" (with the reason) when nothing
 * can, never as a resting label. Exceptions (conflict, over limit, error, blocked, removed from cloud, deleted on
 * this device) always carry their reason.
 */
import type { EngineView, RecordStatus, SyncRecordView } from "./contracts";
import { SYNC_KIND_REGISTRY } from "./kinds";

export type RecordPhase = "device" | "cloud" | "cloud-only" | "syncing" | "waiting" | "attention";
export type PresentationTone = "neutral" | "ok" | "busy" | "warning" | "danger";

export const LABEL = {
   device: "On this device only",
   cloud: "In your cloud",
   cloudOnly: "Only in your cloud",
   syncing: "Syncing",
   syncingElsewhere: "Syncing in another tab",
   waiting: "Waiting for sync",
} as const;

export interface RecordPresentation {
   phase: RecordPhase;
   label: string;
   tone: PresentationTone;
   /** Why the record is in this state. Always present for "waiting" and "attention". */
   reason?: string;
   status: RecordStatus;
}

/** Who can move records right now, as far as this tab can tell. */
export type Availability =
   | { where: "here" }
   | { where: "other-tab" }
   | { where: "nowhere"; cause: "offline" | "unavailable" | "retrying" | "silent" | "outdated"; reason: string };

export function leaderTabOf(view: EngineView): NonNullable<EngineView["leaderTab"]> {
   return view.leaderTab ?? (view.leader ? "this" : "other");
}

export function syncAvailability(view: EngineView): Availability {
   if (view.status === "offline") return { where: "nowhere", cause: "offline", reason: "This device is offline. It syncs when it is back online." };
   if (view.status === "unavailable") return { where: "nowhere", cause: "unavailable", reason: "Cloud sync is unavailable right now. It checks again later." };
   if (view.status === "error") return { where: "nowhere", cause: "retrying", reason: "The last sync failed. It tries again by itself; Sync now retries at once." };
   if (view.retryAt) return { where: "nowhere", cause: "retrying", reason: "A recent sync failed. It tries again by itself; Sync now retries at once." };
   const tab = leaderTabOf(view);
   if (tab === "silent") return { where: "nowhere", cause: "silent", reason: "The tab that syncs stopped answering. This tab is taking over." };
   if (tab === "outdated") return { where: "nowhere", cause: "outdated", reason: "The tab that syncs runs an older version of the app. This tab is taking over." };
   return tab === "this" ? { where: "here" } : { where: "other-tab" };
}

/** Why a record rests where it is when sync is not responsible for it. */
function restingReason(view: EngineView, record: SyncRecordView): string {
   const kind = view.kinds[record.kind];
   const plural = SYNC_KIND_REGISTRY[record.kind].plural;
   if (record.optedOut) return "Syncing was stopped for this record on this device.";
   if (!kind?.consented) return `Cloud sync is off for ${plural}.`;
   if (kind.mode === "selected") return `${plural.charAt(0).toUpperCase()}${plural.slice(1)} sync only when you select them.`;
   return "Confirm the retention notice to start syncing.";
}

function inMotion(view: EngineView, status: RecordStatus, reason?: string): RecordPresentation {
   const availability = syncAvailability(view);
   if (availability.where === "nowhere") return { phase: "waiting", label: LABEL.waiting, tone: "warning", reason: availability.reason, status };
   if (availability.where === "other-tab") return { phase: "syncing", label: LABEL.syncingElsewhere, tone: "busy", reason: reason ?? "Another tab of this browser is syncing.", status };
   // This tab is the one that syncs. Work with nothing running or scheduled is stuck, and says so.
   if ((view.activity ?? "scheduled") === "idle") {
      return { phase: "waiting", label: LABEL.waiting, tone: "warning", reason: "Nothing is scheduled to sync it. Choose Sync now to retry.", status };
   }
   return { phase: "syncing", label: LABEL.syncing, tone: "busy", ...(reason ? { reason } : {}), status };
}

export function presentRecord(view: EngineView, record: SyncRecordView): RecordPresentation {
   const status = record.status;
   // Before the first answer this browser does not know what the account consented to: that is "checking", not "off".
   const consentKnown = view.consent !== null && view.consent !== undefined;
   const automatic = Boolean(view.kinds[record.kind]?.automatic);
   switch (status) {
      case "conflict":
         return { phase: "attention", label: "Conflict", tone: "danger", reason: record.message ?? "This device and the cloud both changed it. Both versions are kept until you choose.", status };
      case "error":
         return { phase: "attention", label: "Error", tone: "danger", reason: record.message ?? "Sync could not finish for this record.", status };
      case "blocked":
         return { phase: "attention", label: "Blocked", tone: "danger", reason: record.message ?? "The cloud refused this record.", status };
      case "over-limit":
         return { phase: "attention", label: "Not synced: over limit", tone: "danger", reason: record.message ?? "The cloud copy limit for this kind is reached.", status };
      case "cloud-removed":
         return { phase: "attention", label: "Removed from cloud", tone: "warning", reason: "The cloud copy was removed. The record stays on this device.", status };
      case "local-missing":
         return { phase: "attention", label: "Deleted on this device", tone: "warning", reason: "It is still in your cloud. Download it to bring it back.", status };
      case "synced":
         return { phase: "cloud", label: LABEL.cloud, tone: "ok", status };
      case "local-only":
         if (!consentKnown && !record.optedOut) return inMotion(view, status, "Checking your cloud settings.");
         if (automatic && !record.optedOut) return inMotion(view, status, "Uploading to your cloud.");
         return { phase: "device", label: LABEL.device, tone: "neutral", reason: restingReason(view, record), status };
      case "cloud-only":
         if (!consentKnown && !record.optedOut) return inMotion(view, status, "Checking your cloud settings.");
         if (automatic && !record.optedOut) return inMotion(view, status, "Downloading from your cloud.");
         return { phase: "cloud-only", label: LABEL.cloudOnly, tone: "neutral", reason: restingReason(view, record), status };
      case "behind":
         return inMotion(view, status, "Applying a newer cloud version.");
      case "modified":
      case "pending":
         return inMotion(view, status, "Uploading your changes.");
   }
}

/** Records sync is still moving or waiting on, with their presentation. */
export function owedRecords(view: EngineView, kinds?: readonly string[]): Array<{ record: SyncRecordView; presentation: RecordPresentation }> {
   const owed: Array<{ record: SyncRecordView; presentation: RecordPresentation }> = [];
   for (const record of view.records) {
      if (kinds && !kinds.includes(record.kind)) continue;
      const presentation = presentRecord(view, record);
      if (presentation.phase === "syncing" || presentation.phase === "waiting") owed.push({ record, presentation });
   }
   return owed;
}

export function owedCount(view: EngineView): number {
   return owedRecords(view).length;
}

/** The record filters of the Records tab. */
export type PhaseFilter = "all" | "device" | "cloud" | "cloud-only" | "syncing" | "attention";

export function matchesPhase(presentation: RecordPresentation, filter: PhaseFilter): boolean {
   if (filter === "all") return true;
   if (filter === "syncing") return presentation.phase === "syncing" || presentation.phase === "waiting";
   return presentation.phase === filter;
}

/** One sentence naming what a tab does for sync, for the Overview's connection line. */
export function connectionText(view: EngineView): string {
   if (view.status === "offline") return "Offline";
   const tab = leaderTabOf(view);
   if (tab === "silent") return "The tab that syncs is not answering; this tab is taking over";
   if (tab === "outdated") return "The tab that syncs runs an older version; this tab is taking over";
   if (tab !== "this") return "Another tab is syncing";
   return {
      connected: "Live updates on", connecting: "Connecting", down: "Reconnecting",
      unavailable: "Live updates unavailable; checking periodically", idle: "Not connected yet",
   }[view.push];
}

export interface QuotaFact { label: string; value: string }

/**
 * The Overview's cloud-copy lines: "Cloud copies: <kind>  n of limit" per kind when the server reported per-kind
 * caps. A quota saved by an older release (one shared total) or none yet falls back to what this device knows,
 * with a note, instead of a total that reads as the limit of every kind.
 */
export function quotaFacts(view: EngineView): { facts: QuotaFact[]; note: string | null } {
   const quota = view.quota;
   if (quota?.kinds) {
      const facts = (Object.keys(SYNC_KIND_REGISTRY) as Array<keyof typeof SYNC_KIND_REGISTRY>).flatMap((kind) => {
         const entry = quota.kinds![kind];
         return entry ? [{ label: `Cloud copies: ${SYNC_KIND_REGISTRY[kind].plural}`, value: `${entry.used} of ${entry.limit}` }] : [];
      });
      return { facts, note: null };
   }
   const known = new Map<string, number>();
   for (const record of view.records) if (record.cloudRevision !== undefined) known.set(record.kind, (known.get(record.kind) ?? 0) + 1);
   const facts: QuotaFact[] = [...known.entries()].map(([kind, count]) => ({
      label: `Cloud copies: ${SYNC_KIND_REGISTRY[kind as keyof typeof SYNC_KIND_REGISTRY].plural}`, value: `${count} in your cloud`,
   }));
   if (!quota) return { facts: facts.length ? facts : [{ label: "Cloud copies", value: "Unknown until the first sync" }], note: facts.length ? "The limit for each kind is shown after the next sync." : null };
   return { facts: facts.length ? facts : [{ label: "Cloud copies", value: `${quota.used} of ${quota.limit}` }], note: "The limit for each kind is shown after the next sync." };
}
