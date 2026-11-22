import { describe, expect, it } from 'vitest';
import { createSyncCoordinator } from '../../app/utils/cloudSync/coordinator';
import type { BroadcastChannelLike, LockManagerLike } from '../../app/utils/cloudSync/coordinator';

function makeAbortError(): Error {
   const error = new Error('Aborted');
   error.name = 'AbortError';
   return error;
}

type Queued = { start: () => void; cancel: () => void };

/** FIFO exclusive lock manager across instances, with signal aborts for waiting requests. */
class FakeLockManager implements LockManagerLike {
   private held = new Set<string>();
   private queues = new Map<string, Queued[]>();

   request<T>(name: string, options: { mode?: 'exclusive' | 'shared'; ifAvailable?: boolean; signal?: AbortSignal }, callback: (lock: unknown) => Promise<T> | T): Promise<T> {
      return new Promise<T>((resolve, reject) => {
         if (options.signal?.aborted) { reject(makeAbortError()); return; }
         const queue = this.queueFor(name);
         let settled = false;
         const entry: Queued = {
            start: () => {
               this.held.add(name);
               Promise.resolve()
                  .then(() => callback(undefined))
                  .then((value) => { if (settled) return; settled = true; this.held.delete(name); resolve(value); this.pump(name); },
                     (error) => { if (settled) return; settled = true; this.held.delete(name); reject(error); this.pump(name); });
            },
            cancel: () => {
               // Only a waiting request can be aborted; a held lock is unaffected.
               const index = queue.indexOf(entry);
               if (index < 0 || settled) return;
               settled = true;
               queue.splice(index, 1);
               reject(makeAbortError());
            },
         };
         if (options.signal) options.signal.addEventListener('abort', entry.cancel, { once: true });
         queue.push(entry);
         this.pump(name);
      });
   }

   private queueFor(name: string): Queued[] {
      let queue = this.queues.get(name);
      if (!queue) { queue = []; this.queues.set(name, queue); }
      return queue;
   }

   private pump(name: string): void {
      if (this.held.has(name)) return;
      const next = this.queues.get(name)?.shift();
      if (next) next.start();
   }
}

class FakeChannel implements BroadcastChannelLike {
   closed = false;
   private listeners = new Set<(event: { data: unknown }) => void>();

   constructor(private hub: FakeChannelHub) {}

   postMessage(message: unknown): void {
      if (!this.closed) this.hub.deliver(this, message);
   }

   addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void {
      this.listeners.add(listener);
   }

   removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void {
      this.listeners.delete(listener);
   }

   close(): void {
      this.closed = true;
      this.hub.remove(this);
   }

   receive(message: unknown): void {
      for (const listener of [...this.listeners]) listener({ data: message });
   }
}

class FakeChannelHub {
   readonly names: string[] = [];
   private channels = new Set<FakeChannel>();

   create(name: string): BroadcastChannelLike {
      this.names.push(name);
      const channel = new FakeChannel(this);
      this.channels.add(channel);
      return channel;
   }

   deliver(sender: FakeChannel, message: unknown): void {
      for (const channel of [...this.channels]) {
         if (channel === sender || channel.closed) continue;
         channel.receive(message);
      }
   }

   remove(channel: FakeChannel): void {
      this.channels.delete(channel);
   }
}

const tick = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };

async function waitFor(check: () => boolean): Promise<void> {
   for (let i = 0; i < 100; i++) {
      if (check()) return;
      await tick();
   }
   throw new Error('timed out waiting for condition');
}

function deferred<T>() {
   let resolve!: (value: T) => void;
   let reject!: (error: unknown) => void;
   const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
   return { promise, resolve, reject };
}

function setup(owner = 'owner-1') {
   const locks = new FakeLockManager();
   const hub = new FakeChannelHub();
   const channels: BroadcastChannelLike[] = [];
   const createChannel = (name: string) => { const channel = hub.create(name); channels.push(channel); return channel; };
   const make = () => createSyncCoordinator(owner, { locks, createChannel });
   return { locks, hub, channels, make };
}

describe('SyncCoordinator leadership', () => {
   it('first tab becomes leader, second waits', async () => {
      const { make } = setup();
      const first = make();
      const second = make();
      await waitFor(() => first.isLeader);
      expect(first.isLeader).toBe(true);
      expect(second.isLeader).toBe(false);
      await tick();
      expect(second.isLeader).toBe(false);
      first.dispose();
      second.dispose();
   });

   it('disposing the leader promotes the next tab and notifies only on change', async () => {
      const { make } = setup();
      const first = make();
      const second = make();
      await waitFor(() => first.isLeader);
      const firstEvents: boolean[] = [];
      const secondEvents: boolean[] = [];
      first.onLeadership((value) => { firstEvents.push(value); });
      second.onLeadership((value) => { secondEvents.push(value); });
      first.dispose();
      await waitFor(() => second.isLeader);
      expect(second.isLeader).toBe(true);
      expect(first.isLeader).toBe(false);
      expect(secondEvents).toEqual([true]);
      expect(firstEvents).toEqual([]);
      second.dispose();
   });

   it('onLeadership unsubscribe stops notifications', async () => {
      const { make } = setup();
      const first = make();
      const second = make();
      await waitFor(() => first.isLeader);
      const events: boolean[] = [];
      const unsubscribe = second.onLeadership((value) => { events.push(value); });
      unsubscribe();
      first.dispose();
      await waitFor(() => second.isLeader);
      expect(events).toEqual([]);
      second.dispose();
   });

   it('abort of a pending leadership request on dispose swallows the rejection', async () => {
      const { make } = setup();
      const first = make();
      const second = make();
      await waitFor(() => first.isLeader);
      second.dispose();
      await tick();
      await tick();
      expect(second.isLeader).toBe(false);
      expect(first.isLeader).toBe(true);
      first.dispose();
      await tick();
      const third = make();
      await waitFor(() => third.isLeader);
      expect(third.isLeader).toBe(true);
      third.dispose();
   });
});

