import type { PushChannel, PushChannelEvents, PushStatus } from "./contracts";

/**
 * Browser side of the push channel: a WebSocket to the sync hub that only carries compact
 * invalidations ({"t":"changed","cursor":n} / {"t":"hello","cursor":n}). Record content is
 * always fetched through the authenticated sync route, so push is an optimisation, never the
 * source of truth. The server answers our "ping" with plain-text "pong" (see sync-hub.ts).
 */

/** Clock the channel uses for heartbeats, pong timeouts and reconnect backoff. */
export interface PushClock {
   now(): number;
   setTimeout(fn: () => void, ms: number): unknown;
   clearTimeout(handle: unknown): void;
}

/** Minimal WebSocket surface the channel needs; the browser WebSocket satisfies it. */
export interface WebSocketLike {
   readonly readyState: number;
   send(data: string): void;
   close(code?: number, reason?: string): void;
   addEventListener(type: "open" | "message" | "close" | "error", listener: (event: any) => void): void;
}

export const PUSH_HEARTBEAT_MS = 60_000;
export const PUSH_PONG_TIMEOUT_MS = 15_000;
export const PUSH_TICKET_REUSE_MS = 4 * 60_000;
export const PUSH_MAX_FAILED_CONNECTS = 4;

const RECONNECT_BASE_MS = 1000;
const RECONNECT_CAP_MS = 60_000;
const JITTER_MIN = 0.7;
const JITTER_SPAN = 0.6;

/** Resolve a push URL against the origin, switch http(s) to ws(s), and attach the ticket. */
export function pushSocketUrl(origin: string, url: string, ticket: string): string {
   const resolved = new URL(url, origin);
   resolved.protocol = resolved.protocol === "https:" || resolved.protocol === "wss:" ? "wss:" : "ws:";
   resolved.searchParams.set("ticket", ticket);
   return resolved.href;
}

