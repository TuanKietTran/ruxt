import { describe, expect, it } from 'vitest';
import { historyItems, reasonText, recoveryGroups, snapshotPreview } from '../../app/utils/cloudSync/historyView';
import type { CloudHistoryDto, SyncSnapshot } from '../../app/utils/cloudSync/types';
import type { RecoveryEntry } from '../../app/utils/cloudSync/contracts';

function sessionSnapshot(markdown: string): SyncSnapshot {
    return { title: 'CV', content: JSON.stringify({ markdown }) };
}

function historyFixture(): CloudHistoryDto {
    return {
        kind: 'session',
        clientItemId: 'sess-1',
        revision: 5,
        updatedAt: '2026-11-12T10:00:00Z',
        snapshot: sessionSnapshot('# Senior CV\n\nBuilt with care\nThird line'),
        checkpoints: [
            { day: '2026-11-10', revision: 2, changedAt: '2026-11-10T10:00:00Z', snapshot: sessionSnapshot('Older draft\nSecond line') },
            { day: '2026-11-12', revision: 4, changedAt: '2026-11-12T09:00:00Z', snapshot: sessionSnapshot('Newer draft') },
            { day: '2026-11-12', revision: 3, changedAt: '2026-11-12T09:00:00Z', snapshot: sessionSnapshot('Same time draft') },
        ],
    };
}

function recoveryFixture(blobKey: string, savedAt: string, reason: RecoveryEntry['reason']): RecoveryEntry {
    return { blobKey, kind: 'session', id: 'sess-1', title: 'CV', savedAt, reason };
}

describe('snapshotPreview', () => {
    it('takes the first two non-empty lines of session markdown', () => {
        expect(snapshotPreview('session', sessionSnapshot('# Senior CV\n\nBuilt with care\nThird line'))).toBe('# Senior CV Built with care');
    });

    it('takes the first two non-empty lines of the template skeleton', () => {
        const snapshot: SyncSnapshot = { title: 'T', content: JSON.stringify({ markdownSkeleton: 'Line A\nLine B\nLine C' }) };
        expect(snapshotPreview('template', snapshot)).toBe('Line A Line B');
    });

    it('shows the profile name and headline joined with an em dash', () => {
        const snapshot: SyncSnapshot = { title: 'P', content: JSON.stringify({ profile: { identity: { fullName: 'Kyle Nguyen', headline: 'Software Engineer' } } }) };
        expect(snapshotPreview('profile', snapshot)).toBe('Kyle Nguyen \u2014 Software Engineer');
    });

    it('shows only the fields the profile actually has', () => {
        const nameOnly: SyncSnapshot = { title: 'P', content: JSON.stringify({ profile: { identity: { fullName: 'Kyle Nguyen' } } }) };
        const headlineOnly: SyncSnapshot = { title: 'P', content: JSON.stringify({ profile: { identity: { headline: 'Software Engineer' } } }) };
        expect(snapshotPreview('profile', nameOnly)).toBe('Kyle Nguyen');
        expect(snapshotPreview('profile', headlineOnly)).toBe('Software Engineer');
    });

    it('falls back to the raw content when no preview field exists', () => {
        const snapshot: SyncSnapshot = { title: 'T', content: JSON.stringify({ title: 'No preview here' }) };
        expect(snapshotPreview('session', snapshot)).toBe(JSON.stringify({ title: 'No preview here' }));
    });

    it('falls back to the raw content when the content is not JSON', () => {
        const snapshot: SyncSnapshot = { title: 'T', content: 'plain text\nsecond line\nthird line' };
        expect(snapshotPreview('session', snapshot)).toBe('plain text second line');
    });

    it('truncates a long preview to 160 characters with an ellipsis', () => {
        const preview = snapshotPreview('session', sessionSnapshot('x'.repeat(200)));
        expect(preview).toHaveLength(160);
        expect(preview.endsWith('\u2026')).toBe(true);
    });

    it('honours a custom maxChars limit', () => {
        const preview = snapshotPreview('session', sessionSnapshot('abcdefghij klmnop'), 10);
        expect(preview).toBe('abcdefghi\u2026');
    });
});

describe('historyItems', () => {
    it('puts the current cloud version first as head', () => {
        const history = historyFixture();
        const items = historyItems(history);
        expect(items[0]).toMatchObject({
            id: 'sess-1@5',
            label: 'Current cloud version',
            revision: 5,
            changedAt: '2026-11-12T10:00:00Z',
            isHead: true,
            preview: '# Senior CV Built with care',
        });
        expect(items[0].snapshot).toBe(history.snapshot);
    });

    it('orders checkpoints newest first with revision breaking same-time ties', () => {
        const items = historyItems(historyFixture());
        expect(items.map((item) => item.revision)).toEqual([5, 4, 3, 2]);
        expect(items.map((item) => item.label)).toEqual([
            'Current cloud version',
            'Saved 2026-11-12',
            'Saved 2026-11-12',
            'Saved 2026-11-10',
        ]);
        expect(items.slice(1).every((item) => item.isHead === false)).toBe(true);
        expect(items[1].id).toBe('sess-1@4');
    });

    it('returns only the head when there are no checkpoints', () => {
        const history = historyFixture();
        history.checkpoints = [];
        expect(historyItems(history)).toHaveLength(1);
    });

    it('counts bytes from the title plus the content', () => {
        const history: CloudHistoryDto = {
            kind: 'session',
            clientItemId: 'sess-1',
            revision: 1,
            updatedAt: '2026-11-12T10:00:00Z',
            snapshot: { title: 'A', content: 'BC' },
            checkpoints: [],
        };
        expect(historyItems(history)[0].bytes).toBe(3);
    });
});

describe('recoveryGroups', () => {
    it('groups by day newest first and keeps newest entries first within a day', () => {
        const groups = recoveryGroups([
            recoveryFixture('b3', '2026-11-11T18:00:00Z', 'restore'),
            recoveryFixture('b2', '2026-11-12T08:00:00Z', 'download'),
            recoveryFixture('b1', '2026-11-12T10:00:00Z', 'merge'),
        ]);
        expect(groups.map((group) => group.day)).toEqual(['2026-11-12', '2026-11-11']);
        expect(groups[0].entries.map((entry) => entry.blobKey)).toEqual(['b1', 'b2']);
        expect(groups[1].entries.map((entry) => entry.blobKey)).toEqual(['b3']);
    });

    it('returns an empty list when there are no entries', () => {
        expect(recoveryGroups([])).toEqual([]);
    });
});

describe('reasonText', () => {
    it('explains every recovery reason in plain words', () => {
        expect(reasonText('fast-forward')).toBe('Saved before the cloud version moved ahead');
        expect(reasonText('keep-cloud')).toBe('Saved before keeping the cloud version');
        expect(reasonText('merge')).toBe('Saved before merging with the cloud version');
        expect(reasonText('download')).toBe('Saved before downloading the cloud version');
        expect(reasonText('restore')).toBe('Saved before restoring a cloud version');
    });
});
