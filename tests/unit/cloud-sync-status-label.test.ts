import { describe, expect, it } from 'vitest';
import type { EngineView } from '../../app/utils/cloudSync/contracts';
import { describeSyncStatus, relativeTime } from '../../app/utils/cloudSync/statusLabel';
import { SYNC_KINDS } from '../../app/utils/cloudSync/kinds';
import { CONSENT } from '../helpers/cloud-sync-view';

const NOW = Date.parse('2026-11-20T12:00:00.000Z');
const minutesAgo = (min: number) => new Date(NOW - min * 60_000).toISOString();

const baseView = (overrides: Partial<EngineView> = {}): EngineView => ({
   status: 'idle',
   leader: true,
   push: 'connected',
   lastSyncAt: '2026-11-20T11:58:00.000Z',
   lastError: null,
   pendingCount: 0,
   conflictCount: 0,
   quota: null,
   consent: null,
   retentionConfigured: null,
   records: [],
   recovery: [],
   metrics: {},
   kinds: Object.fromEntries(SYNC_KINDS.map(kind => [kind, { mode: 'auto', consented: false, automatic: false }])) as EngineView['kinds'],
   ...overrides,
});

const automaticKinds = (): EngineView['kinds'] => Object.fromEntries(SYNC_KINDS.map(kind => [kind, { mode: 'auto', consented: true, automatic: true }])) as EngineView['kinds'];

const linkedRecord = {
   key: 'session:abc',
   kind: 'session',
   id: 'abc',
   title: 'Test session',
   status: 'synced',
   linked: true,
} as EngineView['records'][number];

const unlinkedRecord = { ...linkedRecord, linked: false, status: 'local-only' } as EngineView['records'][number];

describe('describeSyncStatus hidden states', () => {
   it('returns null for a null view', () => {
      expect(describeSyncStatus(null, NOW)).toBeNull();
   });

   it('returns null when sync is disabled', () => {
      expect(describeSyncStatus(baseView({ status: 'disabled' }), NOW)).toBeNull();
   });

   it('returns null when signed out', () => {
      expect(describeSyncStatus(baseView({ status: 'signed-out' }), NOW)).toBeNull();
   });
});

describe('describeSyncStatus unavailable and offline', () => {
   it('reports unavailable as neutral with cloud-off', () => {
      expect(describeSyncStatus(baseView({ status: 'unavailable' }), NOW)).toEqual({
         tone: 'neutral', icon: 'lucide:cloud-off', label: 'Cloud sync unavailable', detail: '',
      });
   });

   it('reports offline as warning with wifi-off and no detail when nothing is pending', () => {
      expect(describeSyncStatus(baseView({ status: 'offline' }), NOW)).toEqual({
         tone: 'warning', icon: 'lucide:wifi-off', label: 'Offline', detail: '',
      });
   });

   it('counts waiting changes while offline, singular and plural', () => {
      expect(describeSyncStatus(baseView({ status: 'offline', pendingCount: 1 }), NOW)?.detail).toBe('1 change waiting');
      expect(describeSyncStatus(baseView({ status: 'offline', pendingCount: 3 }), NOW)?.detail).toBe('3 changes waiting');
   });

   it('prefers offline over conflicts', () => {
      expect(describeSyncStatus(baseView({ status: 'offline', conflictCount: 2 }), NOW)?.label).toBe('Offline');
   });
});

describe('describeSyncStatus conflicts and errors', () => {
   it('counts conflicts, singular and plural', () => {
      expect(describeSyncStatus(baseView({ conflictCount: 1 }), NOW)).toEqual({
         tone: 'warning', icon: 'lucide:triangle-alert', label: '1 conflict', detail: '',
      });
      expect(describeSyncStatus(baseView({ conflictCount: 4 }), NOW)?.label).toBe('4 conflicts');
   });

   it('prefers conflicts over an error', () => {
      const view = baseView({ status: 'error', conflictCount: 1, lastError: { code: 'x', message: 'boom', at: minutesAgo(1) } });
      expect(describeSyncStatus(view, NOW)?.label).toBe('1 conflict');
   });

   it('reports an error as danger with the error message as detail', () => {
      const view = baseView({ status: 'error', lastError: { code: 'E_NET', message: 'Connection reset', at: minutesAgo(1) } });
      expect(describeSyncStatus(view, NOW)).toEqual({
         tone: 'danger', icon: 'lucide:circle-alert', label: 'Sync failed', detail: 'Connection reset',
      });
   });

   it('falls back to a generic detail when the error carries no message', () => {
      expect(describeSyncStatus(baseView({ status: 'error' }), NOW)?.detail).toBe('Unknown error');
   });
});