export function createPushChannel(events: PushChannelEvents, deps: {
   createSocket: (url: string) => WebSocketLike;
   clock: PushClock;
   random?: () => number;
   origin: string;
}): PushChannel {
   const clock = deps.clock;
   const random = deps.random ?? Math.random;
   let status: PushStatus = "idle";
   let socket: WebSocketLike | null = null;
   let socketOpened = false;
   let userClosed = false;
   let url = "";
   let ticket = "";
   let ticketReceivedAt = 0;
   let failedConnects = 0;
   // Consecutive unexpected closes. Deliberately not reset by a successful open: with
   // PUSH_MAX_FAILED_CONNECTS stopping reconnects after 4 never-opened sockets, a backoff
   // reset on open would make the 60 s cap unreachable (delays would only ever be 1/2/4 s).
   // An explicit connect() or close() starts a fresh sequence.
   let backoffAttempt = 0;
   let heartbeatHandle: unknown = null;
   let pongHandle: unknown = null;
   let reconnectHandle: unknown = null;

   const clearTimer = (handle: unknown) => { if (handle !== null) clock.clearTimeout(handle); };
   const clearHeartbeat = () => { clearTimer(heartbeatHandle); heartbeatHandle = null; };
   const clearPong = () => { clearTimer(pongHandle); pongHandle = null; };
   const clearReconnect = () => { clearTimer(reconnectHandle); reconnectHandle = null; };
   const clearSocketTimers = () => { clearHeartbeat(); clearPong(); };

   const setStatus = (next: PushStatus) => {
      if (status === next) return;
      status = next;
      events.onStatus(next);
   };

   const scheduleReconnect = () => {
      const base = Math.min(RECONNECT_BASE_MS * 2 ** backoffAttempt, RECONNECT_CAP_MS);
      backoffAttempt += 1;
      const delay = base * (JITTER_MIN + random() * JITTER_SPAN);
      reconnectHandle = clock.setTimeout(() => {
         reconnectHandle = null;
         if (userClosed) return;
         setStatus("connecting");
         openSocket();
      }, delay);
   };

   function handleSocketClose(current: WebSocketLike, code: number): void {
      if (socket !== current) return;
      socket = null;
      clearSocketTimers();
      if (userClosed) return;
      // Replaced by a newer connection of this device, or evicted for too many connections:
      // the hub has already decided for us, so stay idle and never reconnect.
      if (code === 4000 || code === 4001) { setStatus("idle"); return; }
      if (!socketOpened) {
         failedConnects += 1;
         if (failedConnects >= PUSH_MAX_FAILED_CONNECTS) { setStatus("unavailable"); return; }
      }
      setStatus("down");
      if (clock.now() - ticketReceivedAt >= PUSH_TICKET_REUSE_MS) { events.onNeedsTicket(); return; }
      scheduleReconnect();
   }

   function handleConnectFailed(): void {
      socket = null;
      failedConnects += 1;
      if (failedConnects >= PUSH_MAX_FAILED_CONNECTS) { setStatus("unavailable"); return; }
      setStatus("down");
      if (clock.now() - ticketReceivedAt >= PUSH_TICKET_REUSE_MS) { events.onNeedsTicket(); return; }
      scheduleReconnect();
   }

   const armPongTimeout = (current: WebSocketLike) => {
      clearPong();
      pongHandle = clock.setTimeout(() => {
         pongHandle = null;
         if (socket !== current) return;
         try { current.close(); } catch { /* already closed */ }
         if (socket === current) handleSocketClose(current, 1006);
      }, PUSH_PONG_TIMEOUT_MS);
   };

   const sendPing = () => {
      const current = socket;
      if (!current) return;
      try {
         current.send("ping");
      } catch {
         try { current.close(); } catch { /* already closed */ }
         if (socket === current) handleSocketClose(current, 1006);
         return;
      }
      events.onMetric?.("ping");
      armPongTimeout(current);
      heartbeatHandle = clock.setTimeout(sendPing, PUSH_HEARTBEAT_MS);
   };

   const startHeartbeat = () => {
      clearHeartbeat();
      heartbeatHandle = clock.setTimeout(sendPing, PUSH_HEARTBEAT_MS);
   };

   function openSocket(): void {
      socketOpened = false;
      let current: WebSocketLike;
      try {
         current = deps.createSocket(pushSocketUrl(deps.origin, url, ticket));
      } catch {
         handleConnectFailed();
         return;
      }
      socket = current;
      current.addEventListener("open", () => {
         if (socket !== current) return;
         socketOpened = true;
         failedConnects = 0;
         setStatus("connected");
         events.onMetric?.("connect");
         startHeartbeat();
      });
      current.addEventListener("message", (event: any) => {
         if (socket !== current) return;
         events.onMetric?.("message");
         clearPong();
         const raw = typeof event === "string" ? event : event?.data;
         if (typeof raw !== "string") return;
         if (raw === "pong") return;
         let parsed: any;
         try { parsed = JSON.parse(raw); } catch { return; }
         if (!parsed || typeof parsed !== "object") return;
         if (parsed.t !== "changed" && parsed.t !== "hello") return;
         if (typeof parsed.cursor !== "number" || !Number.isSafeInteger(parsed.cursor)) return;
         events.onChanged(parsed.cursor);
      });
      current.addEventListener("close", (event: any) => {
         if (socket !== current) return;
         const code = typeof event?.code === "number" ? event.code : 1006;
         handleSocketClose(current, code);
      });
      // A socket error is always followed by a close; the close handler owns the recovery.
      current.addEventListener("error", () => {});
   }

   const channel: PushChannel = {
      get status() { return status; },
      connect(nextUrl: string, nextTicket: string) {
         userClosed = false;
         clearReconnect();
         if (socket) {
            const old = socket;
            socket = null;
            clearSocketTimers();
            try { old.close(1000); } catch { /* already closed */ }
         }
         url = nextUrl;
         ticket = nextTicket;
         ticketReceivedAt = clock.now();
         failedConnects = 0;
         backoffAttempt = 0;
         setStatus("connecting");
         openSocket();
      },
      close() {
         userClosed = true;
         clearSocketTimers();
         clearReconnect();
         if (socket) {
            const current = socket;
            socket = null;
            try { current.close(1000); } catch { /* already closed */ }
         }
         setStatus("idle");
      },
   };
   return channel;
}
