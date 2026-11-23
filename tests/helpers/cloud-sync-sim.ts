/**
 * In-process simulation of the whole cloud-sync loop for engine tests and request-budget measurements:
 * the real client engine, record adapters, state store, coordinator and push channel run against the
 * real private-core sync handler (with an atomic in-memory repository) under a simulated clock.
 * HTTP requests, push messages and pings are counted per owner and device.
 */
import { createSyncCloudCopiesHandler } from "@ruxt/core/handlers/sync-cloud-copies";
import { createGetCloudCopyHandler } from "@ruxt/core/handlers/get-cloud-copy";
import { cloudCopyQuota, emptyCloudCopyState } from "@ruxt/core/domain/cloud-copy";
import type { CloudCopyKind, CloudCopyOwnerState, CloudCopyTransition } from "@ruxt/core/domain/cloud-copy";
import { selectRetainedCloudCheckpoints } from "@ruxt/core/domain/cloud-data/retention";
import type { CloudCopySyncRepository } from "@ruxt/core/repos/cloud-copy.repo";
import { CloudSyncEngine, type EngineClock } from "../../app/utils/cloudSync/engine";
import { createMemoryBlobStore } from "../../app/utils/cloudSync/blobs";
import { ownerFingerprint } from "../../app/utils/cloudSync/hash";
import { createRecordAdapters } from "../../app/utils/cloudSync/kinds";
import { createSyncStateStore } from "../../app/utils/cloudSync/state";
import { createSyncCoordinator, leaderLockName, type LockManagerLike, type BroadcastChannelLike } from "../../app/utils/cloudSync/coordinator";
import { createPushChannel, type WebSocketLike } from "../../app/utils/cloudSync/push";
import { SyncHttpError, type SyncRequestDto, type SyncResponseDto, type ConsentViewDto } from "../../app/utils/cloudSync/types";

// ------------------------------------------------------------------------------------------------
// Simulated time
// ------------------------------------------------------------------------------------------------

export class SimClock implements EngineClock {
   time = Date.parse("2026-11-21T08:00:00.000Z");
   private seq = 0;
   private timers = new Map<number, { at: number; fn: () => void }>();
   now = () => this.time;
   setTimeout = (fn: () => void, ms: number) => { const id = ++this.seq; this.timers.set(id, { at: this.time + Math.max(0, ms), fn }); return id; };
   clearTimeout = (handle: unknown) => { this.timers.delete(handle as number); };
   pending() { return this.timers.size; }
   /** Run every timer due within `ms`, in time order, letting async work settle between them. */
   async advance(ms: number) {
      const end = this.time + ms;
      for (;;) {
         await flush();
         let next: [number, { at: number; fn: () => void }] | undefined;
         for (const entry of this.timers) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
         if (!next) break;
         this.timers.delete(next[0]);
         this.time = Math.max(this.time, next[1].at);
         next[1].fn();
         await flush();
      }
      this.time = end;
      await flush();
   }
}
/**
 * Hashing (`crypto.subtle.digest`) completes on a libuv thread, not in the microtask queue. A fixed number of
 * event-loop turns therefore settles before the work finishes whenever the machine is busy, which made the
 * simulation depend on CPU load (a conflict reported as "modified", or a 24-hour scenario timing out). Count
 * in-flight digests and keep turning the loop until they are done.
 */
let digestsInFlight = 0;
const subtle = globalThis.crypto.subtle as SubtleCrypto & { __tracked?: boolean };
if (!subtle.__tracked) {
   const digest = subtle.digest.bind(subtle);
   subtle.digest = ((...args: Parameters<SubtleCrypto["digest"]>) => {
      digestsInFlight += 1;
      return digest(...args).finally(() => { digestsInFlight -= 1; });
   }) as SubtleCrypto["digest"];
   subtle.__tracked = true;
}
const turns = async (count: number) => { for (let i = 0; i < count; i += 1) await new Promise(resolve => setImmediate(resolve)); };
export const flush = async () => {
   await turns(30);
   for (let guard = 0; digestsInFlight > 0 && guard < 20_000; guard += 1) await turns(1);
   await turns(30);
};

