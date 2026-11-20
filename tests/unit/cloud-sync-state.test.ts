import { describe, expect, it } from 'vitest';
import { addRecovery, appendJournal, createSyncStateStore, defaultSyncState, emptyHourMetrics, hourKey, newDeviceId, normalizeSyncState, readDeviceId, recordMetrics, summarizeMetrics, SYNC_DEVICE_KEY, SYNC_STATE_PREFIX } from '../../app/utils/cloudSync/state';
import type { JournalEntry, RecoveryEntry, SyncState } from '../../app/utils/cloudSync/contracts';

class MemoryStorage {
   private map = new Map<string, string>();
   getItem(key: string): string | null { return this.map.has(key) ? (this.map.get(key) as string) : null; }
   setItem(key: string, value: string): void { this.map.set(key, String(value)); }
   removeItem(key: string): void { this.map.delete(key); }
}

class QuotaStorage extends MemoryStorage {
   constructor(private limit: number) { super(); }
   override setItem(key: string, value: string): void {
      if (String(value).length > this.limit) throw new Error('QuotaExceededError: storage quota exceeded');
      super.setItem(key, value);
   }
}

class FakeEvents {
   private listeners = new Map<string, Set<EventListener>>();
   addEventListener(type: string, listener: EventListener): void {
      const set = this.listeners.get(type) ?? new Set<EventListener>();
      set.add(listener);
      this.listeners.set(type, set);
   }
   removeEventListener(type: string, listener: EventListener): void { this.listeners.get(type)?.delete(listener); }
   dispatch(type: string, event: unknown): void {
      const set = this.listeners.get(type);
      if (!set) return;
      for (const listener of [...set]) listener(event as Event);
   }
}

const owner = 'owner-1';
const deviceId = 'd_testdevice000000000001';
const hour = (h: number): number => Date.UTC(2026, 10, 20, h, 30, 0);
const journalEntry = (n: number): JournalEntry => ({ at: '2026-11-20T10:00:00.000Z', event: 'event-' + n, key: 'session:abc', detail: 'detail-' + n });
const recoveryEntry = (id: string): RecoveryEntry => ({ blobKey: 'blob-' + id, kind: 'session', id, title: 'Title ' + id, savedAt: '2026-11-20T10:00:00.000Z', reason: 'merge' });

function makeState(): SyncState {
   const state = defaultSyncState(owner, deviceId);
   state.links['session:abc'] = { kind: 'session', id: 'abc', baseRevision: 3, baseHash: 'hash-3', state: 'synced', lastSyncedAt: '2026-11-20T10:00:00.000Z' };
   state.remote['session:abc'] = { kind: 'session', id: 'abc', revision: 3, hash: 'hash-3', title: 'My CV', updatedAt: '2026-11-20T10:00:00.000Z', bytes: 120, checkpointCount: 1 };
   state.outbox['template:t1'] = { mutationId: 'm-1', operation: 'save', kind: 'template', id: 't1', expectedRevision: 0, queuedAt: '2026-11-20T09:00:00.000Z', attempts: 0 };
   state.journal = [journalEntry(1)];
   state.recovery = [recoveryEntry('r-1')];
   state.quota = { limit: 100, used: 10, remaining: 90, byKind: { session: 1, template: 0, profile: 0 } };
   state.metrics['2026-11-20T10'] = { ...emptyHourMetrics(), requests: 2, latencyMsTotal: 300, latencyMsMax: 200, reasons: { ok: 2 } };
   return state;
}

