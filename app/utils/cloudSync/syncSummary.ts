/**
 * Plain-language summary of what cloud sync is doing, derived from an EngineView only. The header chip, the
 * editor's session list and the profiles page all read it, so they never disagree and none of them can show a
 * silent empty state while records wait in the cloud. No DOM, no network. Per-record wording lives in
 * syncPresentation.ts.
 */
import type { EngineView, RecordKey, SyncRecordView } from "./contracts";
import { SYNC_KIND_REGISTRY } from "./kinds";
import { leaderTabOf, presentRecord, syncAvailability } from "./syncPresentation";
import type { SyncKind } from "./types";

export interface SyncSummary {
   /** Records sync is moving right now (queued or in flight), in either direction. */
   syncing: SyncRecordView[];
   /** Records sync should be moving but cannot (offline, retrying, no tab answering, nothing scheduled). */
   waiting: SyncRecordView[];
   /** Of syncing and waiting, the cloud copies coming down (automatic kinds). */
   incoming: SyncRecordView[];
   /** Of syncing and waiting, the local changes going up. */
   outgoing: SyncRecordView[];
   /** Cloud copies that stay in the cloud until chosen (mode "only records I select", or no consent, or stopped). */
   notOnDevice: SyncRecordView[];
   /** Of `notOnDevice`, the ones whose kind the account consented to: the only ones a Download-all may fetch. */
   downloadable: SyncRecordView[];
   overLimit: SyncRecordView[];
   /** Records whose sync failed or was refused for a reason other than the limit or a conflict. */
   failed: SyncRecordView[];
   conflicts: SyncRecordView[];
   /** Why the waiting records wait (the first reason), if any. */
   waitingReason: string | null;
}

export function summarizeSync(view: EngineView | null, kinds?: readonly SyncKind[]): SyncSummary {
   const summary: SyncSummary = {
      syncing: [], waiting: [], incoming: [], outgoing: [], notOnDevice: [], downloadable: [], overLimit: [], failed: [], conflicts: [], waitingReason: null,
   };
   if (!view) return summary;
   for (const record of view.records) {
      if (kinds && !kinds.includes(record.kind)) continue;
      const presentation = presentRecord(view, record);
      switch (presentation.phase) {
         case "syncing":
         case "waiting":
            (presentation.phase === "syncing" ? summary.syncing : summary.waiting).push(record);
            (record.status === "cloud-only" ? summary.incoming : summary.outgoing).push(record);
            if (presentation.phase === "waiting") summary.waitingReason ??= presentation.reason ?? null;
            break;
         case "cloud-only":
            summary.notOnDevice.push(record);
            if (view.kinds[record.kind]?.consented && !record.optedOut) summary.downloadable.push(record);
            break;
         case "attention":
            if (record.status === "over-limit") summary.overLimit.push(record);
            else if (record.status === "conflict") summary.conflicts.push(record);
            else if (record.status === "blocked" || record.status === "error") summary.failed.push(record);
            break;
         default:
      }
   }
   return summary;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const items = (n: number) => count(n, "item", "items");

export type BannerTone = "busy" | "warning" | "danger" | "neutral";
export interface BannerModel {
   tone: BannerTone;
   text: string;
   /** Download these records now (only kinds the account consented to). */
   download?: { label: string; keys: RecordKey[] };
   /** Offer to run a sync here and now. */
   syncNow?: boolean;
   /** Where to read more or fix it. */
   href?: string;
}

const SETTINGS = "/settings/cloud-data";

/**
 * The one-line banner for a list of `kinds` (the editor's sessions, the profiles page). Highest-priority
 * message first: a sync error, conflicts, records that cannot sync, records waiting for sync (with the reason),
 * a download in progress, then cloud copies that stay in the cloud until chosen (with a Download action when the
 * account consented to the kind). Uploads in progress are the chip's business, not the banner's. Null when
 * there is nothing to say or nobody to say it to.
 */
export function bannerFor(view: EngineView | null, kinds: readonly SyncKind[]): BannerModel | null {
   if (!view || view.status === "disabled" || view.status === "signed-out") return null;
   const summary = summarizeSync(view, kinds);
   const names = kinds.length === 1 ? SYNC_KIND_REGISTRY[kinds[0]!].plural : "items";
   if (view.status === "unavailable") return { tone: "neutral", text: "Cloud sync is unavailable right now. Your local data is safe.", href: SETTINGS };
   if (view.status === "error" && view.lastError) return { tone: "danger", text: `Cloud sync failed: ${view.lastError.message}`, syncNow: true, href: SETTINGS };
   if (summary.conflicts.length) {
      return { tone: "warning", text: `${count(summary.conflicts.length, "conflict", "conflicts")} between this device and your cloud. Both versions are kept.`, href: `${SETTINGS}#conflicts` };
   }
   if (summary.failed.length) {
      const reason = summary.failed.find(record => record.message)?.message;
      return { tone: "warning", text: `${items(summary.failed.length)} could not sync${reason ? `: ${reason}` : ""}`, href: `${SETTINGS}#records` };
   }
   if (summary.overLimit.length) {
      return { tone: "warning", text: `${items(summary.overLimit.length)} could not sync (over limit). Remove a cloud copy you no longer need to make room.`, href: `${SETTINGS}#records` };
   }
   if (summary.waiting.length) {
      const availability = syncAvailability(view);
      return {
         tone: "warning",
         text: `Waiting for sync: ${items(summary.waiting.length)} ${summary.waiting.length === 1 ? "is" : "are"} not in sync yet. ${summary.waitingReason ?? ""}`.trim(),
         ...(availability.where === "nowhere" && availability.cause === "offline" ? {} : { syncNow: true }),
         href: SETTINGS,
      };
   }
   if (summary.incoming.length) {
      const elsewhere = leaderTabOf(view) !== "this";
      return { tone: "busy", text: elsewhere ? `Syncing in another tab: ${items(summary.incoming.length)} from your cloud` : `Downloading ${items(summary.incoming.length)} from your cloud` };
   }
   if (summary.notOnDevice.length) {
      const text = `${items(summary.notOnDevice.length)} in your cloud ${summary.notOnDevice.length === 1 ? "is" : "are"} not on this device.`;
      return summary.downloadable.length
         ? { tone: "neutral", text, download: { label: `Download (${summary.downloadable.length})`, keys: summary.downloadable.map(record => record.key) }, href: SETTINGS }
         : { tone: "neutral", text: `${text} Turn on cloud sync for ${names} to download them.`, href: `${SETTINGS}#consent` };
   }
   // Never a silent empty list: the very first catch-up is still running and nothing is here yet.
   const firstCatchUp = view.lastSyncAt === null && !view.records.some(record => kinds.includes(record.kind));
   if (firstCatchUp && (view.status === "syncing" || syncAvailability(view).where === "other-tab")) {
      return { tone: "busy", text: `Checking your cloud for ${names}…` };
   }
   return null;
}

/** Counts for the header chip: everything across all kinds. */
export function chipSummary(view: EngineView): {
   incoming: number; outgoing: number; syncing: number; waiting: number; overLimit: number; failed: number; firstReason: string | null; waitingReason: string | null;
} {
   const summary = summarizeSync(view);
   return {
      incoming: summary.incoming.length,
      outgoing: summary.outgoing.length,
      syncing: summary.syncing.length,
      waiting: summary.waiting.length,
      overLimit: summary.overLimit.length,
      failed: summary.failed.length,
      firstReason: summary.failed.find(record => record.message)?.message ?? null,
      waitingReason: summary.waitingReason,
   };
}