// ------------------------------------------------------------------------------------------------
// Server
// ------------------------------------------------------------------------------------------------

class MemoryRepo implements CloudCopySyncRepository {
   states = new Map<string, CloudCopyOwnerState>();
   private chain = new Map<string, Promise<unknown>>();
   async transact<T>(ownerId: string, transition: (state: CloudCopyOwnerState) => CloudCopyTransition<T>): Promise<T> {
      const run = (this.chain.get(ownerId) ?? Promise.resolve()).then(() => {
         const next = transition(structuredClone(this.states.get(ownerId) ?? emptyCloudCopyState()));
         this.states.set(ownerId, next.state);
         return next.result;
      });
      this.chain.set(ownerId, run.catch(() => {}));
      return run;
   }
   async get(ownerId: string, kind: CloudCopyKind, id: string) { return structuredClone(this.states.get(ownerId)?.copies.find(c => c.kind === kind && c.clientItemId === id) ?? null); }
   async list(ownerId: string) { return structuredClone(this.states.get(ownerId)?.copies ?? []); }
   async quota(ownerId: string, limits?: Partial<Record<CloudCopyKind, unknown>> | null) { return cloudCopyQuota(await this.list(ownerId), limits); }
   async load(ownerId: string) { return structuredClone(this.states.get(ownerId) ?? emptyCloudCopyState()); }
   async syncHead(ownerId: string) {
      const state = this.states.get(ownerId);
      return { changeSeq: state?.changeSeq ?? 0, oldestUpdatedAt: state?.copies.map(c => c.updatedAt).sort()[0] ?? null };
   }
}

/** A deployment whose retention is configured and whose notice the account acknowledged, as in production. */
const SIM_RETENTION = {
   noticeVersion: "sim", sessionCurrentCopyRetentionDays: 30, templateRetentionDays: 30, profileRetentionDays: 30,
   checkpointRetentionDays: 7, retentionExtensionDays: 30,
};
export const grantedConsent = (granted = true, options: { acknowledged?: boolean; only?: CloudCopyKind[] } = {}): ConsentViewDto => {
   const acknowledged = options.acknowledged ?? true;
   const on = (kind: CloudCopyKind) => (options.only ? options.only.includes(kind) : granted);
   return {
      policyVersion: "2026-09-20", retentionConfiguration: SIM_RETENTION, retentionConfigurationMissing: [],
      retentionAcknowledgement: { acknowledgedVersion: acknowledged ? "sim" : null, acknowledgedAt: acknowledged ? "2026-11-01T00:00:00.000Z" : null },
      cloudSessions: { granted: on("session"), changedAt: null }, cloudTemplates: { granted: on("template"), changedAt: null },
      cloudProfiles: { granted: on("profile"), changedAt: null }, cloudJobPreferences: { granted: on("jobPreferences"), changedAt: null },
   };
};
const CATEGORY = { session: "cloudSessions", template: "cloudTemplates", profile: "cloudProfiles", jobPreferences: "cloudJobPreferences" } as const;

interface HubSocket { owner: string; device: string; socket: FakeSocket }

export class SimServer {
   readonly repo = new MemoryRepo();
   readonly clock: SimClock;
   consent = new Map<string, ConsentViewDto>();
   pushEnabled = true;
   down = false;
   /** Per-kind caps the simulated deployment configures; absent kinds use core's defaults. */
   limits: Partial<Record<CloudCopyKind, number>> | undefined;
   /** When set, every sync answers with this error before touching any data (e.g. the server's OWNER_MISMATCH). */
   refuse: SyncHttpError | null = null;
   requests: Array<{ owner: string; device: string; mutations: number; changes: number; at: number; status: number }> = [];
   private sockets: HubSocket[] = [];
   private lastCursor = new Map<string, number>();
   constructor(clock: SimClock) { this.clock = clock; }

   requestsFor(owner?: string, device?: string, fromTime = -Infinity) {
      return this.requests.filter(r => (!owner || r.owner === owner) && (!device || r.device === device) && r.at >= fromTime);
   }

