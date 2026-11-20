import { writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { SimClock, SimDevice, SimServer } from "../helpers/cloud-sync-sim";
import type { RecordKey } from "../../app/utils/cloudSync/contracts";
import { summarizeMetrics } from "../../app/utils/cloudSync/state";

/**
 * Request-budget scenarios: the real engine, adapters, coordinator and push client against the real
 * core sync handler under simulated time. Counts are measured, not estimated. Set SYNC_BUDGET_REPORT to
 * a file path to write the measurements as JSON.
 */
const OWNER = "clerk:user_budget";
const HOUR = 3_600_000;
const results: Record<string, Record<string, number>> = {};
afterAll(() => { if (process.env.SYNC_BUDGET_REPORT) writeFileSync(process.env.SYNC_BUDGET_REPORT, JSON.stringify(results, null, 2)); });

async function setup(devices: number, options: { tabs?: number; push?: boolean; linked?: number } = {}) {
   const clock = new SimClock();
   const server = new SimServer(clock);
   server.pushEnabled = options.push ?? true;
   const list: SimDevice[] = [];
   for (let index = 0; index < devices; index += 1) {
      const device = new SimDevice(server, OWNER, `d${index}`);
      for (let tab = 0; tab < (options.tabs ?? 1); tab += 1) await device.openTab();
      list.push(device);
   }
   await clock.advance(2_000);
   const keys: RecordKey[] = [];
   const first = list[0]!;
   for (let index = 0; index < (options.linked ?? 0); index += 1) {
      first.editSession(`s${index}`, `content ${index}`);
      keys.push(`session:s${index}` as RecordKey);
   }
   if (keys.length) await first.leader!.upload(keys);
   for (const other of list.slice(1)) if (keys.length) await other.leader!.download(keys);
   await clock.advance(5_000);
   return { clock, server, devices: list, keys, mark: () => server.requests.length };
}

const pingsIn = (device: SimDevice, from: number, to: number) => summarizeMetrics(device.storageState(), from, to).pushPings;

declare module "../helpers/cloud-sync-sim" { interface SimDevice { storageState(): any } }
SimDevice.prototype.storageState = function (this: SimDevice) {
   for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index)!;
      if (key.startsWith("cv-sv:cloud-sync:v1:") && !key.endsWith(":corrupt")) return JSON.parse(this.storage.getItem(key)!);
   }
   return { metrics: {} };
};

