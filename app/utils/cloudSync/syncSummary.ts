/**
 * Plain-language summary of what cloud sync is doing, derived from an EngineView only. The header chip, the
 * editor's session list and the profiles page all read it, so they never disagree and none of them can show a
 * silent empty state while records wait in the cloud. No DOM, no network.
 */
import type { EngineView, RecordKey, SyncRecordView } from "./contracts";
import { SYNC_KIND_REGISTRY } from "./kinds";
import type { SyncKind } from "./types";

export interface SyncSummary {
   /** Cloud-only copies of automatic kinds: they come down with no click, so they count as "downloading". */
   incoming: SyncRecordView[];
   /** Cloud-only copies that will not come down by themselves (mode "only records I select", or a failed download). */
   waiting: SyncRecordView[];
   /** Of `waiting`, the ones whose kind the account consented to: the only ones a Download-all may fetch. */
   downloadable: SyncRecordView[];
   overLimit: SyncRecordView[];
   /** Records whose sync failed or was refused for a reason other than the limit or a conflict. */
   failed: SyncRecordView[];
   conflicts: SyncRecordView[];
}

const isDownloadFailure = (record: SyncRecordView) => record.status === "error";

export function summarizeSync(view: EngineView | null, kinds?: readonly SyncKind[]): SyncSummary {
   const summary: SyncSummary = { incoming: [], waiting: [], downloadable: [], overLimit: [], failed: [], conflicts: [] };
   if (!view) return summary;
   for (const record of view.records) {
      if (kinds && !kinds.includes(record.kind)) continue;
      const kind = view.kinds[record.kind];
      if (record.status === "cloud-only") {
         if (record.optedOut) continue;
         if (kind?.automatic) summary.incoming.push(record);
         else {
            summary.waiting.push(record);
            if (kind?.consented) summary.downloadable.push(record);
         }
      } else if (record.status === "over-limit") summary.overLimit.push(record);
      else if (record.status === "conflict") summary.conflicts.push(record);
      else if (record.status === "blocked" || isDownloadFailure(record)) summary.failed.push(record);
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
   /** Where to read more or fix it. */
   href?: string;
}

const SETTINGS = "/settings/cloud-data";

/**
 * The one-line banner for a list of `kinds` (the editor's sessions, the profiles page). Highest-priority
 * message first: a sync error, conflicts, records that cannot sync, a download in progress, then cloud copies
 * that are not on this device (with a Download action when the account consented to the kind). Null when
 * there is nothing to say or nobody to say it to.
 */
export function bannerFor(view: EngineView | null, kinds: readonly SyncKind[]): BannerModel | null {
   if (!view || view.status === "disabled" || view.status === "signed-out") return null;
   const summary = summarizeSync(view, kinds);
   const names = kinds.length === 1 ? SYNC_KIND_REGISTRY[kinds[0]!].plural : "items";
   if (view.status === "unavailable") return { tone: "neutral", text: "Cloud sync is unavailable right now. Your local data is safe.", href: SETTINGS };
   if (view.status === "error" && view.lastError) return { tone: "danger", text: `Cloud sync failed: ${view.lastError.message}`, href: SETTINGS };
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
   if (summary.incoming.length) {
      return view.status === "syncing"
         ? { tone: "busy", text: `Downloading ${items(summary.incoming.length)} from your cloud` }
         : { tone: "neutral", text: `${items(summary.incoming.length)} in your cloud ${summary.incoming.length === 1 ? "is" : "are"} not on this device yet.`, download: { label: `Download (${summary.incoming.length})`, keys: summary.incoming.map(record => record.key) } };
   }
   if (summary.waiting.length) {
      const text = `${items(summary.waiting.length)} in your cloud ${summary.waiting.length === 1 ? "is" : "are"} not on this device.`;
      return summary.downloadable.length
         ? { tone: "neutral", text, download: { label: `Download (${summary.downloadable.length})`, keys: summary.downloadable.map(record => record.key) }, href: SETTINGS }
         : { tone: "neutral", text: `${text} Turn on cloud sync for ${names} to download them.`, href: `${SETTINGS}#consent` };
   }
   // Never a silent empty list: the very first catch-up is still running and nothing is here yet.
   if (view.status === "syncing" && view.lastSyncAt === null && !view.records.some(record => kinds.includes(record.kind))) {
      return { tone: "busy", text: `Checking your cloud for ${names}…` };
   }
   return null;
}

/** Counts for the header chip: everything across all kinds. */
export function chipSummary(view: EngineView): { incoming: number; overLimit: number; failed: number; firstReason: string | null } {
   const summary = summarizeSync(view);
   return {
      incoming: summary.incoming.length,
      overLimit: summary.overLimit.length,
      failed: summary.failed.length,
      firstReason: summary.failed.find(record => record.message)?.message ?? null,
   };
}