   async sync(ownerId: string, body: SyncRequestDto): Promise<SyncResponseDto> {
      const record = { owner: ownerId, device: body.deviceId, mutations: body.mutations?.length ?? 0, changes: 0, at: this.clock.now(), status: 200 };
      this.requests.push(record);
      if (this.down) { record.status = 503; throw new SyncHttpError(503, "Service unavailable"); }
      if (this.refuse) { record.status = this.refuse.status; throw this.refuse; }
      const consent = this.consent.get(ownerId) ?? grantedConsent();
      const handler = createSyncCloudCopiesHandler(this.repo, {
         ownerId: () => ownerId,
         canWrite: (_owner, kind) => consent[CATEGORY[kind]]?.granted === true,
      }, {
         now: () => new Date(this.clock.now()).toISOString(),
         retainCheckpoints: (checkpoints, lastWriteAt) => selectRetainedCloudCheckpoints(checkpoints, lastWriteAt, 7),
         limits: () => this.limits,
      });
      // Like the route: a request that asks for consent also gets the quota, even when nothing changed.
      const result = await handler.execute({ ...(body as any), wantQuota: body.wantConsent === true });
      if (!result.success) { record.status = 400; throw new SyncHttpError(400, result.error); }
      record.changes = result.data.changes.length;
      if (result.data.changed) this.notify(ownerId, result.data.cursor, body.deviceId);
      return {
         protocol: 1,
         policy: { protocol: 1, debounceMs: 10_000, maxDelayMs: 45_000, fallbackReconcileMs: 45 * 60_000, staleAfterMs: 30 * 60_000, maxMutations: 20 },
         owner: await ownerFingerprint(ownerId), serverTime: new Date(this.clock.now()).toISOString(),
         acks: result.data.acks as any, changes: result.data.changes as any, cursor: result.data.cursor, hasMore: result.data.hasMore,
         reset: result.data.reset, changed: result.data.changed, quota: result.data.quota as any,
         consent: body.wantConsent ? consent : null, retentionConfigured: true,
         push: body.wantPush && this.pushEnabled ? { url: "/api/cloud-data/events", ticket: `${ownerId}|${body.deviceId}`, expiresAt: new Date(this.clock.now() + 300_000).toISOString() } : null,
      };
   }

   async history(ownerId: string, kind: CloudCopyKind, id: string) {
      const result = await createGetCloudCopyHandler(this.repo, { ownerId: () => ownerId }).execute({ kind, clientItemId: id });
      if (!result.success) throw new SyncHttpError(404, result.error);
      const copy = result.data;
      return { kind, clientItemId: id, revision: copy.headRevision, updatedAt: copy.updatedAt, snapshot: copy.snapshot, checkpoints: copy.checkpoints.map(c => ({ day: c.day, revision: c.revision, changedAt: c.changedAt, snapshot: c.snapshot })) } as any;
   }

   // Push hub
   connect(url: string): FakeSocket {
      const ticket = decodeURIComponent(new URL(url).searchParams.get("ticket") ?? "");
      const [owner, device] = ticket.split("|");
      const socket = new FakeSocket(this);
      queueMicrotask(() => {
         if (!this.pushEnabled || !owner || !device) { socket.serverClose(1006); return; }
         for (const entry of this.sockets.filter(s => s.owner === owner && s.device === device)) entry.socket.serverClose(4000);
         this.sockets.push({ owner, device, socket });
         socket.open();
         const cursor = this.lastCursor.get(owner);
         if (cursor !== undefined) socket.deliver(JSON.stringify({ t: "hello", cursor }));
      });
      return socket;
   }
   dropAllSockets() { for (const entry of this.sockets.splice(0)) entry.socket.serverClose(1006); }
   detach(socket: FakeSocket) { this.sockets = this.sockets.filter(entry => entry.socket !== socket); }
   socketCount(owner?: string) { return this.sockets.filter(s => !owner || s.owner === owner).length; }
   private notify(owner: string, cursor: number, origin: string) {
      this.lastCursor.set(owner, Math.max(cursor, this.lastCursor.get(owner) ?? 0));
      for (const entry of this.sockets) if (entry.owner === owner && entry.device !== origin) entry.socket.deliver(JSON.stringify({ t: "changed", cursor }));
   }
}

