/**
 * Pure view logic for the Records view of the sync workspace.
 * No DOM, no network, no engine calls: the component feeds it an EngineView
 * and renders what these helpers return, so every rule here is unit-testable.
 */
import type { EngineView, RecordKey, RecordStatus, SyncRecordView } from './contracts';
import { CONSENT_CATEGORY, SYNC_KINDS, type SyncKind } from './types';

export type RecordFilter = { kind: SyncKind | 'all'; status: 'all' | 'local-only' | 'cloud-only' | 'synced' | 'attention' };

/** Statuses that need the user to look at the record before anything else. */
export const ATTENTION_STATUSES: readonly RecordStatus[] = [
    'modified',
    'behind',
    'pending',
    'conflict',
    'error',
    'blocked',
    'cloud-removed',
    'local-missing',
];

function isAttention(status: RecordStatus): boolean {
    return ATTENTION_STATUSES.includes(status);
}

export function filterRecords(records: SyncRecordView[], filter: RecordFilter): SyncRecordView[] {
    return records.filter((record) => {
        if (filter.kind !== 'all' && record.kind !== filter.kind) return false;
        if (filter.status === 'all') return true;
        if (filter.status === 'attention') return isAttention(record.status);
        return record.status === filter.status;
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
        if (record.status === 'cloud-only') download.push(record.key);
        if (record.linked) unlink.push(record.key);
        // A cloud copy exists when a revision is known; a record already deleted on
        // this device or already removed from the cloud has nothing left to remove.
        if (record.cloudRevision !== undefined && record.status !== 'local-missing' && record.status !== 'cloud-removed') remove.push(record.key);
    }
    return { upload, download, unlink, remove };
}

export interface UploadPreview { count: number; newCopies: number; bytes: number; quotaUsedAfter: number; quotaLimit: number; overQuota: boolean; blockedKinds: SyncKind[]; }

export function uploadPreview(view: EngineView, keys: RecordKey[]): UploadPreview {
    const selected = view.records.filter((record) => keys.includes(record.key));
    const newCopies = selected.filter((record) => record.cloudRevision === undefined).length;
    const bytes = selected.reduce((total, record) => total + (record.bytes ?? 0), 0);
    const quotaLimit = view.quota?.limit ?? 0;
    const quotaUsedAfter = (view.quota?.used ?? 0) + newCopies;
    const overQuota = quotaLimit > 0 && quotaUsedAfter > quotaLimit;
    // A kind is blocked when its consent category is not granted; no consent view
    // at all means nothing is granted yet, so every selected kind is blocked.
    const blocked = new Set<SyncKind>();
    for (const record of selected) {
        const category = CONSENT_CATEGORY[record.kind];
        if (!view.consent || !view.consent[category].granted) blocked.add(record.kind);
    }
    const blockedKinds = SYNC_KINDS.filter((kind) => blocked.has(kind));
    return { count: selected.length, newCopies, bytes, quotaUsedAfter, quotaLimit, overQuota, blockedKinds };
}

const STATUS_TEXT: Record<RecordStatus, string> = {
    'local-only': 'Only on this device',
    'cloud-only': 'Only in the cloud',
    synced: 'Synced',
    modified: 'Changed here',
    behind: 'Cloud is newer',
    pending: 'Uploading',
    conflict: 'Conflict',
    error: 'Error',
    blocked: 'Blocked',
    'cloud-removed': 'Removed from cloud',
    'local-missing': 'Deleted on this device',
};

export function statusText(status: RecordStatus): string {
    return STATUS_TEXT[status];
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
