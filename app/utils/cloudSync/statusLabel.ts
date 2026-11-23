import type { EngineView } from './contracts';
import { chipSummary, items } from './syncSummary';

export type StatusTone = 'neutral' | 'busy' | 'ok' | 'warning' | 'danger';

export interface SyncStatusLabel { tone: StatusTone; icon: string; label: string; detail: string; }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Short relative time for the header pill. Dates older than a day render as a bare month and day
 * (for example 'Nov 20'); unknown times render as 'never' so the caller can still show a detail.
 */
export function relativeTime(iso: string | null, now: number): string {
   if (!iso) return 'never';
   const then = Date.parse(iso);
   if (Number.isNaN(then)) return 'never';
   const diffMs = now - then;
   if (diffMs < 60_000) return 'just now';
   const diffMin = Math.floor(diffMs / 60_000);
   if (diffMin < 60) return diffMin === 1 ? '1 min ago' : `${diffMin} min ago`;
   const diffHours = Math.floor(diffMin / 60);
   if (diffHours < 24) return diffHours === 1 ? '1 h ago' : `${diffHours} h ago`;
   const date = new Date(then);
   return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

const plural = (count: number, one: string, many: string): string => count === 1 ? one : many;

/**
 * Header status for an engine view. First match wins; null means the header renders nothing
 * (sync disabled, or the user is signed out). No engine code is imported here, only the view.
 */
export function describeSyncStatus(view: EngineView | null, now: number): SyncStatusLabel | null {
   if (!view || view.status === 'disabled' || view.status === 'signed-out') return null;
   const anyLinked = view.records.some((record) => record.linked);
   const chip = chipSummary(view);
   let label: SyncStatusLabel;
   if (view.status === 'unavailable') {
      label = { tone: 'neutral', icon: 'lucide:cloud-off', label: 'Cloud sync unavailable', detail: '' };
   } else if (view.status === 'offline') {
      label = {
         tone: 'warning',
         icon: 'lucide:wifi-off',
         label: 'Offline',
         detail: view.pendingCount > 0 ? `${view.pendingCount} ${plural(view.pendingCount, 'change', 'changes')} waiting` : '',
      };
   } else if (view.conflictCount > 0) {
      label = {
         tone: 'warning',
         icon: 'lucide:triangle-alert',
         label: view.conflictCount === 1 ? '1 conflict' : `${view.conflictCount} conflicts`,
         detail: '',
      };
   } else if (view.status === 'error') {
      label = { tone: 'danger', icon: 'lucide:circle-alert', label: 'Sync failed', detail: view.lastError?.message ?? 'Unknown error' };
   } else if (view.status === 'syncing' && chip.incoming > 0) {
      label = { tone: 'busy', icon: 'lucide:cloud-download', label: `Downloading ${items(chip.incoming)} from your cloud`, detail: '' };
   } else if (view.status === 'syncing') {
      label = { tone: 'busy', icon: 'lucide:loader-circle', label: 'Syncing', detail: '' };
   } else if (chip.overLimit > 0) {
      label = {
         tone: 'warning', icon: 'lucide:triangle-alert', label: `${items(chip.overLimit)} could not sync (over limit)`,
         detail: 'Remove a cloud copy you no longer need to make room',
      };
   } else if (chip.failed > 0) {
      label = {
         tone: 'warning', icon: 'lucide:triangle-alert', label: `${items(chip.failed)} could not sync`,
         detail: chip.firstReason ?? 'Open Cloud sync to see why',
      };
   } else if (chip.incoming > 0) {
      label = {
         tone: 'neutral', icon: 'lucide:cloud-download', label: `${items(chip.incoming)} waiting in your cloud`,
         detail: 'Sync now to bring them to this device',
      };
   } else if (view.pendingCount > 0) {
      label = {
         tone: 'busy',
         icon: 'lucide:cloud-upload',
         label: view.pendingCount === 1 ? '1 pending' : `${view.pendingCount} pending`,
         detail: '',
      };
   } else if (anyLinked) {
      label = { tone: 'ok', icon: 'lucide:cloud', label: 'Synced', detail: `Last synced ${relativeTime(view.lastSyncAt, now)}` };
   } else {
      label = { tone: 'neutral', icon: 'lucide:cloud', label: 'Cloud sync', detail: Object.values(view.kinds).some((kind) => kind.automatic) ? 'Nothing to sync yet' : 'Nothing selected for sync' };
   }
   // The push channel can be down while sync itself is fine; say so when anything is linked.
   if ((view.push === 'down' || view.push === 'unavailable') && anyLinked) {
      label = { ...label, detail: label.detail ? `${label.detail}. Live updates paused` : 'Live updates paused' };
   }
   return label;
}
