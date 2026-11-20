import { describe, expect, it } from 'vitest';
import type { EngineView, SyncRecordView } from '../../app/utils/cloudSync/contracts';
import type { ConsentViewDto, QuotaDto } from '../../app/utils/cloudSync/types';
import { filterRecords, formatBytes, selectableActions, sortRecords, statusText, uploadPreview } from '../../app/utils/cloudSync/recordsView';

function record(overrides: Partial<SyncRecordView>): SyncRecordView {
    return {
        key: 'session:a',
        kind: 'session',
        id: 'a',
        title: 'Alpha',
        status: 'synced',
        linked: true,
        localUpdatedAt: '2026-11-20T10:00:00.000Z',
        cloudUpdatedAt: '2026-11-20T10:00:00.000Z',
        cloudRevision: 3,
        baseRevision: 3,
        bytes: 100,
        checkpointCount: 1,
        ...overrides,
    };
}

function makeConsent(session: boolean, template: boolean, profile: boolean): ConsentViewDto {
    return {
        policyVersion: '1',
        retentionConfiguration: null,
        retentionAcknowledgement: { acknowledgedVersion: null, acknowledgedAt: null },
        cloudSessions: { granted: session, changedAt: null },
        cloudTemplates: { granted: template, changedAt: null },
        cloudProfiles: { granted: profile, changedAt: null },
    };
}

function makeQuota(used: number, limit: number): QuotaDto {
    return { limit, used, remaining: limit - used, byKind: { session: used, template: 0, profile: 0 } };
}

function makeView(records: SyncRecordView[], quota: QuotaDto | null, consent: ConsentViewDto | null): EngineView {
    return {
        status: 'idle',
        leader: true,
        push: 'idle',
        lastSyncAt: null,
        lastError: null,
        pendingCount: 0,
        conflictCount: 0,
        quota,
        consent,
        retentionConfigured: null,
        records,
        recovery: [],
        metrics: {},
    };
}

describe('filterRecords', () => {
    it('filters by kind', () => {
        const records = [
            record({ key: 'session:a', kind: 'session' }),
            record({ key: 'template:b', kind: 'template', id: 'b' }),
            record({ key: 'profile:c', kind: 'profile', id: 'c' }),
        ];
        expect(filterRecords(records, { kind: 'template', status: 'all' }).map((r) => r.key)).toEqual(['template:b']);
        expect(filterRecords(records, { kind: 'all', status: 'all' })).toHaveLength(3);
    });

    it('filters by exact status', () => {
        const records = [
            record({ key: 'session:a', status: 'local-only' }),
            record({ key: 'session:b', id: 'b', status: 'cloud-only' }),
            record({ key: 'session:c', id: 'c', status: 'synced' }),
        ];
        expect(filterRecords(records, { kind: 'all', status: 'local-only' }).map((r) => r.key)).toEqual(['session:a']);
        expect(filterRecords(records, { kind: 'all', status: 'cloud-only' }).map((r) => r.key)).toEqual(['session:b']);
        expect(filterRecords(records, { kind: 'all', status: 'synced' }).map((r) => r.key)).toEqual(['session:c']);
    });

    it('treats attention as modified, behind, pending, conflict, error, blocked, cloud-removed and local-missing', () => {
        const attention = ['modified', 'behind', 'pending', 'conflict', 'error', 'blocked', 'cloud-removed', 'local-missing'] as const;
        const records = [
            ...attention.map((status, i) => record({ key: 'session:' + status, id: String(i), status })),
            record({ key: 'session:synced', id: 's', status: 'synced' }),
            record({ key: 'session:local', id: 'l', status: 'local-only' }),
            record({ key: 'session:cloud', id: 'c', status: 'cloud-only' }),
        ];
        expect(filterRecords(records, { kind: 'all', status: 'attention' }).map((r) => r.status).sort()).toEqual([...attention].sort());
    });
});

describe('sortRecords', () => {
    it('puts attention first, then newest, then title', () => {
        const oldSynced = record({ key: 'session:old', id: 'old', title: 'Old', status: 'synced', localUpdatedAt: '2026-11-01T00:00:00.000Z', cloudUpdatedAt: '2026-11-01T00:00:00.000Z' });
        const newSynced = record({ key: 'session:new', id: 'new', title: 'New', status: 'synced', localUpdatedAt: '2026-11-19T00:00:00.000Z', cloudUpdatedAt: '2026-11-19T00:00:00.000Z' });
        const attention = record({ key: 'session:att', id: 'att', title: 'Attention', status: 'conflict', localUpdatedAt: '2026-11-02T00:00:00.000Z', cloudUpdatedAt: '2026-11-02T00:00:00.000Z' });
        expect(sortRecords([oldSynced, attention, newSynced]).map((r) => r.key)).toEqual(['session:att', 'session:new', 'session:old']);
    });

    it('breaks equal times by title and uses the newer of local/cloud times', () => {
        const a = record({ key: 'session:a', title: 'Beta', localUpdatedAt: '2026-11-10T00:00:00.000Z', cloudUpdatedAt: '2026-11-18T00:00:00.000Z' });
        const b = record({ key: 'session:b', id: 'b', title: 'Alpha', localUpdatedAt: '2026-11-10T00:00:00.000Z', cloudUpdatedAt: '2026-11-10T00:00:00.000Z' });
        expect(sortRecords([b, a]).map((r) => r.key)).toEqual(['session:a', 'session:b']);
        const sameTime = [
            record({ key: 'session:z', id: 'z', title: 'Zulu' }),
            record({ key: 'session:y', id: 'y', title: 'Alpha' }),
        ];
        expect(sortRecords(sameTime).map((r) => r.key)).toEqual(['session:y', 'session:z']);
    });
});