describe('defaultSyncState', () => {
   it('returns a fresh v1 state with empty collections', () => {
      const state = defaultSyncState(owner, deviceId);
      expect(state.v).toBe(1);
      expect(state.owner).toBe(owner);
      expect(state.deviceId).toBe(deviceId);
      expect(state.cursor).toBeNull();
      expect(state.listing).toBeNull();
      expect(state.lastSyncAt).toBeNull();
      expect(state.failures).toBe(0);
      expect(state.links).toEqual({});
      expect(state.remote).toEqual({});
      expect(state.outbox).toEqual({});
      expect(state.journal).toEqual([]);
      expect(state.recovery).toEqual([]);
      expect(state.metrics).toEqual({});
      expect(defaultSyncState(owner, deviceId)).not.toBe(state);
      expect(defaultSyncState(owner, deviceId).links).not.toBe(state.links);
   });
});

describe('round trip and owner isolation', () => {
   it('saves and loads the same state', () => {
      const storage = new MemoryStorage();
      const store = createSyncStateStore(owner, { storage });
      const state = makeState();
      store.save(state);
      expect(store.load()).toEqual(state);
   });

   it('returns a default state for a new owner and keeps owners isolated', () => {
      const storage = new MemoryStorage();
      const first = createSyncStateStore(owner, { storage });
      const second = createSyncStateStore('owner-2', { storage });
      expect(second.load()).toEqual(defaultSyncState('owner-2', second.load().deviceId));
      first.save(makeState());
      expect(second.load().links).toEqual({});
      expect(first.load().links['session:abc'].baseRevision).toBe(3);
      expect(storage.getItem(SYNC_STATE_PREFIX + owner)).not.toBeNull();
      expect(storage.getItem(SYNC_STATE_PREFIX + 'owner-2')).toBeNull();
   });

   it('re-reads storage on every load so other tabs are seen', () => {
      const storage = new MemoryStorage();
      const store = createSyncStateStore(owner, { storage });
      store.save(makeState());
      const other = createSyncStateStore(owner, { storage });
      const changed = makeState();
      changed.failures = 4;
      other.save(changed);
      expect(store.load().failures).toBe(4);
   });
});

describe('normalizeSyncState', () => {
   it('tolerates junk inputs without throwing', () => {
      for (const junk of [null, undefined, 'junk', 42, [], true, { owner: 'someone-else' }]) {
         const state = normalizeSyncState(junk, owner, deviceId);
         expect(state.owner).toBe(owner);
         expect(state.deviceId).toBe(deviceId);
         expect(state.links).toEqual({});
         expect(state.failures).toBe(0);
      }
   });

   it('fills missing fields, coerces numbers and drops bad record entries', () => {
      const normalized = normalizeSyncState({
         owner, deviceId, failures: '3', cursor: '7', backoffUntil: '100',
         links: {
            'bad-key': { kind: 'session', id: 'x', baseRevision: 1, baseHash: 'h', state: 'synced' },
            'session:x': { kind: 'template', id: 'x', baseRevision: 1, baseHash: 'h', state: 'synced' },
            'session:ok': { kind: 'session', id: 'ok', baseRevision: '2', baseHash: 'h', state: 'synced' },
         },
         remote: { 'session:gone': { kind: 'session', id: 'gone', revision: '5', hash: 'h', title: 'T', updatedAt: '2026-11-20T00:00:00.000Z', bytes: '9', checkpointCount: 0 } },
         outbox: { 'nope': { mutationId: 'm', operation: 'save', kind: 'session', id: 'z', expectedRevision: 0, queuedAt: '2026-11-20T00:00:00.000Z', attempts: 0 } },
         journal: [{ at: '2026-11-20T00:00:00.000Z', event: 'sync' }, { nope: true }],
         metrics: { 'not-an-hour': { requests: 1 }, '2026-11-20T10': { requests: '4', reasons: { ok: '2' } } },
      }, owner, deviceId);
      expect(normalized.failures).toBe(3);
      expect(normalized.cursor).toBe(7);
      expect(normalized.backoffUntil).toBe(100);
      expect(Object.keys(normalized.links)).toEqual(['session:ok']);
      expect(normalized.links['session:ok'].baseRevision).toBe(2);
      expect(normalized.remote['session:gone'].revision).toBe(5);
      expect(normalized.remote['session:gone'].bytes).toBe(9);
      expect(normalized.outbox).toEqual({});
      expect(normalized.journal).toEqual([{ at: '2026-11-20T00:00:00.000Z', event: 'sync' }]);
      expect(normalized.metrics['2026-11-20T10'].requests).toBe(4);
      expect(normalized.metrics['2026-11-20T10'].reasons).toEqual({ ok: 2 });
      expect(normalized.metrics['not-an-hour']).toBeUndefined();
   });
});