describe('describeSyncStatus syncing and pending', () => {
   it('reports syncing as busy with loader-circle', () => {
      expect(describeSyncStatus(baseView({ status: 'syncing' }), NOW)).toEqual({
         tone: 'busy', icon: 'lucide:loader-circle', label: 'Syncing', detail: '',
      });
   });

   it('prefers syncing over pending', () => {
      expect(describeSyncStatus(baseView({ status: 'syncing', pendingCount: 2 }), NOW)?.label).toBe('Syncing');
   });

   it('says "Syncing" with the queue size while uploads wait for the next exchange', () => {
      const queued = (count: number) => baseView({
         records: Array.from({ length: count }, (_, index) => ({ ...linkedRecord, key: `session:q${index}`, id: `q${index}`, status: 'modified' })) as EngineView['records'],
         consent: CONSENT, kinds: automaticKinds(),
      });
      expect(describeSyncStatus(queued(1), NOW)).toEqual({ tone: 'busy', icon: 'lucide:cloud-upload', label: 'Syncing', detail: '1 item queued' });
      expect(describeSyncStatus(queued(5), NOW)?.detail).toBe('5 items queued');
   });

   it('says why records wait instead of showing a resting label', () => {
      const stuck = baseView({ records: [{ ...unlinkedRecord }], consent: CONSENT, kinds: automaticKinds(), activity: 'idle' });
      expect(describeSyncStatus(stuck, NOW)).toMatchObject({ tone: 'warning', label: 'Waiting for sync', detail: expect.stringContaining('Sync now') });
      const elsewhere = baseView({ records: [{ ...unlinkedRecord }], consent: CONSENT, kinds: automaticKinds(), leader: false, leaderTab: 'other' });
      expect(describeSyncStatus(elsewhere, NOW)).toMatchObject({ tone: 'busy', label: 'Syncing in another tab' });
   });
});

describe('describeSyncStatus in your cloud and unlinked', () => {
   it('reports "In your cloud" as ok with the last sync time', () => {
      expect(describeSyncStatus(baseView({ records: [linkedRecord] }), NOW)).toEqual({
         tone: 'ok', icon: 'lucide:cloud', label: 'In your cloud', detail: 'Last synced 2 min ago',
      });
   });

   it('reports never synced when there is no last sync time', () => {
      const view = baseView({ records: [linkedRecord], lastSyncAt: null });
      expect(describeSyncStatus(view, NOW)?.detail).toBe('Last synced never');
   });

   it('reports nothing selected when no record is linked and sync is not automatic', () => {
      expect(describeSyncStatus(baseView({ records: [unlinkedRecord], consent: CONSENT }), NOW)).toEqual({
         tone: 'neutral', icon: 'lucide:cloud', label: 'Cloud sync', detail: 'Nothing selected for sync',
      });
   });

   it('reports nothing selected with no records at all', () => {
      expect(describeSyncStatus(baseView(), NOW)?.label).toBe('Cloud sync');
   });
});

describe('describeSyncStatus live updates paused', () => {
   it('appends the pause note when push is down and a record is linked', () => {
      const view = baseView({ records: [linkedRecord], push: 'down' });
      expect(describeSyncStatus(view, NOW)?.detail).toBe('Last synced 2 min ago. Live updates paused');
   });

   it('appends the pause note when push is unavailable and a record is linked', () => {
      const view = baseView({ records: [linkedRecord], push: 'unavailable' });
      expect(describeSyncStatus(view, NOW)?.detail).toContain('Live updates paused');
   });

   it('does not mention paused updates when nothing is linked', () => {
      const view = baseView({ push: 'down' });
      expect(describeSyncStatus(view, NOW)?.detail).toBe('Nothing selected for sync');
   });

   it('does not mention paused updates when push is connected', () => {
      const view = baseView({ records: [linkedRecord], push: 'connected' });
      expect(describeSyncStatus(view, NOW)?.detail).not.toContain('Live updates paused');
   });
});

describe('relativeTime', () => {
   it('returns never for null or invalid input', () => {
      expect(relativeTime(null, NOW)).toBe('never');
      expect(relativeTime('not-a-date', NOW)).toBe('never');
   });

   it('says just now within the first minute, including future times', () => {
      expect(relativeTime(minutesAgo(0), NOW)).toBe('just now');
      expect(relativeTime(new Date(NOW + 60_000).toISOString(), NOW)).toBe('just now');
   });

   it('counts minutes up to the hour', () => {
      expect(relativeTime(minutesAgo(1), NOW)).toBe('1 min ago');
      expect(relativeTime(minutesAgo(2), NOW)).toBe('2 min ago');
      expect(relativeTime(minutesAgo(59), NOW)).toBe('59 min ago');
   });

   it('counts hours up to the day', () => {
      expect(relativeTime(minutesAgo(60), NOW)).toBe('1 h ago');
      expect(relativeTime(minutesAgo(180), NOW)).toBe('3 h ago');
      expect(relativeTime(minutesAgo(23 * 60), NOW)).toBe('23 h ago');
   });

   it('renders older dates as month and day', () => {
      expect(relativeTime(minutesAgo(24 * 60), NOW)).toBe('Nov 19');
      expect(relativeTime('2026-11-18T12:00:00.000Z', NOW)).toBe('Nov 18');
   });
});