describe('SyncCoordinator network lock', () => {
   it('mutual exclusion and ordering across tabs', async () => {
      const { make } = setup();
      const first = make();
      const second = make();
      const gate = deferred<void>();
      const order: string[] = [];
      const firstTask = first.withNetworkLock(async () => { order.push('first-start'); await gate.promise; order.push('first-end'); return 'first'; });
      const secondTask = second.withNetworkLock(async () => { order.push('second-start'); return 'second'; });
      await waitFor(() => order.includes('first-start'));
      await tick();
      await tick();
      expect(order).toEqual(['first-start']);
      gate.resolve();
      await expect(firstTask).resolves.toBe('first');
      await expect(secondTask).resolves.toBe('second');
      expect(order).toEqual(['first-start', 'first-end', 'second-start']);
      first.dispose();
      second.dispose();
   });

   it('releases after a throwing task', async () => {
      const { make } = setup();
      const first = make();
      const second = make();
      await expect(first.withNetworkLock(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
      await expect(second.withNetworkLock(async () => 'ok')).resolves.toBe('ok');
      first.dispose();
      second.dispose();
   });

   it('no-locks fallback is leader immediately and serializes tasks in memory', async () => {
      const coordinator = createSyncCoordinator('owner-2', { locks: null, createChannel: null });
      expect(coordinator.isLeader).toBe(true);
      expect(() => coordinator.broadcast({ type: 'state' })).not.toThrow();
      const gate = deferred<void>();
      const order: string[] = [];
      const firstTask = coordinator.withNetworkLock(async () => { order.push('first-start'); await gate.promise; order.push('first-end'); return 'first'; });
      const secondTask = coordinator.withNetworkLock(async () => { order.push('second-start'); return 'second'; });
      await waitFor(() => order.includes('first-start'));
      await tick();
      expect(order).toEqual(['first-start']);
      gate.resolve();
      await expect(firstTask).resolves.toBe('first');
      await expect(secondTask).resolves.toBe('second');
      await expect(coordinator.withNetworkLock(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
      await expect(coordinator.withNetworkLock(async () => 'after-failure')).resolves.toBe('after-failure');
      coordinator.dispose();
   });
});

describe('SyncCoordinator messages', () => {
   it('broadcast delivery between instances, not to self, on the per-owner channel', async () => {
      const { hub, make } = setup();
      const first = make();
      const second = make();
      expect(hub.names).toEqual(['ruxt-cloud-sync:owner-1', 'ruxt-cloud-sync:owner-1']);
      const firstMessages: unknown[] = [];
      const secondMessages: unknown[] = [];
      first.onMessage((message) => { firstMessages.push(message); });
      second.onMessage((message) => { secondMessages.push(message); });
      first.broadcast({ type: 'state', revision: 1 });
      expect(secondMessages).toEqual([{ type: 'state', revision: 1 }]);
      expect(firstMessages).toEqual([]);
      second.broadcast({ type: 'flush-request' });
      expect(firstMessages).toEqual([{ type: 'flush-request' }]);
      expect(secondMessages).toEqual([{ type: 'state', revision: 1 }]);
      first.dispose();
      second.dispose();
   });

   it('ignores messages without a string type', async () => {
      const { channels, make } = setup();
      const first = make();
      const second = make();
      const received: unknown[] = [];
      second.onMessage((message) => { received.push(message); });
      channels[0].postMessage({ nope: true });
      channels[0].postMessage('plain string');
      channels[0].postMessage(null);
      channels[0].postMessage({ type: 'state' });
      expect(received).toEqual([{ type: 'state' }]);
      first.dispose();
      second.dispose();
   });

   it('dispose is idempotent and stops delivery', async () => {
      const { make } = setup();
      const first = make();
      const second = make();
      await waitFor(() => first.isLeader);
      const firstMessages: unknown[] = [];
      const secondMessages: unknown[] = [];
      first.onMessage((message) => { firstMessages.push(message); });
      second.onMessage((message) => { secondMessages.push(message); });
      first.dispose();
      first.dispose();
      expect(first.isLeader).toBe(false);
      second.broadcast({ type: 'ping' });
      expect(firstMessages).toEqual([]);
      first.broadcast({ type: 'ping-back' });
      expect(secondMessages).toEqual([]);
      second.dispose();
   });
});