describe('corrupt JSON', () => {
   it('returns a default state and preserves the raw value once', () => {
      const storage = new MemoryStorage();
      const store = createSyncStateStore(owner, { storage });
      storage.setItem(SYNC_STATE_PREFIX + owner, '{not json');
      expect(store.load().links).toEqual({});
      expect(storage.getItem(SYNC_STATE_PREFIX + owner + ':corrupt')).toBe('{not json');
      storage.setItem(SYNC_STATE_PREFIX + owner, '{also broken');
      expect(store.load().links).toEqual({});
      expect(storage.getItem(SYNC_STATE_PREFIX + owner + ':corrupt')).toBe('{not json');
   });
});

describe('quota fallback', () => {
   it('drops the journal and keeps only the newest 6 metric buckets, then retries once', () => {
      const storage = new QuotaStorage(2500);
      const store = createSyncStateStore(owner, { storage });
      const state = makeState();
      for (let n = 0; n < 40; n += 1) state.journal.push({ ...journalEntry(n), detail: 'x'.repeat(50) });
      for (let h = 0; h < 10; h += 1) state.metrics['2026-11-2' + h + 'T10'] = { ...emptyHourMetrics(), requests: 1 };
      store.save(state);
      const loaded = store.load();
      expect(loaded.journal).toEqual([]);
      expect(Object.keys(loaded.metrics).length).toBeLessThanOrEqual(6);
      expect(loaded.links['session:abc'].baseRevision).toBe(3);
   });

   it('rethrows when even the trimmed write fails', () => {
      const storage = new QuotaStorage(10);
      const store = createSyncStateStore(owner, { storage });
      expect(() => store.save(makeState())).toThrow();
   });
});

