import { describe, expect, it } from "vitest";
import {
   createPushChannel,
   pushSocketUrl,
   PUSH_HEARTBEAT_MS,
   PUSH_PONG_TIMEOUT_MS,
   PUSH_TICKET_REUSE_MS,
   PUSH_MAX_FAILED_CONNECTS,
   type PushClock,
   type WebSocketLike,
} from "../../app/utils/cloudSync/push";
import type { PushChannelEvents, PushStatus } from "../../app/utils/cloudSync/contracts";

class FakeClock implements PushClock {
   nowMs = 1_000_000;
   private nextId = 1;
   private timers = new Map<number, { fn: () => void; at: number }>();
   now() { return this.nowMs; }
   setTimeout(fn: () => void, ms: number) {
      const id = this.nextId++;
      this.timers.set(id, { fn, at: this.nowMs + ms });
      return id;
   }
   clearTimeout(handle: unknown) { this.timers.delete(handle as number); }
   get pending() { return this.timers.size; }
   advance(ms: number) {
      const target = this.nowMs + ms;
      for (;;) {
         let earliestId: number | null = null;
         let earliestAt = Infinity;
         for (const [id, timer] of this.timers) {
            if (timer.at <= target && timer.at < earliestAt) { earliestAt = timer.at; earliestId = id; }
         }
         if (earliestId === null) break;
         const timer = this.timers.get(earliestId)!;
         this.timers.delete(earliestId);
         this.nowMs = timer.at;
         timer.fn();
      }
      this.nowMs = target;
   }
}

class FakeSocket implements WebSocketLike {
   url: string;
   readyState = 0;
   sent: string[] = [];
   closedWith: { code?: number; reason?: string } | null = null;
   private listeners = new Map<string, Array<(event: any) => void>>();
   constructor(url: string) { this.url = url; }
   send(data: string) { this.sent.push(data); }
   close(code?: number, reason?: string) { this.closedWith = { code, reason }; this.readyState = 3; }
   addEventListener(type: "open" | "message" | "close" | "error", listener: (event: any) => void) {
      const list = this.listeners.get(type) ?? [];
      list.push(listener);
      this.listeners.set(type, list);
   }
   emit(type: string, event: any = {}) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
   open() { this.readyState = 1; this.emit("open", {}); }
   receive(data: string) { this.emit("message", { data }); }
   closeFromServer(code = 1006, reason = "") { this.readyState = 3; this.emit("close", { code, reason }); }
}

function setup(randomValue = 0.5) {
   const clock = new FakeClock();
   const sockets: FakeSocket[] = [];
   const changed: number[] = [];
   const statuses: PushStatus[] = [];
   const metrics: string[] = [];
   const needsTicket = { count: 0 };
   const events: PushChannelEvents = {
      onChanged: (cursor) => { changed.push(cursor); },
      onStatus: (status) => { statuses.push(status); },
      onNeedsTicket: () => { needsTicket.count += 1; },
      onMetric: (metric) => { metrics.push(metric); },
   };
   const channel = createPushChannel(events, {
      createSocket: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socket; },
      clock,
      random: () => randomValue,
      origin: "https://ruxt.mashallow.cloud",
   });
   return { clock, sockets, changed, statuses, metrics, needsTicket, channel };
}

const latest = (h: ReturnType<typeof setup>) => h.sockets[h.sockets.length - 1];

/** Advance one heartbeat and answer its ping, so the socket survives the pong timeout. */
function heartbeatWithPong(h: ReturnType<typeof setup>) {
   h.clock.advance(PUSH_HEARTBEAT_MS);
   latest(h).receive("pong");
}

describe("pushSocketUrl", () => {
   it("converts https to wss and http to ws, and resolves relative urls against the origin", () => {
      expect(pushSocketUrl("https://ruxt.mashallow.cloud", "https://ruxt.mashallow.cloud/sync/events", "abc"))
         .toBe("wss://ruxt.mashallow.cloud/sync/events?ticket=abc");
      expect(pushSocketUrl("http://localhost:3000", "http://localhost:3000/sync/events", "t"))
         .toBe("ws://localhost:3000/sync/events?ticket=t");
      expect(pushSocketUrl("https://ruxt.mashallow.cloud", "/sync/events", "t"))
         .toBe("wss://ruxt.mashallow.cloud/sync/events?ticket=t");
      expect(pushSocketUrl("http://localhost:3000", "/sync/events", "t"))
         .toBe("ws://localhost:3000/sync/events?ticket=t");
      expect(pushSocketUrl("https://ruxt.mashallow.cloud", "/sync/events?device=d1", "t"))
         .toBe("wss://ruxt.mashallow.cloud/sync/events?device=d1&ticket=t");
   });
});

