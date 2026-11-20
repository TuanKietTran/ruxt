import type { SyncCoordinator } from './contracts';

export interface LockManagerLike {
   request<T>(name: string, options: { mode?: 'exclusive' | 'shared'; ifAvailable?: boolean; signal?: AbortSignal }, callback: (lock: unknown) => Promise<T> | T): Promise<T>;
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
   const leaderName = `ruxt-cloud-sync-leader:${owner}`;
   const netName = `ruxt-cloud-sync-net:${owner}`;
   const channelName = `ruxt-cloud-sync:${owner}`;
   let leader = false;
   let disposed = false;
   let releaseLeader: (() => void) | null = null;
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

   if (locks) {
      // Held until dispose: the callback only resolves once releaseLeader runs.
      const held = new Promise<void>((resolve) => { releaseLeader = resolve; });
      try {
         const request = locks.request(leaderName, { mode: 'exclusive', signal: abort.signal }, async () => {
            if (disposed) return;
            setLeader(true);
            await held;
            setLeader(false);
         });
         // An abort on dispose rejects the pending request; the tab simply stays non-leader.
         request.catch(() => undefined);
      } catch {
         // Lock request failed synchronously; the tab stays non-leader.
      }
   } else {
      leader = true;
   }

   async function withNetworkLock<T>(task: () => Promise<T>): Promise<T> {
      if (locks) return locks.request(netName, { mode: 'exclusive' }, () => task());
      const result = netChain.then(() => task());
      // Failures must not break the chain for later tasks.
      netChain = result.then(() => undefined, () => undefined);
      return result;
   }

   function dispose(): void {
      if (disposed) return;
      disposed = true;
      leader = false;
      abort.abort();
      if (releaseLeader) releaseLeader();
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