describe('hourKey and metrics', () => {
   it('formats the UTC hour', () => {
      expect(hourKey(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02T03');
      expect(emptyHourMetrics()).toEqual({ requests: 0, noopRequests: 0, failedRequests: 0, retries: 0, bytesUp: 0, bytesDown: 0, mutationsSent: 0, changesReceived: 0, conflicts: 0, pushConnects: 0, pushMessages: 0, pushPings: 0, latencyMsTotal: 0, latencyMsMax: 0, reasons: {} });
   });

   it('buckets by hour, tracks latency and reasons', () => {
      const state = defaultSyncState(owner, deviceId);
      recordMetrics(state, hour(10), { requests: 1, latencyMs: 120, reason: 'ok' });
      recordMetrics(state, hour(10), { requests: 2, latencyMs: 80, reason: 'ok' });
      recordMetrics(state, hour(11), { requests: 1, latencyMs: 500, reason: 'slow' });
      expect(state.metrics['2026-11-20T10']).toMatchObject({ requests: 3, latencyMsTotal: 200, latencyMsMax: 120, reasons: { ok: 2 } });
      expect(state.metrics['2026-11-20T11']).toMatchObject({ requests: 1, latencyMsTotal: 500, latencyMsMax: 500, reasons: { slow: 1 } });
   });

   it('keeps only the newest 48 buckets', () => {
      const state = defaultSyncState(owner, deviceId);
      for (let h = 0; h < 50; h += 1) recordMetrics(state, Date.UTC(2026, 10, 20, 0, 0, 0) + h * 3600_000, { requests: 1 });
      const keys = Object.keys(state.metrics).sort();
      expect(keys.length).toBe(48);
      expect(keys[0]).toBe('2026-11-20T02');
      expect(keys[keys.length - 1]).toBe('2026-11-22T01');
   });

   it('summarizes only buckets in the requested range', () => {
      const state = defaultSyncState(owner, deviceId);
      recordMetrics(state, hour(10), { requests: 1, latencyMs: 100, reason: 'ok' });
      recordMetrics(state, hour(11), { requests: 2, latencyMs: 300, reason: 'ok' });
      recordMetrics(state, hour(12), { requests: 4, latencyMs: 50, reason: 'late' });
      const summary = summarizeMetrics(state, hour(10), hour(11));
      expect(summary.requests).toBe(3);
      expect(summary.latencyMsTotal).toBe(400);
      expect(summary.latencyMsMax).toBe(300);
      expect(summary.reasons).toEqual({ ok: 2 });
      expect(summarizeMetrics(state, hour(12), hour(12)).requests).toBe(4);
   });
});

describe('journal and recovery bounds', () => {
   it('keeps the newest 200 journal entries', () => {
      const state = defaultSyncState(owner, deviceId);
      for (let n = 0; n < 250; n += 1) appendJournal(state, journalEntry(n));
      expect(state.journal.length).toBe(200);
      expect(state.journal[0].event).toBe('event-50');
      expect(state.journal[199].event).toBe('event-249');
   });

   it('keeps the newest 30 recovery entries and returns the evicted ones', () => {
      const state = defaultSyncState(owner, deviceId);
      expect(addRecovery(state, recoveryEntry('r-0'))).toEqual([]);
      for (let n = 1; n < 30; n += 1) expect(addRecovery(state, recoveryEntry('r-' + n))).toEqual([]);
      expect(state.recovery.length).toBe(30);
      const evicted = addRecovery(state, recoveryEntry('r-30'));
      expect(evicted).toEqual([recoveryEntry('r-0')]);
      expect(state.recovery.length).toBe(30);
      expect(state.recovery[0].id).toBe('r-1');
      expect(state.recovery[29].id).toBe('r-30');
   });
});

describe('device id', () => {
   it('has the d_ prefix, 22 base64url chars and persists once per browser', () => {
      const id = newDeviceId();
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
      expect(id.startsWith('d_')).toBe(true);
      expect(id.length).toBe(24);
      expect(newDeviceId(() => 'a'.repeat(30))).toBe('d_' + 'a'.repeat(22));
      expect(newDeviceId(() => '0123456789abcdefghijkl')).toBe('d_0123456789abcdefghijkl');
      const storage = new MemoryStorage();
      const first = readDeviceId(storage);
      expect(readDeviceId(storage)).toBe(first);
      expect(storage.getItem(SYNC_DEVICE_KEY)).toBe(first);
   });

   it('regenerates an invalid stored device id', () => {
      const storage = new MemoryStorage();
      storage.setItem(SYNC_DEVICE_KEY, 'not valid!!');
      const id = readDeviceId(storage);
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
      expect(storage.getItem(SYNC_DEVICE_KEY)).toBe(id);
   });
});

describe('subscribe', () => {
   it('fires only for this owner key and stops after unsubscribe', () => {
      const storage = new MemoryStorage();
      const events = new FakeEvents();
      const store = createSyncStateStore(owner, { storage, events: events as unknown as Pick<EventTarget, 'addEventListener' | 'removeEventListener'> });
      let calls = 0;
      const unsubscribe = store.subscribe(() => { calls += 1; });
      events.dispatch('storage', { key: SYNC_STATE_PREFIX + 'owner-2' });
      expect(calls).toBe(0);
      events.dispatch('storage', { key: 'something-else' });
      expect(calls).toBe(0);
      events.dispatch('storage', { key: SYNC_STATE_PREFIX + owner });
      expect(calls).toBe(1);
      unsubscribe();
      events.dispatch('storage', { key: SYNC_STATE_PREFIX + owner });
      expect(calls).toBe(1);
   });
});