describe("cloud sync request budget (measured)", () => {
   it("idle account for one hour with healthy push: zero HTTP requests", async () => {
      const { clock, server, devices: [a], mark } = await setup(1, { linked: 3 });
      const before = mark();
      const start = clock.now();
      await clock.advance(HOUR);
      const requests = server.requests.length - before;
      results["idle 1h, push healthy"] = { httpRequests: requests, wsPings: pingsIn(a!, start, clock.now()) };
      expect(requests).toBe(0);
   });

   it("idle account for one hour without push (node deployment): fallback reconciliation only", async () => {
      const { clock, server, mark } = await setup(1, { linked: 3, push: false });
      const before = mark();
      await clock.advance(HOUR);
      const requests = server.requests.length - before;
      results["idle 1h, no push"] = { httpRequests: requests };
      expect(requests).toBeLessThanOrEqual(2);
   });

   it("twenty records edited rapidly: one batched request", async () => {
      const { clock, server, devices: [a], mark } = await setup(1, { linked: 10 });
      const before = mark();
      for (let index = 0; index < 20; index += 1) { a!.editSession(`s${index}`, `rapid edit ${index}`); await clock.advance(200); }
      await clock.advance(60_000);
      const sent = server.requests.slice(before);
      results["20 records edited rapidly (10 selected)"] = { httpRequests: sent.length, mutations: sent.reduce((sum, r) => sum + r.mutations, 0) };
      expect(sent).toHaveLength(1);
      expect(sent[0]!.mutations).toBe(10);
   });

   it("five tabs under one account cost the same as one tab", async () => {
      const { clock, server, devices: [a], mark } = await setup(1, { tabs: 5, linked: 2 });
      const opened = server.requests.length;
      const before = mark();
      a!.editSession("s0", "edited in tab 3", undefined, 3);
      await clock.advance(HOUR);
      const requests = server.requests.length - before;
      results["5 tabs, 1 edit, 1h"] = { httpRequests: requests, requestsToOpenFiveTabs: opened, pushSockets: server.socketCount(OWNER) };
      expect(requests).toBe(1);
      expect(server.socketCount(OWNER)).toBe(1);
   });

   it("three devices: one edit costs one upload plus one pull per other device", async () => {
      const { clock, server, devices: [a, b, c], mark } = await setup(3, { linked: 2 });
      const before = mark();
      a!.editSession("s1", "shared edit");
      await clock.advance(20_000);
      const sent = server.requests.slice(before);
      results["3 devices, 1 edit"] = { httpRequests: sent.length, uploader: sent.filter(r => r.device === sent[0]?.device).length };
      expect(sent).toHaveLength(3);
      expect((b!.readSession("s1") as any).markdown).toBe("shared edit");
      expect((c!.readSession("s1") as any).markdown).toBe("shared edit");
      await clock.advance(HOUR);
      results["3 devices, idle hour after"] = { httpRequests: server.requests.length - before - sent.length };
      expect(server.requests.length - before - sent.length).toBe(0);
   });

   it("interrupted push: a dropped socket reconnects without HTTP when nothing was missed", async () => {
      const { clock, server, mark } = await setup(2, { linked: 1 });
      const before = mark();
      server.dropAllSockets();
      await clock.advance(10 * 60_000);
      const requests = server.requests.length - before;
      results["push dropped once, nothing missed"] = { httpRequests: requests, socketsAfter: server.socketCount(OWNER) };
      expect(server.socketCount(OWNER)).toBe(2);
      expect(requests).toBeLessThanOrEqual(2); // a reconnect after the ticket aged out needs one exchange per device
   });

   it("push hub down for an hour: bounded requests", async () => {
      const { clock, server, mark } = await setup(1, { linked: 1 });
      const before = mark();
      server.pushEnabled = false;
      server.dropAllSockets();
      await clock.advance(HOUR);
      const requests = server.requests.length - before;
      results["push hub down 1h"] = { httpRequests: requests };
      expect(requests).toBeLessThanOrEqual(4);
   });

   it("twenty-four hours offline: no requests while offline, one batch when back", async () => {
      const { clock, server, devices: [a], mark } = await setup(1, { linked: 5 });
      a!.online = false;
      const before = mark();
      for (let hour = 0; hour < 24; hour += 1) {
         a!.editSession(`s${hour % 5}`, `offline hour ${hour}`);
         await clock.advance(HOUR);
      }
      const whileOffline = server.requests.length - before;
      a!.online = true;
      a!.leader!.onOnline();
      await clock.advance(30_000);
      const afterOnline = server.requests.length - before - whileOffline;
      const copy = await server.repo.get(OWNER, "session", "s3");
      results["24h offline"] = { attemptsWhileOffline: whileOffline, httpRequestsAfterReconnect: afterOnline };
      expect(server.requests.slice(before, before + whileOffline).filter(r => r.status === 200)).toHaveLength(0);
      expect(afterOnline).toBe(1);
      expect(JSON.parse(copy!.snapshot.content).markdown).toBe("offline hour 23");
   });

   it("re-renders and repeated triggers without content changes send nothing", async () => {
      const { clock, server, devices: [a], mark } = await setup(1, { linked: 2 });
      const before = mark();
      for (let index = 0; index < 50; index += 1) a!.leader!.notifyLocalChange({ kind: "session", id: "s0", origin: "local" });
      await clock.advance(120_000);
      results["50 no-op change notifications"] = { httpRequests: server.requests.length - before };
      expect(server.requests.length - before).toBe(0);
   });
});
