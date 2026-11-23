import type { SyncCoordinator } from './contracts';

export interface LockManagerLike {
   request<T>(name: string, options: { mode?: 'exclusive' | 'shared'; ifAvailable?: boolean; signal?: AbortSignal; steal?: boolean }, callback: (lock: unknown) => Promise<T> | T): Promise<T>;
}

export interface BroadcastChannelLike {
   postMessage(message: unknown): void;
   addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
   removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
   close(): void;
}

function defaultLocks(): LockManagerLike | null {
   const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator;
   return nav?.locks ?? null;
}

function defaultCreateChannel(): ((name: string) => BroadcastChannelLike) | null {
   const ctor = (globalThis as { BroadcastChannel?: new (name: string) => BroadcastChannelLike }).BroadcastChannel;
   if (!ctor) return null;
   return (name: string) => new ctor(name);
}

/** Name of the exclusive Web Lock the leader tab of `owner` holds. */
export const leaderLockName = (owner: string): string => `ruxt-cloud-sync-leader:${owner}`;

/**
 * Cross-tab coordination: only one tab per owner holds leadership (timers and the push
 * socket) and only one sync request per owner is in flight across tabs.
 * Without a LockManager the tab is leader immediately and the network lock is an
 * in-memory promise chain; without BroadcastChannel, broadcast is a no-op.
 */
export function createSyncCoordinator(owner: string, deps?: {
   locks?: LockManagerLike | null;
   createChannel?: ((name: string) => BroadcastChannelLike) | null;
}): SyncCoordinator {
   const locks = deps?.locks !== undefined ? deps.locks : defaultLocks();
   const createChannel = deps?.createChannel !== undefined ? deps.createChannel : defaultCreateChannel();
   const leaderName = leaderLockName(owner);
   const netName = `ruxt-cloud-sync-net:${owner}`;
   const channelName = `ruxt-cloud-sync:${owner}`;
   let leader = false;
   let disposed = false;
   let stealing = false;
   // Every lock request of this tab that may hold leadership (the first one, and a takeover), by its release.
   const releases = new Set<() => void>();
   let holding = 0;
   const abort = new AbortController();
   const leadershipListeners = new Set<(value: boolean) => void>();
   const messageListeners = new Set<(message: { type: string; [key: string]: unknown }) => void>();
   let netChain: Promise<unknown> = Promise.resolve();
   const channel = createChannel ? createChannel(channelName) : null;

   function setLeader(value: boolean): void {
      if (leader === value || disposed) return;
      leader = value;
      for (const listener of [...leadershipListeners]) listener(value);
   }

   function onChannelMessage(event: { data: unknown }): void {
      if (disposed) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const message = data as { type?: unknown; [key: string]: unknown };
      if (typeof message.type !== 'string') return;
      for (const listener of [...messageListeners]) listener(message as { type: string; [key: string]: unknown });
   }

   if (channel) channel.addEventListener('message', onChannelMessage);

   /**
    * Ask for the leader lock: queued behind the current leader, or (steal) taking it from a leader that is gone
    * quiet. A request that held the lock and then rejected was stolen from; the tab then queues again so it can
    * lead once the thief closes.
    */
   function requestLeadership(steal: boolean): void {
      if (!locks || disposed) return;
      let release: () => void = () => undefined;
      const held = new Promise<void>((resolve) => { release = resolve; });
      releases.add(release);
      let holds = false;
      const drop = (): void => {
         releases.delete(release);
         if (steal) stealing = false;
         if (!holds) return;
         holds = false;
         holding -= 1;
         if (holding === 0) setLeader(false);
      };
      try {
         const options = steal ? { mode: 'exclusive' as const, steal: true } : { mode: 'exclusive' as const, signal: abort.signal };
         // Held until dispose: the callback only resolves once its release runs.
         const request = locks.request(leaderName, options, async () => {
            if (disposed) return;
            holds = true;
            holding += 1;
            setLeader(true);
            await held;
            drop();
         });
         request.then(drop, () => {
            // Aborted while waiting (dispose), or the lock was stolen from this tab.
            const wasHolding = holds;
            drop();
            if (wasHolding && !disposed) requestLeadership(false);
         });
      } catch {
         // Lock request failed synchronously; the tab stays non-leader.
         releases.delete(release);
      }
   }

   if (locks) requestLeadership(false);
   else leader = true;

   async function withNetworkLock<T>(task: () => Promise<T>): Promise<T> {
      if (locks) return locks.request(netName, { mode: 'exclusive' }, () => task());
      const result = netChain.then(() => task());
      // Failures must not break the chain for later tasks.
      netChain = result.then(() => undefined, () => undefined);
      return result;
   }

   function takeOver(): void {
      if (!locks || leader || stealing || disposed) return;
      stealing = true;
      requestLeadership(true);
   }

   function dispose(): void {
      if (disposed) return;
      disposed = true;
      leader = false;
      abort.abort();
      for (const release of [...releases]) release();
      if (channel) channel.close();
      leadershipListeners.clear();
      messageListeners.clear();
   }

   return {
      get isLeader() { return leader; },
      onLeadership(listener: (value: boolean) => void): () => void {
         leadershipListeners.add(listener);
         return () => { leadershipListeners.delete(listener); };
      },
      withNetworkLock,
      takeOver,
      broadcast(message: { type: string; [key: string]: unknown }): void {
         if (disposed || !channel) return;
         channel.postMessage(message);
      },
      onMessage(listener: (message: { type: string; [key: string]: unknown }) => void): () => void {
         messageListeners.add(listener);
         return () => { messageListeners.delete(listener); };
      },
      dispose,
   };
}