export class FakeSocket implements WebSocketLike {
   readyState = 0;
   sent: string[] = [];
   private listeners = new Map<string, Array<(event: any) => void>>();
   constructor(private readonly server: SimServer) {}
   addEventListener(type: string, listener: (event: any) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
   private emit(type: string, event: any) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
   open() { this.readyState = 1; this.emit("open", {}); }
   deliver(data: string) { if (this.readyState === 1) this.emit("message", { data }); }
   send(data: string) {
      this.sent.push(data);
      if (data === "ping") queueMicrotask(() => this.deliver("pong"));
   }
   close(code = 1000) { if (this.readyState >= 2) return; this.readyState = 3; this.server.detach(this); this.emit("close", { code }); }
   serverClose(code: number) { if (this.readyState >= 2) return; this.readyState = 3; this.server.detach(this); this.emit("close", { code }); }
}

// ------------------------------------------------------------------------------------------------
// Browser profile (device) with tabs
// ------------------------------------------------------------------------------------------------

export class MemoryStorage implements Storage {
   private data = new Map<string, string>();
   listeners: Array<(event: { key: string | null }) => void> = [];
   get length() { return this.data.size; }
   key(index: number) { return [...this.data.keys()][index] ?? null; }
   getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
   setItem(key: string, value: string) { this.data.set(key, String(value)); }
   removeItem(key: string) { this.data.delete(key); }
   clear() { this.data.clear(); }
}

/**
 * Exclusive locks shared by the tabs of one simulated browser, granted FIFO. `steal` revokes the current holder
 * (its request rejects with an AbortError, as in browsers) and grants at once.
 */
class SimLocks implements LockManagerLike {
   private queues = new Map<string, Array<() => void>>();
   private holders = new Map<string, { revoke(): void }>();
   async request<T>(name: string, options: { signal?: AbortSignal; steal?: boolean }, callback: (lock: unknown) => Promise<T> | T): Promise<T> {
      if (options.steal) {
         this.holders.get(name)?.revoke();
      } else if (this.holders.has(name)) {
         await new Promise<void>((resolve, reject) => {
            const queue = this.queues.get(name) ?? [];
            const entry = () => resolve();
            queue.push(entry);
            this.queues.set(name, queue);
            options.signal?.addEventListener("abort", () => {
               const index = queue.indexOf(entry);
               if (index >= 0) { queue.splice(index, 1); reject(new DOMException("Aborted", "AbortError")); }
            });
         });
      }
      let revoke!: (error: unknown) => void;
      const revoked = new Promise<never>((_, reject) => { revoke = reject; });
      revoked.catch(() => undefined);
      const me = { revoke: () => revoke(new DOMException("The lock was stolen", "AbortError")) };
      this.holders.set(name, me);
      try { return await Promise.race([Promise.resolve(callback({})), revoked]); } finally {
         if (this.holders.get(name) === me) {
            const next = this.queues.get(name)?.shift();
            if (next) next(); else this.holders.delete(name);
         }
      }
   }
}

class SimChannelHub {
   private channels = new Map<string, Set<{ listeners: Set<(event: { data: unknown }) => void> }>>();
   create(name: string): BroadcastChannelLike {
      const self = { listeners: new Set<(event: { data: unknown }) => void>() };
      const peers = this.channels.get(name) ?? new Set();
      peers.add(self);
      this.channels.set(name, peers);
      return {
         postMessage: data => { for (const peer of peers) if (peer !== self) for (const listener of peer.listeners) queueMicrotask(() => listener({ data })); },
         addEventListener: (_type, listener) => self.listeners.add(listener),
         removeEventListener: (_type, listener) => self.listeners.delete(listener),
         close: () => peers.delete(self),
      };
   }
}

export interface SimTab { engine: CloudSyncEngine; close(): void }

/** Overrides that point a simulated device at a real HTTP server instead of the in-process one. */
export interface DeviceTransport {
   sync(body: SyncRequestDto): Promise<SyncResponseDto>;
   history(kind: CloudCopyKind, id: string): Promise<any>;
   createSocket?: (url: string) => WebSocketLike;
   origin?: string;
}

export class SimDevice {
   transportOverride: DeviceTransport | null = null;
   requestLog: Array<{ at: number; mutations: number; changes: number; ok: boolean }> = [];
   readonly storage = new MemoryStorage();
   readonly blobs = createMemoryBlobStore();
   readonly locks = new SimLocks();
   readonly channels = new SimChannelHub();
   readonly tabs: SimTab[] = [];
   online = true;
   constructor(readonly server: SimServer, readonly ownerId: string, readonly name: string) {}

