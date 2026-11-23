/**
 * Pure view logic for the Records view of the sync workspace.
 * No DOM, no network, no engine calls: the component feeds it an EngineView
 * and renders what these helpers return, so every rule here is unit-testable.
 */
import type { EngineView, RecordKey, RecordStatus, SyncRecordView } from './contracts';
import { kindConsentGranted, SYNC_KIND_REGISTRY, SYNC_KINDS } from './kinds';
import { matchesPhase, presentRecord, type PhaseFilter } from './syncPresentation';
import type { SyncKind } from './types';

export type RecordFilter = { kind: SyncKind | 'all'; status: PhaseFilter };

/**
 * Statuses that are exceptions: sync cannot finish them without the user, so they sort first. Records still
 * moving (changed here, cloud is newer, uploading) are not exceptions; they are "syncing".
 */
export const ATTENTION_STATUSES: readonly RecordStatus[] = [
    'conflict',
    'error',
    'blocked',
    'over-limit',
    'cloud-removed',
    'local-missing',
];

function isAttention(status: RecordStatus): boolean {
    return ATTENTION_STATUSES.includes(status);
}

/** The records of `view` that pass the filter; the status filter matches what the Records tab shows for each. */
export function filterRecords(view: EngineView, records: SyncRecordView[], filter: RecordFilter): SyncRecordView[] {
    return records.filter((record) => {
        if (filter.kind !== 'all' && record.kind !== filter.kind) return false;
        return matchesPhase(presentRecord(view, record), filter.status);
    });
}

/** Newest of the local/cloud updated times, or -1 when neither is known. */
function newestUpdatedAt(record: SyncRecordView): number {
    const times = [record.localUpdatedAt, record.cloudUpdatedAt]
        .map((value) => (value ? Date.parse(value) : Number.NaN))
        .filter((value) => !Number.isNaN(value));
    return times.length ? Math.max(...times) : -1;
}

export function sortRecords(records: SyncRecordView[]): SyncRecordView[] {
    return [...records].sort((a, b) => {
        const aAttention = isAttention(a.status);
        const bAttention = isAttention(b.status);
        if (aAttention !== bAttention) return aAttention ? -1 : 1;
        const byTime = newestUpdatedAt(b) - newestUpdatedAt(a);
        if (byTime !== 0) return byTime;
        return a.title.localeCompare(b.title);
    });
}

export function selectableActions(records: SyncRecordView[]): { upload: RecordKey[]; download: RecordKey[]; unlink: RecordKey[]; remove: RecordKey[] } {
    const upload: RecordKey[] = [];
    const download: RecordKey[] = [];
    const unlink: RecordKey[] = [];
    const remove: RecordKey[] = [];
    for (const record of records) {
        // Upload only creates a cloud copy for unlinked records that are local-only
        // or changed locally without a conflict; a conflict must be resolved first.
        if (!record.linked && (record.status === 'local-only' || record.status === 'modified')) upload.push(record.key);
        // A record deleted on this device but still in the cloud can be brought back the same way.
        if (record.status === 'cloud-only' || (record.status === 'local-missing' && record.cloudRevision !== undefined)) download.push(record.key);
        if (record.linked) unlink.push(record.key);
        // A cloud copy exists when a revision is known; a record already deleted on
        // this device or already removed from the cloud has nothing left to remove.
        if (record.cloudRevision !== undefined && record.status !== 'local-missing' && record.status !== 'cloud-removed') remove.push(record.key);
    }
    return { upload, download, unlink, remove };
}

/** One kind's room in the cloud: copies in use, the cap, and how many new copies a selection would add. */
export interface KindQuotaView { kind: SyncKind; label: string; used: number; limit: number; remaining: number }
export interface KindQuotaPreview extends KindQuotaView { newCopies: number; usedAfter: number; over: boolean }

/** Per-kind cloud copies in use and their caps, in registry order. Empty until the server has reported a quota. */
export function quotaByKind(view: EngineView): KindQuotaView[] {
    const quota = view.quota;
    if (!quota?.kinds) return [];
    return SYNC_KINDS.flatMap((kind) => {
        const entry = quota.kinds![kind];
        return entry ? [{ kind, label: SYNC_KIND_REGISTRY[kind].plural, used: entry.used, limit: entry.limit, remaining: entry.remaining }] : [];
    });
}

export interface UploadPreview {
    count: number; newCopies: number; bytes: number; quotaUsedAfter: number; quotaLimit: number; overQuota: boolean; blockedKinds: SyncKind[];
    /** Per-kind view of the same selection (empty for servers that report one shared total). */
    kinds: KindQuotaPreview[];
    overKinds: KindQuotaPreview[];
}

export function uploadPreview(view: EngineView, keys: RecordKey[]): UploadPreview {
    const selected = view.records.filter((record) => keys.includes(record.key));
    const newCopies = selected.filter((record) => record.cloudRevision === undefined).length;
    const bytes = selected.reduce((total, record) => total + (record.bytes ?? 0), 0);
    const quotaLimit = view.quota?.limit ?? 0;
    const quotaUsedAfter = (view.quota?.used ?? 0) + newCopies;
    // Each kind has its own cap, so a selection is only over quota where one of its kinds runs out of room.
    const kinds: KindQuotaPreview[] = quotaByKind(view).map((entry) => {
        const added = selected.filter((record) => record.kind === entry.kind && record.cloudRevision === undefined).length;
        return { ...entry, newCopies: added, usedAfter: entry.used + added, over: entry.used + added > entry.limit };
    }).filter((entry) => entry.newCopies > 0);
    const overKinds = kinds.filter((entry) => entry.over);
    const overQuota = view.quota?.kinds ? overKinds.length > 0 : quotaLimit > 0 && quotaUsedAfter > quotaLimit;
    // A kind is blocked when its consent category is not granted; no consent view
    // at all means nothing is granted yet, so every selected kind is blocked.
    const blocked = new Set<SyncKind>();
    for (const record of selected) {
        if (!kindConsentGranted(view.consent, record.kind)) blocked.add(record.kind);
    }
    const blockedKinds = SYNC_KINDS.filter((kind) => blocked.has(kind));
    return { count: selected.length, newCopies, bytes, quotaUsedAfter, quotaLimit, overQuota, blockedKinds, kinds, overKinds };
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
