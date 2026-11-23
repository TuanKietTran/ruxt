import type {
   ConflictChoice, EngineActions, EngineStatus, EngineView, KindSyncView, LocalRecord, PendingMutation, PushChannel, PushChannelEvents,
   PushStatus, RecordAdapter, RecordKey, RecordLink, RecordStatus, RecoveryEntry, RemoteEntry, SyncCoordinator,
   SyncRecordView, SyncState, SyncStateStore,
} from "./contracts";
import { parseRecordKey, recordKey } from "./contracts";
import type { SyncBlobStore } from "./blobs";
import { hashSnapshot, snapshotBytes } from "./hash";
import { addRecovery, appendJournal, recordMetrics } from "./state";
import { kindConsentGranted, SYNC_KIND_REGISTRY, SYNC_KINDS } from "./kinds";
import { retentionState } from "./consentView";
import { owedCount } from "./syncPresentation";
import {
   SyncHttpError, type CloudHistoryDto, type SyncChangeDto, type SyncKind, type SyncMode,
   type SyncMutationDto, type SyncPolicyDto, type SyncRequestDto, type SyncResponseDto, type SyncSnapshot,
} from "./types";

/**
 * The single client synchronization engine.
 *
 * Local storage stays the source of truth for editing; this engine never blocks it. Changes are found by
 * comparing each selected record's content hash with the last version agreed with the cloud (so edits
 * coalesce for free and unchanged content is never uploaded), batched after a quiet period, and sent with
 * the device cursor in one request that also returns the remote delta. A push socket (leader tab only)
 * says when to pull; without it the engine reconciles rarely. Every exchange runs under a cross-tab lock
 * and re-reads persisted state, so duplicate triggers from tabs or re-renders become no-ops, not requests.
 */

export interface EngineClock {
   now(): number;
   setTimeout(fn: () => void, ms: number): unknown;
   clearTimeout(handle: unknown): void;
}

export interface SyncTransportResult { response: SyncResponseDto; bytesUp: number; bytesDown: number }

export interface EngineDeps {
   owner: string;
   store: SyncStateStore;
   blobs: SyncBlobStore;
   adapters: Record<SyncKind, RecordAdapter>;
   transport: (body: SyncRequestDto) => Promise<SyncTransportResult>;
   fetchHistory: (kind: SyncKind, id: string) => Promise<CloudHistoryDto>;
   coordinator: SyncCoordinator;
   createPush?: (events: PushChannelEvents) => PushChannel;
   clock?: EngineClock;
   random?: () => number;
   online?: () => boolean;
   isEditorDirty?: (kind: SyncKind, id: string) => boolean;
   newId?: () => string;
   /**
    * Kinds whose clean local copies take cloud updates automatically (default: all). A record an editor holds
    * unsaved edits for is never replaced (see isEditorDirty); it is brought up to date once the editor is clean.
    */
   autoApply?: Partial<Record<SyncKind, boolean>>;
   /** Overrides ENGINE_GENERATION (tests simulate an older bundle with it). */
   generation?: number;
}

/**
 * The behavior level of this bundle's engine. A tab whose leader reports a lower number (or does not answer at
 * all, as bundles before this one never do) takes the leadership instead of waiting behind it. Raise it whenever
 * the leader does something an older leader must not keep doing.
 */
export const ENGINE_GENERATION = 2;
/** A follower asks who leads this long after it starts, and waits this long for the answer. */
const START_PROBE_MS = 1_000;
const LEADER_REPLY_MS = 5_000;
/** A follower that still sees unsynced work this long after the leader answered asks it to sync. */
const POKE_AFTER_MS = 60_000;
/** A follower that has not heard a leader yet and sees unsynced work asks sooner. */
const PROBE_AFTER_OWED_MS = 15_000;

export const DEFAULT_SYNC_POLICY: SyncPolicyDto = {
   protocol: 1, debounceMs: 10_000, maxDelayMs: 45_000, fallbackReconcileMs: 45 * 60_000, staleAfterMs: 30 * 60_000, maxMutations: 20,
};
const MAX_BATCH_BYTES = 3 * 1024 * 1024;
const MAX_PAGES_PER_EXCHANGE = 25;
const PUSH_PULL_DELAY_MS = 1_500;
const MAX_BACKOFF_MS = 30 * 60_000;
const UNAVAILABLE_BACKOFF_MS = 60 * 60_000;
const BLOCKING_CODES = new Set(["CLOUD_COPY_CONSENT_REQUIRED", "CLOUD_COPY_RETENTION_UNCONFIGURED", "CLOUD_COPY_LIMIT", "CLOUD_COPY_TOO_LARGE", "CLOUD_COPY_INVALID"]);
/** The server refused a new copy for lack of room / this device found no room before asking. Shown as "over limit". */
export const OVER_LIMIT_CODES = ["CLOUD_COPY_LIMIT", "OVER_LIMIT"] as const;
export const isOverLimit = (link: Pick<RecordLink, "state" | "error">): boolean =>
   link.state === "blocked" && (OVER_LIMIT_CODES as readonly string[]).includes(link.error?.code ?? "");

type Reason = "initial" | "local" | "explicit" | "push" | "visible" | "online" | "fallback" | "reconnect" | "retry" | "page-hide" | "peer";
interface ExchangeOptions { wantConsent?: boolean; wantPush?: boolean; explicit?: boolean }

