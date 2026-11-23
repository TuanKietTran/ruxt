import { describe, expect, it } from 'vitest';
import type { EngineView, SyncRecordView } from '../../app/utils/cloudSync/contracts';
import type { ConsentViewDto, QuotaDto } from '../../app/utils/cloudSync/types';
import { filterRecords, formatBytes, quotaByKind, selectableActions, sortRecords, uploadPreview } from '../../app/utils/cloudSync/recordsView';
import { presentRecord } from '../../app/utils/cloudSync/syncPresentation';
import { CONSENT } from '../helpers/cloud-sync-view';
import { SYNC_KINDS } from '../../app/utils/cloudSync/kinds';

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
        kinds: Object.fromEntries(SYNC_KINDS.map((kind) => [kind, { mode: 'auto', consented: true, automatic: false }])) as EngineView['kinds'],
    };
}

/** A quota from a server with per-kind caps: each kind has its own limit and used count. */
function makeKindQuota(used: Partial<Record<'session' | 'template' | 'profile', number>>, limits: Partial<Record<'session' | 'template' | 'profile', number>> = {}): QuotaDto {
    const kinds: NonNullable<QuotaDto['kinds']> = {};
    let limit = 0;
    let total = 0;
    for (const kind of ['session', 'template', 'profile'] as const) {
        const cap = limits[kind] ?? 20;
        const count = used[kind] ?? 0;
        kinds[kind] = { limit: cap, used: count, remaining: Math.max(0, cap - count) };
        limit += cap;
        total += count;
    }
    return { limit, used: total, remaining: limit - total, byKind: { session: used.session ?? 0, template: used.template ?? 0, profile: used.profile ?? 0 }, kinds };
}