   /**
    * A tab of an older bundle (or one that stopped answering) holding the leader lock: it never replies to
    * anything and never syncs. Returns a function that lets the lock go (the tab closing).
    */
   async holdLeadership(): Promise<() => void> {
      const owner = await ownerFingerprint(this.ownerId);
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      void this.locks.request(leaderLockName(owner), { mode: "exclusive" }, () => held).catch(() => undefined);
      await flush();
      return release;
   }

   async openTab(options: { generation?: number } = {}): Promise<SimTab> {
      const owner = await ownerFingerprint(this.ownerId);
      const clock = this.server.clock;
      const storage = () => this.storage;
      const engine = new CloudSyncEngine({
         owner,
         store: createSyncStateStore(owner, { storage: this.storage, events: new EventTarget() }),
         blobs: this.blobs,
         adapters: createRecordAdapters(storage),
         transport: async body => {
            if (!this.online) throw new SyncHttpError(0, "offline");
            const entry = { at: clock.now(), mutations: body.mutations.length, changes: 0, ok: false };
            this.requestLog.push(entry);
            const response = this.transportOverride ? await this.transportOverride.sync(body) : await this.server.sync(this.ownerId, body);
            entry.changes = response.changes.length;
            entry.ok = true;
            return { response, bytesUp: JSON.stringify(body).length, bytesDown: JSON.stringify(response).length };
         },
         fetchHistory: (kind, id) => this.transportOverride ? this.transportOverride.history(kind, id) : this.server.history(this.ownerId, kind, id),
         coordinator: createSyncCoordinator(owner, { locks: this.locks, createChannel: name => this.channels.create(name) }),
         createPush: events => createPushChannel(events, {
            createSocket: url => this.transportOverride?.createSocket ? this.transportOverride.createSocket(url) : this.server.connect(url),
            clock: { now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout },
            origin: this.transportOverride?.origin ?? "https://sim.test",
         }),
         clock,
         online: () => this.online,
         random: () => 0.5,
         ...(options.generation !== undefined ? { generation: options.generation } : {}),
      });
      engine.start();
      const tab = { engine, close: () => { engine.stop(); this.tabs.splice(this.tabs.indexOf(tab), 1); } };
      this.tabs.push(tab);
      await flush();
      return tab;
   }

   get leader(): CloudSyncEngine | undefined { return this.tabs.find(tab => tab.engine.view?.leader)?.engine ?? this.tabs[0]?.engine; }

   /** Simulate the app writing a CV session in tab `index`: storage write plus the in-tab event. */
   editSession(id: string, markdown: string, title = `Session ${id}`, index = 0) {
      const key = `cv-sv:session-backup:${id}`;
      const previous = JSON.parse(this.storage.getItem(key) ?? "null");
      this.storage.setItem(key, JSON.stringify({ markdown, css: "", title, revision: (previous?.revision ?? 0) + 1, pending: false, savedAt: this.server.clock.now() }));
      // Same tab: local change event; other tabs: storage event (the leader routes both to notifyLocalChange).
      for (const [position, tab] of this.tabs.entries()) tab.engine.notifyLocalChange({ kind: "session", id: position === index ? id : "*", origin: "local" });
   }

   readSession(id: string): { markdown: string; title: string } | null {
      return JSON.parse(this.storage.getItem(`cv-sv:session-backup:${id}`) ?? "null");
   }
}