const realClock: EngineClock = {
   now: () => Date.now(),
   setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
   clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export class CloudSyncEngine implements EngineActions {
   private readonly clock: EngineClock;
   private readonly random: () => number;
   private readonly newId: () => string;
   private policy: SyncPolicyDto = DEFAULT_SYNC_POLICY;
   private started = false;
   private halted: EngineStatus | null = null;
   private running = 0;
   private push: PushChannel | null = null;
   private pushStatus: PushStatus = "idle";
   private leader = false;
   private dirtySince = 0;
   private batchBytes = MAX_BATCH_BYTES;
   private timers: Record<"flush" | "retry" | "fallback" | "pull" | "reconnect" | "watch" | "probe", unknown> = { flush: null, retry: null, fallback: null, pull: null, reconnect: null, watch: null, probe: null };
   private readonly generation: number;
   private leaderTab: NonNullable<EngineView["leaderTab"]> = "unknown";
   /** True once the quota of this session came from a response (a saved one may predate per-kind caps). */
   private quotaFresh = false;
   private listeners = new Set<(view: EngineView) => void>();
   private unsubscribers: Array<() => void> = [];
   private viewCache: EngineView | null = null;
   private viewPending: Promise<EngineView> | null = null;

   constructor(private readonly deps: EngineDeps) {
      this.clock = deps.clock ?? realClock;
      this.random = deps.random ?? Math.random;
      this.newId = deps.newId ?? (() => globalThis.crypto.randomUUID());
      this.generation = deps.generation ?? ENGINE_GENERATION;
   }

   // ----------------------------------------------------------------------------------------------
   // Lifecycle and triggers
   // ----------------------------------------------------------------------------------------------

   start(): void {
      if (this.started) return;
      this.started = true;
      this.halted = null;
      this.unsubscribers.push(this.deps.store.subscribe(() => this.invalidateView()));
      this.unsubscribers.push(this.deps.coordinator.onLeadership(leader => this.setLeader(leader)));
      this.unsubscribers.push(this.deps.coordinator.onMessage(message => this.onPeerMessage(message)));
      if (this.deps.coordinator.isLeader) this.setLeader(true);
      else this.armProbe(START_PROBE_MS);
      this.invalidateView();
   }

   stop(): void {
      if (!this.started) return;
      this.started = false;
      const state = this.deps.store.load();
      this.flushPushCounters(state);
      this.deps.store.save(state);
      for (const name of Object.keys(this.timers) as Array<keyof typeof this.timers>) this.cancel(name);
      this.push?.close();
      this.push = null;
      for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
      this.leader = false;
      this.deps.coordinator.dispose(); // hand leadership to another tab
   }

   subscribe(listener: (view: EngineView) => void): () => void {
      this.listeners.add(listener);
      if (this.viewCache) listener(this.viewCache);
      return () => this.listeners.delete(listener);
   }

   /** A local record changed (same tab event or another tab's storage write). */
   notifyLocalChange(change: { kind: SyncKind; id: string; origin: "local" | "cloud" }): void {
      if (this.started && !this.leader && change.origin !== "cloud") this.invalidateView(); // a follower still shows what it holds
      if (!this.started || !this.leader || this.halted || change.origin === "cloud") return;
      const state = this.deps.store.load();
      // A kind that syncs automatically cares about every record, including ones created just now and not yet linked.
      const relevant = this.automaticKinds(state).includes(change.kind)
         || Object.values(state.links).some(link => link.kind === change.kind && (change.id === "*" || link.id === change.id));
      if (!relevant) return;
      const now = this.clock.now();
      this.dirtySince ||= now;
      const delay = Math.max(0, Math.min(this.policy.debounceMs, this.dirtySince + this.policy.maxDelayMs - now));
      this.cancel("flush");
      this.timers.flush = this.clock.setTimeout(() => { this.timers.flush = null; void this.exchange("local"); }, delay);
      this.invalidateView();
   }

   /** The page became visible: reconcile only when stale and live updates are not flowing. */
   onVisible(): void {
      if (this.halted === "offline") this.halted = null;
      if (!this.leader || this.halted) return;
      const state = this.deps.store.load();
      const last = state.lastSyncAt ? Date.parse(state.lastSyncAt) : 0;
      if (this.pushStatus !== "connected" && this.clock.now() - last >= this.policy.staleAfterMs) {
         void this.exchange("visible", { wantPush: this.wantsPush() });
      }
   }

   /** The network came back: one batched reconciliation. */
   onOnline(): void {
      if (this.halted === "offline") this.halted = null;
      if (!this.leader || this.halted) return;
      void this.exchange("online", { wantPush: this.wantsPush() });
   }

   /** Best effort before the page goes away: send what is pending now. */
   onPageHide(): void {
      if (!this.leader || this.halted || !this.dirtySince) return;
      this.cancel("flush");
      void this.exchange("page-hide");
   }

   async syncNow(): Promise<void> {
      this.halted = this.halted === "signed-out" ? "signed-out" : null;
      await this.exchange("explicit", { explicit: true, wantConsent: true, wantPush: this.leader && this.wantsPush() });
   }

   get view(): EngineView | null { return this.viewCache; }

   private setLeader(leader: boolean): void {
      if (this.leader === leader) return;
      this.leader = leader;
      if (leader) {
         this.leaderTab = "this";
         this.cancel("probe");
         this.cancel("watch");
         this.deps.coordinator.broadcast({ type: "leader-here", generation: this.generation });
         // One exchange per device session: consent, catch-up delta and a push ticket together.
         void this.exchange("initial", { wantConsent: true, wantPush: true });
      } else {
         for (const name of Object.keys(this.timers) as Array<keyof typeof this.timers>) this.cancel(name);
         this.push?.close();
         this.push = null;
         this.setPushStatus("idle");
         this.leaderTab = "unknown";
         this.armProbe(START_PROBE_MS);
      }
      this.invalidateView();
   }

   // ----------------------------------------------------------------------------------------------
   // Other tabs
   // ----------------------------------------------------------------------------------------------

   private onPeerMessage(message: { type: string; [key: string]: unknown }): void {
      if (!this.started) return;
      switch (message.type) {
         case "state":
            this.invalidateView();
            break;
         case "who-leads":
            if (this.leader) this.deps.coordinator.broadcast({ type: "leader-here", generation: this.generation });
            break;
         case "leader-here":
            if (!this.leader) this.onLeaderHere(typeof message.generation === "number" ? message.generation : 1);
            break;
         case "sync-request":
            // A follower sees work that is not moving. Local-only semantics: no request unless something is owed.
            if (this.leader && !this.halted) void this.exchange("peer");
            break;
      }
   }

   private armProbe(delay: number): void {
      if (this.leader || !this.started || this.timers.probe !== null || !this.deps.coordinator.takeOver) return;
      this.timers.probe = this.clock.setTimeout(() => {
         this.timers.probe = null;
         if (this.leader || !this.started) return;
         // Ask who leads; no answer in time means the leader is an older bundle or stopped running.
         this.deps.coordinator.broadcast({ type: "who-leads" });
         this.timers.probe = this.clock.setTimeout(() => {
            this.timers.probe = null;
            this.takeOverLeadership("silent");
         }, this.jitter(LEADER_REPLY_MS));
      }, delay);
   }

   private onLeaderHere(generation: number): void {
      this.cancel("probe");
      if (generation < this.generation) this.takeOverLeadership("outdated");
      else { this.leaderTab = "other"; this.invalidateView(); }
   }

   private takeOverLeadership(why: "silent" | "outdated"): void {
      // A tab that stopped for another account must not take the lock to sync as the wrong one.
      if (this.leader || !this.started || this.halted === "signed-out") return;
      this.leaderTab = why;
      this.invalidateView();
      // The lock changes hands; setLeader(true) then runs this tab's first exchange.
      this.deps.coordinator.takeOver?.();
   }

   /**
    * A follower never syncs by itself, so work it still sees unsynced must be someone's job. With no leader heard
    * yet it asks who leads; with a leader that answered it asks that leader to sync, after giving it the time
    * edits normally wait. No network request comes from here.
    */
   private watchOwed(view: EngineView): void {
      if (this.leader || !this.started || this.halted === "signed-out" || owedCount(view) === 0) { this.cancel("watch"); return; }
      if (this.timers.watch !== null || this.timers.probe !== null) return;
      const answered = this.leaderTab === "other";
      this.timers.watch = this.clock.setTimeout(() => {
         this.timers.watch = null;
         if (this.leader || !this.started) return;
         if (answered) {
            this.deps.coordinator.broadcast({ type: "sync-request" });
            if (this.viewCache) this.watchOwed(this.viewCache);
         } else {
            this.armProbe(0);
         }
      }, answered ? POKE_AFTER_MS : PROBE_AFTER_OWED_MS);
   }

   private wantsPush(): boolean {
      return Boolean(this.deps.createPush) && this.pushStatus !== "connected" && this.pushStatus !== "connecting";
   }

   private cancel(name: keyof CloudSyncEngine["timers"]): void {
      if (this.timers[name] !== null) this.clock.clearTimeout(this.timers[name]);
      this.timers[name] = null;
   }

   private jitter(ms: number): number { return Math.round(ms * (0.8 + this.random() * 0.4)); }

   private armFallback(): void {
      this.cancel("fallback");
      if (!this.leader || this.halted || this.pushStatus === "connected") return;
      this.timers.fallback = this.clock.setTimeout(() => {
         this.timers.fallback = null;
         void this.exchange("fallback", { wantPush: this.wantsPush() });
      }, this.jitter(this.policy.fallbackReconcileMs));
   }

   private setPushStatus(status: PushStatus): void {
      if (this.pushStatus === status) return;
      this.pushStatus = status;
      if (status === "connected") this.cancel("fallback"); else this.armFallback();
      this.invalidateView();
   }

   private ensurePush(): PushChannel | null {
      if (!this.deps.createPush || !this.leader) return null;
      this.push ??= this.deps.createPush({
         onChanged: cursor => {
            const state = this.deps.store.load();
            if (state.cursor !== null && cursor <= state.cursor) return;
            if (this.timers.pull !== null) return;
            this.timers.pull = this.clock.setTimeout(() => { this.timers.pull = null; void this.exchange("push"); }, PUSH_PULL_DELAY_MS);
         },
         onStatus: status => this.setPushStatus(status),
         onNeedsTicket: () => {
            this.cancel("reconnect");
            this.timers.reconnect = this.clock.setTimeout(() => {
               this.timers.reconnect = null;
               void this.exchange("reconnect", { wantPush: true });
            }, Math.round(500 + this.random() * 1_500));
         },
         onMetric: metric => {
            // Counted in memory; persisting every heartbeat would rewrite state (and wake other tabs) each minute.
            if (metric === "ping") this.pushCounters.pushPings += 1;
            else if (metric === "message") this.pushCounters.pushMessages += 1;
            else this.pushCounters.pushConnects += 1;
            if (this.clock.now() - this.pushCountersSavedAt >= 10 * 60_000) {
               const state = this.deps.store.load();
               this.flushPushCounters(state);
               this.deps.store.save(state);
            }
         },
      });
      return this.push;
   }

   // ----------------------------------------------------------------------------------------------
   // Exchange
   // ----------------------------------------------------------------------------------------------

   private async exchange(reason: Reason, options: ExchangeOptions = {}): Promise<void> {
      if (!this.started || this.halted === "signed-out") return;
      this.running += 1;
      this.invalidateView();
      try {
         await this.deps.coordinator.withNetworkLock(() => this.exchangeLocked(reason, options));
      } catch (error) {
         this.recordInternalFailure(error);
      } finally {
         this.running -= 1;
         this.deps.coordinator.broadcast({ type: "state" });
         this.invalidateView();
      }
   }

   private async exchangeLocked(reason: Reason, options: ExchangeOptions): Promise<void> {
      const now = this.clock.now();
      let state = this.deps.store.load();
      if (!options.explicit && state.backoffUntil && state.backoffUntil > now && reason !== "online") {
         this.scheduleRetry(state.backoffUntil - now);
         return;
      }
      if (this.deps.online && !this.deps.online()) {
         this.halted = "offline";
         return;
      }
      if (this.halted === "offline") this.halted = null;
      if (reason === "local" || reason === "page-hide") this.dirtySince = 0;

      for (let page = 0; page < MAX_PAGES_PER_EXCHANGE; page += 1) {
         await this.catchUp(state);
         // Link, upload and download everything an automatic kind owes before deciding what to send.
         if (await this.autoSync(state)) this.autoQueued = true;
         const mutations = await this.collectMutations(state, Boolean(options.explicit));
         const pullOnly = reason === "local" || reason === "page-hide" || reason === "peer";
         if (page === 0 && pullOnly && mutations.length === 0) {
            this.deps.store.save(state);
            return; // nothing changed: zero requests
         }
         if (page > 0 && mutations.length === 0 && !state.listing && !this.morePages) break;
         state.lastAttemptAt = new Date(now).toISOString();
         this.deps.store.save(state);

         const body: SyncRequestDto = {
            deviceId: state.deviceId,
            since: state.listing ? null : state.cursor,
            ...(state.listing && state.listing.after > 0 ? { after: state.listing.after } : {}),
            mutations,
            ...(page === 0 && (options.wantConsent || !state.consent) ? { wantConsent: true } : {}),
            ...(page === 0 && options.wantPush && this.leader && this.deps.createPush ? { wantPush: true } : {}),
         };
         const startedAt = this.clock.now();
         let result: SyncTransportResult;
         try {
            result = await this.deps.transport(body);
         } catch (error) {
            state = this.deps.store.load();
            this.handleFailure(state, error, mutations.length);
            this.deps.store.save(state);
            return;
         }
         state = this.deps.store.load();
         const response = result.response;
         if (response.owner !== this.deps.owner) {
            // The session changed accounts mid-flight: apply nothing, stop until restarted for the new owner.
            this.halted = "signed-out";
            appendJournal(state, { at: new Date().toISOString(), event: "owner-mismatch" });
            this.deps.store.save(state);
            return;
         }
         const retries = mutations.filter(mutation => (state.outbox[recordKey(mutation.kind, mutation.clientItemId)]?.attempts ?? 0) > 1).length;
         recordMetrics(state, this.clock.now(), {
            requests: 1, reason, latencyMs: this.clock.now() - startedAt, bytesUp: result.bytesUp, bytesDown: result.bytesDown,
            mutationsSent: mutations.length, changesReceived: response.changes.length, retries,
            noopRequests: mutations.length === 0 && response.changes.length === 0 ? 1 : 0,
         });
         await this.applyResponse(state, response, mutations);
         this.flushPushCounters(state);
         this.deps.store.save(state);
         this.morePages = response.hasMore;
         if (!response.hasMore && !this.autoQueued && !(await this.hasUnsentWork(state))) break;
         if (!response.hasMore && !this.autoQueued) {
            // Content changed again while the request was in flight: send it on the normal schedule.
            this.notifyLocalChange({ kind: mutations[0]?.kind ?? "session", id: "*", origin: "local" });
            break;
         }
         // More pages, or automatic sync just queued uploads: continue in this exchange, no waiting for a click.
         this.autoQueued = false;
      }
      this.autoQueued = false;
   }

   private morePages = false;
   /** Automatic sync linked records for upload since the last request; the exchange loop sends them at once. */
   private autoQueued = false;
   private pushCounters = { pushPings: 0, pushMessages: 0, pushConnects: 0 };
   private pushCountersSavedAt = 0;

   private flushPushCounters(state: SyncState): void {
      const counters = this.pushCounters;
      if (counters.pushPings || counters.pushMessages || counters.pushConnects) recordMetrics(state, this.clock.now(), { ...counters });
      this.pushCounters = { pushPings: 0, pushMessages: 0, pushConnects: 0 };
      this.pushCountersSavedAt = this.clock.now();
   }

   /** Something other than the network broke an exchange: say so (the chip turns to "Sync failed") instead of going quiet. */
   private recordInternalFailure(error: unknown): void {
      try {
         const state = this.deps.store.load();
         const at = new Date(this.clock.now()).toISOString();
         const detail = error instanceof Error ? error.message : String(error);
         state.lastError = { code: "SYNC_INTERNAL", message: `Sync stopped on an unexpected problem: ${detail}`, at };
         state.failures += 1;
         appendJournal(state, { at, event: "sync-failed", detail: `SYNC_INTERNAL: ${detail}` });
         const delay = this.jitter(Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** (state.failures - 1)));
         state.backoffUntil = this.clock.now() + delay;
         this.deps.store.save(state);
         if (this.leader) this.scheduleRetry(delay);
      } catch {
         // Nothing more can be recorded; the next trigger tries again.
      }
   }

   private scheduleRetry(delay: number): void {
      this.cancel("retry");
      this.timers.retry = this.clock.setTimeout(() => { this.timers.retry = null; void this.exchange("retry", { wantPush: this.wantsPush() }); }, Math.max(1_000, delay));
   }

   private handleFailure(state: SyncState, error: unknown, mutationCount: number): void {
      const status = error instanceof SyncHttpError ? error.status : 0;
      const code = error instanceof SyncHttpError ? error.code ?? `HTTP_${status}` : "NETWORK";
      const message = error instanceof Error ? error.message : String(error);
      const at = new Date(this.clock.now()).toISOString();
      recordMetrics(state, this.clock.now(), { requests: status ? 1 : 0, failedRequests: 1 });
      state.lastError = { code, message, at };
      appendJournal(state, { at, event: "sync-failed", detail: `${code}: ${message}` });
      if (status === 401 || (status === 409 && code === "OWNER_MISMATCH")) {
         // Signed out, or the session now belongs to another account: stop until restarted for the right one.
         this.halted = "signed-out";
         this.push?.close();
         return;
      }
      if (status === 413 && mutationCount > 1) {
         this.batchBytes = Math.max(256 * 1024, Math.floor(this.batchBytes / 2));
         this.scheduleRetry(1_000);
         return;
      }
      if (status === 400) {
         // Our request was refused as invalid: drop in-flight copies so the next exchange rebuilds them.
         for (const [key, pending] of Object.entries(state.outbox)) if (pending.sentAt) delete state.outbox[key as RecordKey];
         return;
      }
      state.failures += 1;
      const base = status === 503 && code === "CLOUD_SYNC_UNAVAILABLE" ? UNAVAILABLE_BACKOFF_MS : Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** (state.failures - 1));
      const delay = this.jitter(base);
      state.backoffUntil = this.clock.now() + delay;
      if (status === 503 && code === "CLOUD_SYNC_UNAVAILABLE") this.halted = "unavailable";
      if (this.leader) this.scheduleRetry(delay);
   }

   // ----------------------------------------------------------------------------------------------
   // Outgoing mutations
   // ----------------------------------------------------------------------------------------------

   private consentGranted(state: SyncState, kind: SyncKind): boolean | null {
      return state.consent ? kindConsentGranted(state.consent, kind) : null;
   }

   private async collectMutations(state: SyncState, explicit = false): Promise<SyncMutationDto[]> {
      const mutations: SyncMutationDto[] = [];
      let bytes = 0;
      const now = new Date(this.clock.now()).toISOString();
      const room = () => mutations.length < this.policy.maxMutations && bytes < this.batchBytes;

      // 1. Unknown-outcome mutations are retried byte-for-byte with the same id.
      for (const pending of Object.values(state.outbox)) {
         if (!pending.sentAt || !room()) continue;
         pending.attempts += 1;
         mutations.push(this.toDto(pending));
         bytes += pending.snapshot ? snapshotBytes(pending.snapshot) : 0;
      }
      // 2. Explicit removals.
      for (const pending of Object.values(state.outbox)) {
         if (pending.sentAt || pending.operation !== "remove" || !room()) continue;
         pending.sentAt = now;
         pending.attempts += 1;
         mutations.push(this.toDto(pending));
      }
      // 3. Selected records whose content differs from the agreed version.
      for (const link of Object.values(state.links)) {
         const key = recordKey(link.kind, link.id);
         // Consent granted since the record was blocked: try again (the server re-checks anyway).
         if (link.state === "blocked" && link.error?.code === "CLOUD_COPY_CONSENT_REQUIRED" && this.consentGranted(state, link.kind) === true) {
            link.state = "pending";
            delete link.error;
         }
         if (["conflict", "blocked", "cloud-removed"].includes(link.state)) continue;
         if (state.outbox[key]?.sentAt) continue;
         const local = this.deps.adapters[link.kind].get(link.id);
         if (!local) continue;
         if (local.syncConflict && link.baseRevision > 0) {
            this.markConflict(state, link, "stale-editor");
            continue;
         }
         const hash = await hashSnapshot(local.snapshot);
         if (hash === link.baseHash) {
            delete state.outbox[key];
            if (link.state === "pending") link.state = "synced";
            continue;
         }
         const remote = state.remote[key];
         if (remote && !remote.deleted && link.baseRevision > 0 && remote.revision !== link.baseRevision) {
            if (remote.hash === hash) this.agree(state, link, remote, local.snapshot);
            else this.markConflict(state, link, "both-changed");
            continue;
         }
         // Saves the request a known refusal; an explicit retry always asks the server (consent may be new).
         if (!explicit && this.consentGranted(state, link.kind) === false) {
            link.state = "blocked";
            link.error = { code: "CLOUD_COPY_CONSENT_REQUIRED", message: "Turn on cloud saving for this kind of record", at: now };
            continue;
         }
         if (!room()) break;
         const pending: PendingMutation = state.outbox[key] ?? {
            mutationId: this.newId(), operation: "save", kind: link.kind, id: link.id, expectedRevision: link.baseRevision, queuedAt: now, attempts: 0,
         };
         pending.operation = "save";
         pending.expectedRevision = link.baseRevision;
         pending.hash = hash;
         pending.snapshot = structuredClone(local.snapshot);
         pending.sentAt = now;
         pending.attempts += 1;
         state.outbox[key] = pending;
         link.state = "pending";
         mutations.push(this.toDto(pending));
         bytes += snapshotBytes(local.snapshot);
      }
      return mutations;
   }

   private toDto(pending: PendingMutation): SyncMutationDto {
      return {
         mutationId: pending.mutationId, operation: pending.operation, kind: pending.kind, clientItemId: pending.id,
         expectedRevision: pending.expectedRevision,
         ...(pending.operation === "save" && pending.snapshot ? { snapshot: pending.snapshot } : {}),
      };
   }

   private async hasUnsentWork(state: SyncState): Promise<boolean> {
      for (const link of Object.values(state.links)) {
         if (link.state !== "synced" && link.state !== "pending") continue;
         const local = this.deps.adapters[link.kind].get(link.id);
         if (local && (await hashSnapshot(local.snapshot)) !== link.baseHash && !state.outbox[recordKey(link.kind, link.id)]?.sentAt) {
            const remote = state.remote[recordKey(link.kind, link.id)];
            if (!remote || remote.revision === link.baseRevision || link.baseRevision === 0) return true;
         }
      }
      return Object.values(state.outbox).some(pending => pending.operation === "remove" && !pending.sentAt);
   }

   private markConflict(state: SyncState, link: RecordLink, reason: NonNullable<RecordLink["conflict"]>["reason"]): void {
      const remote = state.remote[recordKey(link.kind, link.id)];
      const fresh = link.state !== "conflict";
      link.state = "conflict";
      link.conflict = { remoteRevision: remote?.revision ?? 0, remoteHash: remote?.hash ?? "", detectedAt: new Date(this.clock.now()).toISOString(), reason };
      const pending = state.outbox[recordKey(link.kind, link.id)];
      if (pending && !pending.sentAt) delete state.outbox[recordKey(link.kind, link.id)];
      if (fresh) {
         recordMetrics(state, this.clock.now(), { conflicts: 1 });
         appendJournal(state, { at: link.conflict.detectedAt, event: "conflict", key: recordKey(link.kind, link.id), detail: reason });
      }
   }

   /** Local content equals a cloud head: record it as the agreed version. */
   private agree(state: SyncState, link: RecordLink, remote: RemoteEntry, snapshot: SyncSnapshot): void {
      link.baseRevision = remote.revision;
      link.baseHash = remote.hash;
      link.state = "synced";
      delete link.conflict;
      delete link.error;
      link.lastSyncedAt = new Date(this.clock.now()).toISOString();
      void this.deps.blobs.set(this.blobKey("base", link.kind, link.id), snapshot);
   }

   // ----------------------------------------------------------------------------------------------
   // Incoming response
   // ----------------------------------------------------------------------------------------------

   private async applyResponse(state: SyncState, response: SyncResponseDto, sent: SyncMutationDto[]): Promise<void> {
      const at = new Date(this.clock.now()).toISOString();
      if (response.policy?.protocol === 1) this.policy = { ...DEFAULT_SYNC_POLICY, ...response.policy };
      if (response.consent) {
         state.consent = response.consent;
         for (const link of Object.values(state.links)) {
            if (link.state === "blocked" && link.error?.code === "CLOUD_COPY_CONSENT_REQUIRED" && this.consentGranted(state, link.kind)) {
               link.state = "pending";
               delete link.error;
            }
         }
      }
      if (response.quota) { state.quota = response.quota; state.quotaAt = at; this.quotaFresh = true; }
      state.retentionConfigured = response.retentionConfigured;

      const inFlight = new Set(sent.map(mutation => recordKey(mutation.kind, mutation.clientItemId)));
      for (const change of response.changes) await this.applyChange(state, change, inFlight);
      for (const ack of response.acks) await this.applyAck(state, ack);

      if (response.reset) {
         state.listing ??= { after: 0, seen: [] };
         for (const change of response.changes) if (!change.deleted) state.listing.seen.push(recordKey(change.kind, change.clientItemId));
         if (response.hasMore) {
            state.listing.after = response.cursor;
         } else {
            const seen = new Set(state.listing.seen);
            for (const [key, remote] of Object.entries(state.remote) as Array<[RecordKey, RemoteEntry]>) {
               if (seen.has(key) || remote.deleted) continue;
               remote.deleted = { at, reason: "missing" };
               void this.deps.blobs.delete(this.blobKey("remote", remote.kind, remote.id));
               const link = state.links[key];
               if (link && link.baseRevision > 0 && !state.outbox[key]?.sentAt) link.state = "cloud-removed";
            }
            state.listing = null;
            state.cursor = response.cursor;
         }
      } else {
         state.cursor = response.cursor;
      }
      // Cloud-only copies of automatic kinds come down now, as part of this catch-up; new local records get linked.
      if (await this.autoSync(state)) this.autoQueued = true;
      if (response.push && this.leader) this.ensurePush()?.connect(response.push.url, response.push.ticket);
      state.lastSyncAt = at;
      state.lastError = null;
      state.failures = 0;
      state.backoffUntil = null;
      if (this.halted === "unavailable") this.halted = null;
      this.armFallback();
   }

   private async applyChange(state: SyncState, change: SyncChangeDto, inFlight: Set<RecordKey>): Promise<void> {
      const key = recordKey(change.kind, change.clientItemId);
      const link = state.links[key];
      if (change.deleted) {
         const prior = state.remote[key];
         state.remote[key] = {
            kind: change.kind, id: change.clientItemId, revision: change.revision, hash: prior?.hash ?? "", title: prior?.title ?? "",
            updatedAt: change.removedAt, bytes: 0, checkpointCount: 0, deleted: { at: change.removedAt, reason: change.reason },
         };
         await this.deps.blobs.delete(this.blobKey("remote", change.kind, change.clientItemId));
         if (link && !inFlight.has(key)) {
            link.state = "cloud-removed";
            const pending = state.outbox[key];
            if (pending && !pending.sentAt) delete state.outbox[key];
            appendJournal(state, { at: change.removedAt, event: "cloud-removed", key, detail: change.reason });
         }
         return;
      }
      const hash = await hashSnapshot(change.snapshot);
      state.remote[key] = {
         kind: change.kind, id: change.clientItemId, revision: change.revision, hash, title: change.snapshot.title,
         updatedAt: change.updatedAt, bytes: snapshotBytes(change.snapshot), checkpointCount: change.checkpointCount,
      };
      await this.deps.blobs.set(this.blobKey("remote", change.kind, change.clientItemId), change.snapshot);
      if (!link || inFlight.has(key)) return;
      if (link.state === "cloud-removed") {
         link.state = "synced";
         link.baseRevision = 0;
         link.baseHash = "";
      }
      await this.reconcile(state, link, state.remote[key]!, change.snapshot);
   }

   /** Bring one linked record in line with a newer cloud head, or record a conflict. Never loses local edits. */
   private async reconcile(state: SyncState, link: RecordLink, remote: RemoteEntry, snapshot: SyncSnapshot): Promise<void> {
      if (remote.deleted || remote.revision === link.baseRevision || link.state === "conflict") return;
      const local = this.deps.adapters[link.kind].get(link.id);
      if (!local) return;
      const localHash = await hashSnapshot(local.snapshot);
      if (localHash === remote.hash) {
         this.agree(state, link, remote, snapshot);
         return;
      }
      const clean = link.baseRevision > 0 && localHash === link.baseHash && !local.syncConflict;
      if (!clean) {
         if (link.baseRevision > 0 || link.state !== "pending") this.markConflict(state, link, "both-changed");
         return;
      }
      const autoApply = this.deps.autoApply?.[link.kind] ?? true;
      if (!autoApply || this.deps.isEditorDirty?.(link.kind, link.id)) return; // shown as "behind" until applied
      if (this.deps.adapters[link.kind].write(link.id, snapshot)) {
         this.agree(state, link, remote, snapshot);
         appendJournal(state, { at: new Date(this.clock.now()).toISOString(), event: "applied-cloud-update", key: recordKey(link.kind, link.id), detail: `r${remote.revision}` });
      }
   }

   /** Retry deferred fast-forwards (an editor was dirty earlier) before collecting uploads. */
   private async catchUp(state: SyncState): Promise<void> {
      for (const link of Object.values(state.links)) {
         const key = recordKey(link.kind, link.id);
         const remote = state.remote[key];
         if (!remote || remote.deleted || remote.revision === link.baseRevision || link.state !== "synced" || state.outbox[key]?.sentAt) continue;
         const snapshot = await this.deps.blobs.get(this.blobKey("remote", link.kind, link.id));
         if (snapshot) await this.reconcile(state, link, remote, snapshot);
      }
   }

   private async applyAck(state: SyncState, ack: SyncResponseDto["acks"][number]): Promise<void> {
      const key = recordKey(ack.kind, ack.clientItemId);
      const pending = state.outbox[key];
      if (!pending || pending.mutationId !== ack.mutationId) return;
      delete state.outbox[key];
      const link = state.links[key];
      const at = new Date(this.clock.now()).toISOString();
      if (ack.status === "applied" || ack.status === "replayed") {
         if (ack.operation === "remove") {
            if (state.remote[key]) state.remote[key]!.deleted = { at, reason: "removed" };
            await this.deps.blobs.delete(this.blobKey("remote", ack.kind, ack.clientItemId));
            appendJournal(state, { at, event: "removed-from-cloud", key });
            return;
         }
         const snapshot = pending.snapshot!;
         state.remote[key] = {
            kind: ack.kind, id: ack.clientItemId, revision: ack.revision, hash: pending.hash!, title: snapshot.title,
            updatedAt: ack.updatedAt ?? at, bytes: snapshotBytes(snapshot), checkpointCount: state.remote[key]?.checkpointCount ?? 0,
         };
         await this.deps.blobs.set(this.blobKey("remote", ack.kind, ack.clientItemId), snapshot);
         if (link) this.agree(state, link, state.remote[key]!, snapshot);
         return;
      }
      if (!link) return;
      if (ack.status === "conflict") {
         const remote = state.remote[key];
         if (remote && remote.revision === ack.currentRevision && remote.hash === pending.hash) {
            this.agree(state, link, remote, pending.snapshot!); // the earlier attempt already landed
         } else {
            this.markConflict(state, link, "upload-rejected");
            if (link.conflict) link.conflict.remoteRevision = ack.currentRevision;
         }
         return;
      }
      if (ack.status !== "rejected") return;
      if (ack.code === "CLOUD_COPY_NOT_FOUND" && ack.operation === "remove") return;
      if (ack.code === "CLOUD_COPY_IDEMPOTENCY_CONFLICT") return; // rebuilt with a new id next time
      link.state = BLOCKING_CODES.has(ack.code) ? "blocked" : "error";
      link.error = { code: ack.code, message: ack.code === "CLOUD_COPY_LIMIT" ? this.overLimitMessage(state, ack.kind, state.quota?.kinds?.[ack.kind]?.used) : ack.message, at };
   }

   // ----------------------------------------------------------------------------------------------
   // Automatic sync
   // ----------------------------------------------------------------------------------------------

   /**
    * Kinds that sync with no clicks on this device: the account granted consent, the retention notice is
    * acknowledged, and the mode is automatic (the default). Revoking consent drops a kind out of this list at
    * once; nothing local is touched.
    */
   private automaticKinds(state: SyncState): SyncKind[] {
      const consent = state.consent;
      if (!consent || retentionState(consent) !== "acknowledged") return [];
      return SYNC_KINDS.filter(kind => kindConsentGranted(consent, kind) && state.modes[kind] !== "selected");
   }

   private kindLimit(state: SyncState, kind: SyncKind): number {
      const entry = state.quota?.kinds?.[kind];
      if (entry) return entry.limit;
      // A server that predates per-kind caps shares one total; before any quota is known assume core's default.
      return state.quota && state.quota.limit > 0 ? state.quota.limit : SYNC_KIND_REGISTRY[kind].fallbackLimit;
   }

   private liveCloudCount(state: SyncState, kind: SyncKind): number {
      return Object.values(state.remote).filter(remote => remote.kind === kind && !remote.deleted).length;
   }

   /** How many more copies of `kind` fit: the cap minus copies in the cloud and uploads already queued. */
   private roomFor(state: SyncState, kind: SyncKind): number {
      // A quota saved by a release that shared one total says nothing about this kind's own cap: let the server judge.
      if (!this.quotaFresh && !state.quota?.kinds) return Number.POSITIVE_INFINITY;
      const creating = Object.values(state.links).filter(link => {
         const remote = state.remote[recordKey(link.kind, link.id)];
         return link.kind === kind && link.state === "pending" && link.baseRevision === 0 && !(remote && !remote.deleted);
      }).length;
      return Math.max(0, this.kindLimit(state, kind) - this.liveCloudCount(state, kind) - creating);
   }

   /** `used` is what the server reported when it refused; otherwise it is what this device counts (cloud copies plus queued uploads). */
   private overLimitMessage(state: SyncState, kind: SyncKind, used?: number): string {
      const limit = this.kindLimit(state, kind);
      const room = this.roomFor(state, kind);
      const inUse = Math.min(limit, used ?? (Number.isFinite(room) ? limit - room : limit));
      return `Not synced: over limit (${inUse} of ${limit} ${SYNC_KIND_REGISTRY[kind].plural} in the cloud). Remove a cloud copy you no longer need to make room.`;
   }

   /**
    * Everything automatic kinds owe, decided from local knowledge only (no request, except one history read
    * for a cloud copy whose content was not kept): download cloud-only copies, link local records for upload
    * while they fit the quota, and mark the rest "over limit". Returns true when uploads were queued.
    * Records the user explicitly stopped syncing are left alone; local data is never overwritten or deleted.
    */
   private async autoSync(state: SyncState): Promise<boolean> {
      const kinds = this.automaticKinds(state);
      if (!kinds.length) return false;
      for (const remote of Object.values(state.remote)) {
         if (remote.deleted || !kinds.includes(remote.kind)) continue;
         const key = recordKey(remote.kind, remote.id);
         if (state.links[key] || state.optOut[key]) continue;
         await this.adoptCloudCopy(state, key, "auto-downloaded");
      }
      // While a full listing is still arriving the cloud's contents are not fully known, so room cannot be judged.
      if (state.listing) return false;
      let queued = false;
      for (const kind of kinds) if (this.autoLink(state, kind)) queued = true;
      return queued;
   }

   /** Link local records that are not in the cloud yet; the ones beyond the cap become "over limit". */
   private autoLink(state: SyncState, kind: SyncKind): boolean {
      const at = new Date(this.clock.now()).toISOString();
      const wanting: Array<{ key: RecordKey; local: LocalRecord; link?: RecordLink }> = [];
      for (const local of this.deps.adapters[kind].list()) {
         const key = recordKey(kind, local.id);
         if (state.optOut[key]) continue;
         const link = state.links[key];
         const live = state.remote[key] && !state.remote[key]!.deleted;
         if (!link) { if (!live) wanting.push({ key, local }); continue; }
         if (link.baseRevision !== 0 || !isOverLimit(link)) continue;
         // A refusal from this device's own count can be retried as soon as room appears; a refusal from the
         // server only once a newer quota arrived, so a full cloud is never asked again and again.
         const quotaNewer = state.quotaAt !== null && Date.parse(state.quotaAt) > Date.parse(link.error?.at ?? "");
         if (link.error?.code === "OVER_LIMIT" || quotaNewer) wanting.push({ key, local, link });
      }
      if (!wanting.length) return false;
      wanting.sort((a, b) => Date.parse(b.local.updatedAt) - Date.parse(a.local.updatedAt) || a.key.localeCompare(b.key));
      let room = this.roomFor(state, kind);
      let queued = false;
      for (const item of wanting) {
         if (room > 0) {
            room -= 1;
            const link = item.link ?? { kind, id: item.local.id, baseRevision: 0, baseHash: "", state: "pending" as const };
            link.state = "pending";
            delete link.error;
            state.links[item.key] = link;
            queued = true;
            if (!item.link) appendJournal(state, { at, event: "auto-selected-for-upload", key: item.key });
         } else if (!item.link) {
            state.links[item.key] = {
               kind, id: item.local.id, baseRevision: 0, baseHash: "", state: "blocked",
               error: { code: "OVER_LIMIT", message: this.overLimitMessage(state, kind), at },
            };
            appendJournal(state, { at, event: "over-limit", key: item.key });
         }
      }
      return queued;
   }

   /**
    * Bring one cloud copy to this device and link it. Existing local data is never overwritten: a record with
    * the same id and the same content is just linked, a different one becomes a conflict that keeps both
    * versions for the Conflicts tab. A browser that refuses the write leaves an error on the record instead of
    * trying again on every exchange.
    */
   private async adoptCloudCopy(state: SyncState, key: RecordKey, event: string): Promise<void> {
      const parsed = parseRecordKey(key);
      if (!parsed) return;
      const snapshot = await this.remoteSnapshot(state, key);
      const remote = state.remote[key];
      if (!snapshot || !remote || remote.deleted) return;
      const adapter = this.deps.adapters[parsed.kind];
      const link: RecordLink = state.links[key] ?? { kind: parsed.kind, id: parsed.id, baseRevision: 0, baseHash: "", state: "synced" };
      const local = adapter.get(parsed.id);
      const at = new Date(this.clock.now()).toISOString();
      if (!local) {
         if (adapter.write(parsed.id, snapshot)) {
            state.links[key] = link;
            this.agree(state, link, remote, snapshot);
         } else {
            link.state = "error";
            link.error = { code: "LOCAL_WRITE_REFUSED", message: "This browser could not save the downloaded record. Free some storage, then sync again.", at };
            state.links[key] = link;
            appendJournal(state, { at, event: "download-refused", key });
            return;
         }
      } else if ((await hashSnapshot(local.snapshot)) === remote.hash) {
         state.links[key] = link;
         this.agree(state, link, remote, snapshot);
      } else {
         state.links[key] = link;
         this.markConflict(state, link, "both-changed"); // existing local data is never overwritten
      }
      appendJournal(state, { at, event, key });
   }

   // ----------------------------------------------------------------------------------------------
   // Explorer actions
   // ----------------------------------------------------------------------------------------------

   private blobKey(slot: "base" | "remote" | "recovery", kind: SyncKind, id: string, suffix = ""): string {
      return `${this.deps.owner}:${slot}:${kind}:${id}${suffix}`;
   }

   private async mutate<T>(task: (state: SyncState) => Promise<T>): Promise<T> {
      const result = await this.deps.coordinator.withNetworkLock(async () => {
         const state = this.deps.store.load();
         const value = await task(state);
         this.deps.store.save(state);
         return value;
      });
      this.deps.coordinator.broadcast({ type: "state" });
      this.invalidateView();
      return result;
   }

   private async remoteSnapshot(state: SyncState, key: RecordKey): Promise<SyncSnapshot | null> {
      const parsed = parseRecordKey(key)!;
      const cached = await this.deps.blobs.get(this.blobKey("remote", parsed.kind, parsed.id));
      const remote = state.remote[key];
      if (cached && remote && (await hashSnapshot(cached)) === remote.hash) return cached;
      if (remote?.deleted) return null;
      try {
         const head = await this.deps.fetchHistory(parsed.kind, parsed.id);
         const hash = await hashSnapshot(head.snapshot);
         state.remote[key] = {
            kind: parsed.kind, id: parsed.id, revision: head.revision, hash, title: head.snapshot.title, updatedAt: head.updatedAt,
            bytes: snapshotBytes(head.snapshot), checkpointCount: head.checkpoints.length,
         };
         await this.deps.blobs.set(this.blobKey("remote", parsed.kind, parsed.id), head.snapshot);
         return head.snapshot;
      } catch (error) {
         if (error instanceof SyncHttpError && error.status === 404 && state.remote[key]) state.remote[key]!.deleted = { at: new Date(this.clock.now()).toISOString(), reason: "missing" };
         return null;
      }
   }

   private async saveRecovery(state: SyncState, local: LocalRecord, reason: RecoveryEntry["reason"]): Promise<void> {
      const savedAt = new Date(this.clock.now()).toISOString();
      const blobKey = this.blobKey("recovery", local.kind, local.id, `:${savedAt}`);
      await this.deps.blobs.set(blobKey, local.snapshot);
      for (const evicted of addRecovery(state, { blobKey, kind: local.kind, id: local.id, title: local.title, savedAt, reason })) {
         await this.deps.blobs.delete(evicted.blobKey);
      }
   }

   async upload(keys: RecordKey[]): Promise<void> {
      await this.mutate(async state => {
         for (const key of keys) {
            const parsed = parseRecordKey(key);
            if (!parsed) continue;
            const local = this.deps.adapters[parsed.kind].get(parsed.id);
            if (!local) continue;
            const existing = state.links[key];
            const remote = state.remote[key];
            delete state.optOut[key]; // choosing a record again ends an earlier "stop syncing"
            const link: RecordLink = existing && existing.state !== "cloud-removed"
               ? existing
               : { kind: parsed.kind, id: parsed.id, baseRevision: 0, baseHash: "", state: "pending" };
            if (link.state === "blocked" || link.state === "error") { link.state = "pending"; delete link.error; }
            state.links[key] = link;
            if (remote && !remote.deleted && link.baseRevision === 0) {
               const hash = await hashSnapshot(local.snapshot);
               if (hash === remote.hash) this.agree(state, link, remote, local.snapshot);
               else this.markConflict(state, link, "both-changed");
            }
            appendJournal(state, { at: new Date(this.clock.now()).toISOString(), event: "selected-for-upload", key });
         }
      });
      await this.exchange("explicit", { explicit: true, wantConsent: true });
   }

   async download(keys: RecordKey[]): Promise<void> {
      await this.mutate(async state => {
         for (const key of keys) {
            delete state.optOut[key]; // asking for a record again ends an earlier "stop syncing"
            if (state.links[key]?.state === "error" && !this.deps.adapters[state.links[key]!.kind].get(state.links[key]!.id)) delete state.links[key];
            await this.adoptCloudCopy(state, key, "downloaded");
         }
      });
   }

   async unlink(keys: RecordKey[]): Promise<void> {
      await this.mutate(async state => {
         for (const key of keys) {
            const link = state.links[key];
            if (!link) continue;
            delete state.links[key];
            state.optOut[key] = new Date(this.clock.now()).toISOString(); // automatic sync must not bring it back
            if (state.outbox[key] && !state.outbox[key]!.sentAt) delete state.outbox[key];
            this.deps.adapters[link.kind].clearConflict(link.id);
            await this.deps.blobs.delete(this.blobKey("base", link.kind, link.id));
            appendJournal(state, { at: new Date(this.clock.now()).toISOString(), event: "unlinked", key });
         }
      });
   }

   async removeFromCloud(keys: RecordKey[]): Promise<void> {
      await this.mutate(async state => {
         for (const key of keys) {
            const remote = state.remote[key];
            if (!remote || remote.deleted) continue;
            if (state.outbox[key]?.sentAt) continue; // let the in-flight upload resolve first
            state.outbox[key] = {
               mutationId: this.newId(), operation: "remove", kind: remote.kind, id: remote.id, expectedRevision: remote.revision,
               queuedAt: new Date(this.clock.now()).toISOString(), attempts: 0,
            };
            delete state.links[key];
            // The local record stays, but automatic sync must not upload it again behind the user's back.
            state.optOut[key] = new Date(this.clock.now()).toISOString();
            await this.deps.blobs.delete(this.blobKey("base", remote.kind, remote.id));
         }
      });
      await this.exchange("explicit", { explicit: true });
   }

   async setMode(kind: SyncKind, mode: SyncMode): Promise<void> {
      await this.mutate(async state => {
         if (mode === "auto") delete state.modes[kind]; else state.modes[kind] = mode;
         appendJournal(state, { at: new Date(this.clock.now()).toISOString(), event: "sync-mode", detail: `${kind}:${mode}` });
      });
      // Back to automatic: start syncing now rather than at the next trigger.
      if (mode === "auto") await this.exchange("explicit", { explicit: true, wantConsent: true });
   }

   async resolve(key: RecordKey, choice: ConflictChoice): Promise<void> {
      const upload = await this.mutate(async state => {
         const parsed = parseRecordKey(key);
         if (!parsed) return false;
         const adapter = this.deps.adapters[parsed.kind];
         const local = adapter.get(parsed.id);
         const snapshot = await this.remoteSnapshot(state, key);
         const remote = state.remote[key];
         const link: RecordLink = state.links[key] ?? { kind: parsed.kind, id: parsed.id, baseRevision: 0, baseHash: "", state: "conflict" };
         state.links[key] = link;
         const cloudAlive = Boolean(snapshot && remote && !remote.deleted);
         if (choice === "local" || !cloudAlive) {
            // Explicit overwrite of the cloud head with this device's version.
            if (cloudAlive) { link.baseRevision = remote!.revision; link.baseHash = remote!.hash; }
            else { link.baseRevision = 0; link.baseHash = ""; }
            link.state = "pending";
            delete link.conflict;
            adapter.clearConflict(parsed.id);
            return true;
         }
         if (choice === "both" && local) {
            // A browser that refuses the copy (or a one-record kind) must not lose this device's version.
            if (!adapter.createCopy(local.snapshot, `${local.title} (this device)`)) await this.saveRecovery(state, local, "keep-cloud");
         } else if (local) {
            await this.saveRecovery(state, local, "keep-cloud");
         }
         if (adapter.write(parsed.id, snapshot!)) {
            adapter.clearConflict(parsed.id);
            this.agree(state, link, remote!, snapshot!);
         }
         appendJournal(state, { at: new Date(this.clock.now()).toISOString(), event: `resolved-${choice}`, key });
         return false;
      });
      if (upload) await this.exchange("explicit", { explicit: true });
   }

   async resolveMerged(key: RecordKey, snapshot: SyncSnapshot): Promise<void> {
      await this.replaceAndUpload(key, snapshot, "merge");
   }

   async promote(key: RecordKey, snapshot: SyncSnapshot): Promise<void> {
      await this.replaceAndUpload(key, snapshot, "restore");
   }

   /** Write `snapshot` locally (keeping a recovery copy) and upload it over the current cloud head. */
   private async replaceAndUpload(key: RecordKey, snapshot: SyncSnapshot, reason: RecoveryEntry["reason"]): Promise<void> {
      await this.mutate(async state => {
         const parsed = parseRecordKey(key);
         if (!parsed) return;
         const adapter = this.deps.adapters[parsed.kind];
         const local = adapter.get(parsed.id);
         if (local) await this.saveRecovery(state, local, reason);
         await this.remoteSnapshot(state, key);
         const remote = state.remote[key];
         if (!adapter.write(parsed.id, snapshot)) throw new Error("This browser refused to save the record.");
         adapter.clearConflict(parsed.id);
         const link: RecordLink = state.links[key] ?? { kind: parsed.kind, id: parsed.id, baseRevision: 0, baseHash: "", state: "pending" };
         link.baseRevision = remote && !remote.deleted ? remote.revision : 0;
         link.baseHash = remote && !remote.deleted ? remote.hash : "";
         link.state = "pending";
         delete link.conflict;
         state.links[key] = link;
         appendJournal(state, { at: new Date(this.clock.now()).toISOString(), event: reason === "merge" ? "resolved-merge" : "promoted-checkpoint", key });
      });
      await this.exchange("explicit", { explicit: true });
   }

   async compare(key: RecordKey) {
      const parsed = parseRecordKey(key);
      if (!parsed) return { local: null, cloud: null, base: null };
      return this.mutate(async state => ({
         local: this.deps.adapters[parsed.kind].get(parsed.id)?.snapshot ?? null,
         cloud: await this.remoteSnapshot(state, key),
         base: await this.deps.blobs.get(this.blobKey("base", parsed.kind, parsed.id)),
      }));
   }

   async history(key: RecordKey): Promise<CloudHistoryDto> {
      const parsed = parseRecordKey(key);
      if (!parsed) throw new Error("Unknown record");
      return this.deps.fetchHistory(parsed.kind, parsed.id);
   }

   async restoreAsCopy(key: RecordKey, snapshot: SyncSnapshot): Promise<string | null> {
      const parsed = parseRecordKey(key);
      if (!parsed) return null;
      return this.mutate(async state => {
         const id = this.deps.adapters[parsed.kind].createCopy(snapshot, `${snapshot.title} (restored)`);
         appendJournal(state, { at: new Date(this.clock.now()).toISOString(), event: "restored-as-copy", key, detail: id ?? "refused" });
         return id;
      });
   }

   async restoreRecovery(entry: RecoveryEntry): Promise<string | null> {
      const snapshot = await this.deps.blobs.get(entry.blobKey);
      if (!snapshot) return null;
      return this.deps.adapters[entry.kind].createCopy(snapshot, `${entry.title} (recovered)`);
   }

   // ----------------------------------------------------------------------------------------------
   // View
   // ----------------------------------------------------------------------------------------------

   private invalidateView(): void {
      if (this.viewPending) { this.viewStale = true; return; }
      this.viewPending = this.computeView().then(view => {
         this.viewCache = view;
         for (const listener of this.listeners) listener(view);
         this.watchOwed(view);
         return view;
      }).finally(() => {
         this.viewPending = null;
         if (this.viewStale) { this.viewStale = false; this.invalidateView(); }
      });
   }

   private viewStale = false;

   /** Resolves with the next computed view (tests and the UI after an action). */
   async refreshView(): Promise<EngineView> {
      this.invalidateView();
      while (this.viewPending) await this.viewPending;
      return this.viewCache!;
   }

   private async computeView(): Promise<EngineView> {
      const state = this.deps.store.load();
      const rows = new Map<RecordKey, SyncRecordView>();
      const locals = new Map<RecordKey, LocalRecord>();
      for (const kind of SYNC_KINDS) for (const local of this.deps.adapters[kind].list()) locals.set(recordKey(kind, local.id), local);
      const keys = new Set<RecordKey>([...locals.keys(), ...(Object.keys(state.links) as RecordKey[]),
         ...(Object.entries(state.remote) as Array<[RecordKey, RemoteEntry]>).filter(([, remote]) => !remote.deleted).map(([key]) => key)]);
      let conflictCount = 0;
      let pendingCount = 0;
      for (const key of keys) {
         const parsed = parseRecordKey(key)!;
         const local = locals.get(key);
         const link = state.links[key];
         const remote = state.remote[key] && !state.remote[key]!.deleted ? state.remote[key] : undefined;
         const localHash = local ? await hashSnapshot(local.snapshot) : null;
         let status: RecordStatus;
         let message: string | undefined;
         if (link) {
            if (link.state === "conflict") status = "conflict";
            else if (isOverLimit(link)) { status = "over-limit"; message = link.error?.message; }
            else if (link.state === "blocked") { status = "blocked"; message = link.error?.message; }
            else if (link.state === "error") { status = "error"; message = link.error?.message; }
            else if (link.state === "cloud-removed") status = "cloud-removed";
            else if (!local) status = "local-missing";
            else if (state.outbox[key]) status = "pending";
            else if (localHash !== link.baseHash) status = "modified";
            else if (remote && remote.revision !== link.baseRevision) status = "behind";
            else status = "synced";
         } else if (local && remote) {
            status = localHash === remote.hash ? "synced" : "conflict";
            if (status === "conflict") message = "This device and the cloud hold different versions";
         } else if (local) {
            status = "local-only";
            if (state.optOut[key]) message = "Syncing was stopped for this record on this device";
         } else {
            status = "cloud-only";
         }
         if (status === "conflict") conflictCount += 1;
         if (status === "pending" || status === "modified") pendingCount += 1;
         rows.set(key, {
            key, kind: parsed.kind, id: parsed.id, title: local?.title ?? remote?.title ?? parsed.id, status, linked: Boolean(link),
            localUpdatedAt: local?.updatedAt, cloudUpdatedAt: remote?.updatedAt, cloudRevision: remote?.revision,
            baseRevision: link?.baseRevision, bytes: local ? snapshotBytes(local.snapshot) : remote?.bytes,
            checkpointCount: remote?.checkpointCount, message, ...(state.optOut[key] ? { optedOut: true } : {}),
         });
      }
      const offline = this.deps.online ? !this.deps.online() : false;
      const status: EngineStatus = !this.started ? "disabled"
         : this.halted ?? (offline ? "offline" : this.running > 0 ? "syncing" : state.lastError && state.failures > 0 ? "error" : "idle");
      const scheduled = ["flush", "retry", "pull", "reconnect"].some(name => this.timers[name as keyof typeof this.timers] !== null);
      const retryAt = state.backoffUntil && state.backoffUntil > this.clock.now() ? new Date(state.backoffUntil).toISOString() : null;
      const automatic = new Set(this.automaticKinds(state));
      const kinds = Object.fromEntries(SYNC_KINDS.map(kind => [kind, {
         mode: state.modes[kind] === "selected" ? "selected" : "auto",
         consented: kindConsentGranted(state.consent, kind),
         automatic: automatic.has(kind),
      } satisfies KindSyncView])) as Record<SyncKind, KindSyncView>;
      return {
         status, leader: this.leader, leaderTab: this.leaderTab, retryAt,
         activity: this.running > 0 ? "running" : scheduled ? "scheduled" : "idle",
         push: this.deps.createPush ? this.pushStatus : "unavailable",
         lastSyncAt: state.lastSyncAt, lastError: state.lastError, pendingCount, conflictCount,
         quota: state.quota, consent: state.consent, retentionConfigured: state.retentionConfigured,
         records: [...rows.values()], recovery: [...state.recovery], metrics: state.metrics, kinds,
      };
   }
}