describe('filterRecords', () => {
    const viewOf = (records: SyncRecordView[], automatic = false): EngineView => ({
        ...makeView(records, null, CONSENT),
        kinds: Object.fromEntries(SYNC_KINDS.map((kind) => [kind, { mode: automatic ? 'auto' : 'selected', consented: true, automatic }])) as EngineView['kinds'],
    });
    const keys = (view: EngineView, filter: Parameters<typeof filterRecords>[2]) => filterRecords(view, view.records, filter).map((r) => r.key);

    it('filters by kind', () => {
        const view = viewOf([
            record({ key: 'session:a', kind: 'session' }),
            record({ key: 'template:b', kind: 'template', id: 'b' }),
            record({ key: 'profile:c', kind: 'profile', id: 'c' }),
        ]);
        expect(keys(view, { kind: 'template', status: 'all' })).toEqual(['template:b']);
        expect(keys(view, { kind: 'all', status: 'all' })).toHaveLength(3);
    });

    it('filters by what each record shows, where sync is not responsible for the records', () => {
        const view = viewOf([
            record({ key: 'session:a', status: 'local-only' }),
            record({ key: 'session:b', id: 'b', status: 'cloud-only' }),
            record({ key: 'session:c', id: 'c', status: 'synced' }),
        ]);
        expect(keys(view, { kind: 'all', status: 'device' })).toEqual(['session:a']);
        expect(keys(view, { kind: 'all', status: 'cloud-only' })).toEqual(['session:b']);
        expect(keys(view, { kind: 'all', status: 'cloud' })).toEqual(['session:c']);
    });

    it('on an automatic kind the passing states are "syncing", not device-only or cloud-only', () => {
        const view = viewOf([
            record({ key: 'session:a', status: 'local-only', linked: false }),
            record({ key: 'session:b', id: 'b', status: 'cloud-only', linked: false }),
            record({ key: 'session:c', id: 'c', status: 'synced' }),
        ], true);
        expect(keys(view, { kind: 'all', status: 'device' })).toEqual([]);
        expect(keys(view, { kind: 'all', status: 'cloud-only' })).toEqual([]);
        expect(keys(view, { kind: 'all', status: 'syncing' })).toEqual(['session:a', 'session:b']);
    });

    it('treats attention as the exceptions: conflict, error, blocked, over limit, removed from cloud and deleted here', () => {
        const attention = ['conflict', 'error', 'blocked', 'over-limit', 'cloud-removed', 'local-missing'] as const;
        const moving = ['modified', 'behind', 'pending'] as const;
        const view = viewOf([
            ...attention.map((status, i) => record({ key: 'session:' + status, id: String(i), status })),
            ...moving.map((status, i) => record({ key: 'session:' + status, id: 'm' + i, status })),
            record({ key: 'session:synced', id: 's', status: 'synced' }),
        ]);
        expect(filterRecords(view, view.records, { kind: 'all', status: 'attention' }).map((r) => r.status).sort()).toEqual([...attention].sort());
        expect(filterRecords(view, view.records, { kind: 'all', status: 'syncing' }).map((r) => r.status).sort()).toEqual([...moving].sort());
        expect(presentRecord(view, view.records[0]!).phase).toBe('attention');
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
        // A record deleted on this device but still in the cloud can be brought back the same way.
        expect(actions.download).toEqual(['session:cloud', 'session:missing']);
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
        expect(preview).toEqual({ count: 2, newCopies: 1, bytes: 2560, quotaUsedAfter: 9, quotaLimit: 10, overQuota: false, blockedKinds: [], kinds: [], overKinds: [] });
    });

    it('judges each kind against its own cap, so a full kind does not block another', () => {
        const local = (kind: 'session' | 'template' | 'profile', id: string) =>
            record({ key: `${kind}:${id}`, kind, id, status: 'local-only', linked: false, cloudRevision: undefined });
        const records = [local('session', 's1'), local('session', 's2'), local('profile', 'p1')];
        const view = makeView(records, makeKindQuota({ session: 19, profile: 1 }, { profile: 20 }), makeConsent(true, true, true));
        const preview = uploadPreview(view, records.map((entry) => entry.key));
        expect(preview.overQuota).toBe(true);
        expect(preview.overKinds.map((entry) => [entry.kind, entry.usedAfter, entry.limit])).toEqual([['session', 21, 20]]);
        expect(preview.kinds.find((entry) => entry.kind === 'profile')).toMatchObject({ newCopies: 1, usedAfter: 2, over: false });
        // Profiles alone fit, even though the account total (19 + 1 + 1) is far from any single shared pool of ten.
        expect(uploadPreview(view, ['profile:p1']).overQuota).toBe(false);
    });

    it('lets a mixed set of nineteen records upload under the default caps', () => {
        const records = [
            ...Array.from({ length: 7 }, (_, index) => record({ key: `session:s${index}`, id: `s${index}`, status: 'local-only', linked: false, cloudRevision: undefined })),
            ...Array.from({ length: 6 }, (_, index) => record({ key: `template:t${index}`, kind: 'template', id: `t${index}`, status: 'local-only', linked: false, cloudRevision: undefined })),
            ...Array.from({ length: 6 }, (_, index) => record({ key: `profile:p${index}`, kind: 'profile', id: `p${index}`, status: 'local-only', linked: false, cloudRevision: undefined })),
        ];
        const preview = uploadPreview(makeView(records, makeKindQuota({}), makeConsent(true, true, true)), records.map((entry) => entry.key));
        expect(preview).toMatchObject({ count: 19, newCopies: 19, overQuota: false, overKinds: [] });
    });

    it('lists per-kind copies in use and caps in registry order, and nothing from a server without per-kind caps', () => {
        const view = makeView([], makeKindQuota({ session: 3, template: 1 }, { template: 5 }), null);
        expect(quotaByKind(view).map((entry) => [entry.kind, entry.used, entry.limit, entry.remaining])).toEqual([['session', 3, 20, 17], ['template', 1, 5, 4], ['profile', 0, 20, 20]]);
        expect(quotaByKind(makeView([], makeQuota(3, 10), null))).toEqual([]);
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