describe("push channel", () => {
   it("connects, opens and reports the status sequence", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      expect(h.channel.status).toBe("connecting");
      expect(h.statuses).toEqual(["connecting"]);
      expect(h.sockets).toHaveLength(1);
      expect(h.sockets[0].url).toBe("wss://ruxt.mashallow.cloud/sync/events?ticket=ticket-1");
      h.sockets[0].open();
      expect(h.channel.status).toBe("connected");
      expect(h.statuses).toEqual(["connecting", "connected"]);
      expect(h.metrics).toEqual(["connect"]);
   });

   it("fires onStatus only when the status actually changes", () => {
      const h = setup();
      h.channel.close();
      expect(h.statuses).toEqual([]);
      expect(h.channel.status).toBe("idle");
   });

   it("calls onChanged for changed and hello messages and ignores anything else", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      latest(h).open();
      latest(h).receive(JSON.stringify({ t: "changed", cursor: 7 }));
      latest(h).receive(JSON.stringify({ t: "hello", cursor: 9 }));
      latest(h).receive("pong");
      latest(h).receive(JSON.stringify({ t: "unknown", cursor: 1 }));
      latest(h).receive("not json");
      latest(h).receive(JSON.stringify({ t: "changed" }));
      expect(h.changed).toEqual([7, 9]);
      expect(h.metrics.filter((m) => m === "message")).toHaveLength(6);
   });

   it("pings every heartbeat and stays connected when a pong answers", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      latest(h).open();
      h.clock.advance(PUSH_HEARTBEAT_MS - 1);
      expect(latest(h).sent).toEqual([]);
      h.clock.advance(1);
      expect(latest(h).sent).toEqual(["ping"]);
      expect(h.metrics.filter((m) => m === "ping")).toHaveLength(1);
      latest(h).receive("pong");
      h.clock.advance(PUSH_HEARTBEAT_MS);
      expect(latest(h).sent).toEqual(["ping", "ping"]);
      expect(h.channel.status).toBe("connected");
   });

   it("treats any message, not just pong, as proof the connection is alive", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      latest(h).open();
      h.clock.advance(PUSH_HEARTBEAT_MS);
      expect(latest(h).sent).toEqual(["ping"]);
      latest(h).receive(JSON.stringify({ t: "changed", cursor: 3 }));
      h.clock.advance(PUSH_PONG_TIMEOUT_MS);
      expect(latest(h).closedWith).toBeNull();
      expect(h.channel.status).toBe("connected");
      expect(h.changed).toEqual([3]);
   });

   it("reconnects after a pong timeout closes the dead connection", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      latest(h).open();
      h.clock.advance(PUSH_HEARTBEAT_MS);
      expect(latest(h).sent).toEqual(["ping"]);
      h.clock.advance(PUSH_PONG_TIMEOUT_MS - 1);
      expect(latest(h).closedWith).toBeNull();
      expect(h.channel.status).toBe("connected");
      h.clock.advance(1);
      expect(latest(h).closedWith).not.toBeNull();
      expect(h.channel.status).toBe("down");
      expect(h.sockets).toHaveLength(1);
      h.clock.advance(999);
      expect(h.sockets).toHaveLength(1);
      h.clock.advance(1);
      expect(h.sockets).toHaveLength(2);
      expect(h.channel.status).toBe("connecting");
      expect(latest(h).url).toBe("wss://ruxt.mashallow.cloud/sync/events?ticket=ticket-1");
      latest(h).open();
      expect(h.channel.status).toBe("connected");
      expect(h.metrics.filter((m) => m === "connect")).toHaveLength(2);
   });

   it("grows the backoff 1s, 2s, 4s ... and caps it at 60s", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      for (const delay of [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
         latest(h).open();
         latest(h).closeFromServer(1006);
         expect(h.channel.status).toBe("down");
         const before = h.sockets.length;
         h.clock.advance(delay - 1);
         expect(h.sockets).toHaveLength(before);
         h.clock.advance(1);
         expect(h.sockets).toHaveLength(before + 1);
         expect(h.channel.status).toBe("connecting");
      }
      expect(h.needsTicket.count).toBe(0);
   });

   it("bounds the backoff jitter to [0.7, 1.3] of the base delay", () => {
      const slow = setup(0);
      slow.channel.connect("/sync/events", "ticket-1");
      latest(slow).open();
      latest(slow).closeFromServer(1006);
      slow.clock.advance(699);
      expect(slow.sockets).toHaveLength(1);
      slow.clock.advance(1);
      expect(slow.sockets).toHaveLength(2);
      const fast = setup(1);
      fast.channel.connect("/sync/events", "ticket-1");
      latest(fast).open();
      latest(fast).closeFromServer(1006);
      fast.clock.advance(1299);
      expect(fast.sockets).toHaveLength(1);
      fast.clock.advance(1);
      expect(fast.sockets).toHaveLength(2);
   });

   it("reuses a fresh ticket and asks for a new one once it is older than 4 minutes", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      latest(h).open();
      heartbeatWithPong(h);
      heartbeatWithPong(h);
      heartbeatWithPong(h);
      latest(h).closeFromServer(1006);
      expect(h.channel.status).toBe("down");
      h.clock.advance(1000);
      expect(h.sockets).toHaveLength(2);
      expect(latest(h).url).toContain("ticket=ticket-1");
      latest(h).open();
      heartbeatWithPong(h);
      expect(h.clock.now() - 1_000_000).toBeGreaterThanOrEqual(PUSH_TICKET_REUSE_MS);
      latest(h).closeFromServer(1006);
      expect(h.channel.status).toBe("down");
      expect(h.needsTicket.count).toBe(1);
      h.clock.advance(120_000);
      expect(h.sockets).toHaveLength(2);
      h.channel.connect("/sync/events", "ticket-2");
      expect(h.sockets).toHaveLength(3);
      expect(latest(h).url).toContain("ticket=ticket-2");
      latest(h).open();
      expect(h.channel.status).toBe("connected");
   });

   it("goes unavailable after 4 consecutive failed connects and revives on the next connect()", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      for (const delay of [1000, 2000, 4000]) {
         latest(h).closeFromServer(1006);
         expect(h.channel.status).toBe("down");
         h.clock.advance(delay);
         expect(h.channel.status).toBe("connecting");
      }
      latest(h).closeFromServer(1006);
      expect(h.channel.status).toBe("unavailable");
      expect(h.sockets).toHaveLength(PUSH_MAX_FAILED_CONNECTS);
      h.clock.advance(60_000);
      expect(h.sockets).toHaveLength(PUSH_MAX_FAILED_CONNECTS);
      h.channel.connect("/sync/events", "ticket-9");
      expect(h.sockets).toHaveLength(5);
      expect(h.channel.status).toBe("connecting");
      latest(h).open();
      expect(h.channel.status).toBe("connected");
   });

   it("resets the failed-connect count on a successful open", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      for (const delay of [1000, 2000, 4000]) {
         latest(h).closeFromServer(1006);
         h.clock.advance(delay);
      }
      latest(h).open();
      expect(h.channel.status).toBe("connected");
      latest(h).closeFromServer(1006);
      expect(h.channel.status).toBe("down");
      h.clock.advance(8000);
      for (const delay of [16000, 32000, 60000]) {
         latest(h).closeFromServer(1006);
         expect(h.channel.status).toBe("down");
         h.clock.advance(delay);
      }
      latest(h).closeFromServer(1006);
      expect(h.channel.status).toBe("unavailable");
   });

   it("goes idle without reconnecting on close codes 4000 and 4001", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      latest(h).open();
      latest(h).closeFromServer(4000, "Replaced by a newer connection");
      expect(h.channel.status).toBe("idle");
      h.clock.advance(120_000);
      expect(h.sockets).toHaveLength(1);
      h.channel.connect("/sync/events", "ticket-2");
      latest(h).open();
      latest(h).closeFromServer(4001, "Too many connections");
      expect(h.channel.status).toBe("idle");
      h.clock.advance(120_000);
      expect(h.sockets).toHaveLength(2);
      h.channel.connect("/sync/events", "ticket-3");
      latest(h).closeFromServer(4000);
      expect(h.channel.status).toBe("idle");
      h.clock.advance(120_000);
      expect(h.sockets).toHaveLength(3);
   });

   it("close() leaves no timers, closes with 1000 and never reconnects", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      const first = latest(h);
      first.open();
      h.clock.advance(PUSH_HEARTBEAT_MS);
      h.channel.close();
      expect(h.channel.status).toBe("idle");
      expect(first.closedWith).toEqual({ code: 1000, reason: undefined });
      expect(h.clock.pending).toBe(0);
      first.closeFromServer(1006);
      h.clock.advance(120_000);
      expect(h.sockets).toHaveLength(1);
      expect(h.channel.status).toBe("idle");
      h.channel.connect("/sync/events", "ticket-1");
      latest(h).open();
      latest(h).closeFromServer(1006);
      expect(h.channel.status).toBe("down");
      expect(h.clock.pending).toBe(1);
      h.channel.close();
      expect(h.clock.pending).toBe(0);
      h.clock.advance(120_000);
      expect(h.sockets).toHaveLength(2);
   });

   it("replaces a live connection on a new connect() without triggering reconnect logic", () => {
      const h = setup();
      h.channel.connect("/sync/events", "ticket-1");
      const first = latest(h);
      first.open();
      h.channel.connect("/sync/events", "ticket-2");
      expect(first.closedWith).toEqual({ code: 1000, reason: undefined });
      expect(h.channel.status).toBe("connecting");
      expect(h.statuses).toEqual(["connecting", "connected", "connecting"]);
      expect(latest(h).url).toContain("ticket=ticket-2");
      first.receive(JSON.stringify({ t: "changed", cursor: 99 }));
      first.closeFromServer(1006);
      expect(h.changed).toEqual([]);
      expect(h.channel.status).toBe("connecting");
      latest(h).open();
      expect(h.channel.status).toBe("connected");
      heartbeatWithPong(h);
      heartbeatWithPong(h);
      expect(h.sockets).toHaveLength(2);
   });
});