describe('selectableActions', () => {
    it('uploads unlinked local-only or modified records, never conflicts', () => {
        const records = [
            record({ key: 'session:local', status: 'local-only', linked: false, cloudRevision: undefined }),
            record({ key: 'session:mod', id: 'mod', status: 'modified', linked: false, cloudRevision: 2 }),
            record({ key: 'session:conf', id: 'conf', status: 'conflict', linked: false, cloudRevision: 2 }),
            record({ key: 'session:linked', id: 'linked', status: 'local-only', linked: true, cloudRevision: undefined }),
        ];
        expect(selectableActions(records).upload).toEqual(['session:local', 'session:mod']);
    });

    it('downloads cloud-only only, unlinks linked records, and removes only existing cloud copies', () => {
        const records = [
            record({ key: 'session:cloud', status: 'cloud-only', linked: false, cloudRevision: 1 }),
            record({ key: 'session:synced', id: 'synced', status: 'synced', linked: true, cloudRevision: 2 }),
            record({ key: 'session:missing', id: 'missing', status: 'local-missing', linked: true, cloudRevision: 2 }),
            record({ key: 'session:removed', id: 'removed', status: 'cloud-removed', linked: true, cloudRevision: 2 }),
            record({ key: 'session:local', id: 'local', status: 'local-only', linked: false, cloudRevision: undefined }),
        ];
        const actions = selectableActions(records);
        expect(actions.download).toEqual(['session:cloud']);
        expect(actions.unlink).toEqual(['session:synced', 'session:missing', 'session:removed']);
        expect(actions.remove).toEqual(['session:cloud', 'session:synced']);
    });
});

describe('uploadPreview', () => {
    it('counts records, new copies and bytes, and adds new copies to quota used', () => {
        const records = [
            record({ key: 'session:local', status: 'local-only', linked: false, cloudRevision: undefined, bytes: 2048 }),
            record({ key: 'template:synced', kind: 'template', id: 'synced', status: 'synced', linked: true, cloudRevision: 5, bytes: 512 }),
        ];
        const preview = uploadPreview(makeView(records, makeQuota(8, 10), makeConsent(true, true, true)), ['session:local', 'template:synced']);
        expect(preview).toEqual({ count: 2, newCopies: 1, bytes: 2560, quotaUsedAfter: 9, quotaLimit: 10, overQuota: false, blockedKinds: [] });
    });

    it('flags over-quota uploads', () => {
        const records = [record({ key: 'session:local', status: 'local-only', linked: false, cloudRevision: undefined })];
        const preview = uploadPreview(makeView(records, makeQuota(10, 10), makeConsent(true, true, true)), ['session:local']);
        expect(preview.quotaUsedAfter).toBe(11);
        expect(preview.overQuota).toBe(true);
    });

    it('blocks kinds whose consent category is not granted, and all kinds when there is no consent view', () => {
        const records = [
            record({ key: 'session:a', status: 'local-only', linked: false, cloudRevision: undefined }),
            record({ key: 'template:b', kind: 'template', id: 'b', status: 'local-only', linked: false, cloudRevision: undefined }),
        ];
        const partial = uploadPreview(makeView(records, makeQuota(0, 10), makeConsent(false, true, true)), ['session:a', 'template:b']);
        expect(partial.blockedKinds).toEqual(['session']);
        const none = uploadPreview(makeView(records, makeQuota(0, 10), null), ['session:a', 'template:b']);
        expect(none.blockedKinds).toEqual(['session', 'template']);
    });
});

describe('statusText', () => {
    it('has a short human text for every status', () => {
        const cases = [
            ['local-only', 'Only on this device'],
            ['cloud-only', 'Only in the cloud'],
            ['synced', 'Synced'],
            ['modified', 'Changed here'],
            ['behind', 'Cloud is newer'],
            ['pending', 'Uploading'],
            ['conflict', 'Conflict'],
            ['error', 'Error'],
            ['blocked', 'Blocked'],
            ['cloud-removed', 'Removed from cloud'],
            ['local-missing', 'Deleted on this device'],
        ] as const;
        for (const [status, text] of cases) expect(statusText(status)).toBe(text);
    });
});

describe('formatBytes', () => {
    it('formats bytes, KB, MB and GB with one decimal', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(-5)).toBe('0 B');
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1024)).toBe('1.0 KB');
        expect(formatBytes(12698)).toBe('12.4 KB');
        expect(formatBytes(1258291)).toBe('1.2 MB');
        expect(formatBytes(2147483648)).toBe('2.0 GB');
    });
});
