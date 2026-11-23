import { describe, expect, it } from "vitest";
import { SimClock, SimDevice, SimServer, flush } from "../helpers/cloud-sync-sim";
import type { RecordKey } from "../../app/utils/cloudSync/contracts";
import { presentRecord, owedCount } from "../../app/utils/cloudSync/syncPresentation";
import { describeSyncStatus } from "../../app/utils/cloudSync/statusLabel";

/**
 * Several tabs of one browser profile: one tab (the leader) syncs for all of them, the others are followers.
 * The production symptom was nine records stuck as "Only on this device" on Automatic with "Last synced" never
 * moving while the leader lock sat with a tab that did not sync (an older bundle, or one that stopped
 * answering). A follower must neither look final nor wait forever.
 */
const OWNER = "clerk:user_follower";
const session = (id: string) => `session:${id}` as RecordKey;

async function silentLeader() {
   const clock = new SimClock();
   const server = new SimServer(clock);
   const device = new SimDevice(server, OWNER, "device");
   const release = await device.holdLeadership();
   const tab = await device.openTab();
   await clock.advance(1_000);
   return { clock, server, device, tab, release };
}

async function healthyLeader() {
   const clock = new SimClock();
   const server = new SimServer(clock);
   const device = new SimDevice(server, OWNER, "device");
   const leader = await device.openTab();
   const follower = await device.openTab();
   await clock.advance(3_000);
   return { clock, server, device, leader, follower };
}

const statusOf = async (tab: { engine: { refreshView(): Promise<any> } }, id: string) =>
   (await tab.engine.refreshView()).records.find((record: { key: string }) => record.key === session(id))?.status;

describe("a tab behind a leader that never answers (an older bundle, or a tab that stopped)", () => {
   it("does not look final while it waits: records read as syncing, never as 'On this device only'", async () => {
      const { clock, device, tab } = await silentLeader();
      for (let index = 0; index < 9; index += 1) device.editSession(`s${index}`, `# Session ${index}`);
      const view = await tab.engine.refreshView();
      expect(view.leader).toBe(false);
      const labels = view.records.map(record => presentRecord(view, record).label);
      expect(labels).toHaveLength(9);
      expect(new Set(labels)).toEqual(new Set(["Syncing in another tab"]));
      expect(describeSyncStatus(view, clock.now())?.label).toBe("Syncing in another tab");
   });

   it("asks who leads, takes the leadership when nobody answers, and syncs every record", async () => {
      const { clock, server, device, tab } = await silentLeader();
      for (let index = 0; index < 9; index += 1) device.editSession(`s${index}`, `# Session ${index}`);
      await clock.advance(20_000);
      expect(tab.engine.view?.leader).toBe(true);
      expect((await server.repo.list(OWNER)).length).toBe(9);
      const view = await tab.engine.refreshView();
      expect(view.records.filter(record => record.status === "synced")).toHaveLength(9);
      expect(view.lastSyncAt).not.toBeNull();
      expect(view.leaderTab).toBe("this");
      expect(view.quota?.kinds?.session).toMatchObject({ limit: 20, used: 9 });
      expect(owedCount(view)).toBe(0);
      expect(server.requests.length).toBeLessThanOrEqual(3);
   });

   it("takes over even when nothing is owed, so a stale saved quota and consent are refreshed", async () => {
      const { clock, server, tab } = await silentLeader();
      await clock.advance(20_000);
      expect(tab.engine.view?.leader).toBe(true);
      expect(server.requests).toHaveLength(1);
      expect((await tab.engine.refreshView()).consent).not.toBeNull();
   });

   it("shows the takeover while it is in progress instead of a resting label", async () => {
      const { clock, device, tab } = await silentLeader();
      device.editSession("s1", "# One");
      await clock.advance(4_000); // asked, not yet given up on
      await clock.advance(3_000); // gave up on the silent tab
      const view = await tab.engine.refreshView();
      expect(["silent", "this"]).toContain(view.leaderTab);
      expect(presentRecord(view, view.records[0]!).label).not.toBe("On this device only");
   });

   it("an upgrade-era saved quota (one shared total of ten) does not mark records over limit before the first answer", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const device = new SimDevice(server, OWNER, "device");
      const first = await device.openTab();
      for (let index = 0; index < 10; index += 1) device.editSession(`s${index}`, `# Session ${index}`);
      await clock.advance(20_000);
      first.close();
      const key = Array.from({ length: device.storage.length }, (_, index) => device.storage.key(index)!).find(name => name.startsWith("cv-sv:cloud-sync:v1:"))!;
      const saved = JSON.parse(device.storage.getItem(key)!);
      delete saved.modes; delete saved.optOut; delete saved.quotaAt;
      saved.quota = { limit: 10, used: 10, remaining: 0, byKind: { session: 10 } };
      device.storage.setItem(key, JSON.stringify(saved));
      for (let index = 10; index < 19; index += 1) device.editSession(`s${index}`, `# Session ${index}`);
      server.requests.length = 0;
      const tab = await device.openTab();
      // Before the first response arrives nothing may be judged against the stale total.
      const states: string[] = [];
      tab.engine.subscribe(view => { for (const record of view.records) if (record.status === "over-limit") states.push(record.key); });
      await clock.advance(20_000);
      expect(states).toEqual([]);
      expect((await server.repo.list(OWNER)).length).toBe(19);
    });
});

describe("a tab whose leader is an older bundle that still answers", () => {
   it("takes the leadership from it, and the older tab follows and leads again when the new one closes", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const device = new SimDevice(server, OWNER, "device");
      const older = await device.openTab({ generation: 1 });
      await clock.advance(3_000);
      expect(older.engine.view?.leader).toBe(true);
      const newer = await device.openTab();
      await clock.advance(10_000);
      expect(newer.engine.view?.leader).toBe(true);
      expect(older.engine.view?.leader).toBe(false);
      expect(older.engine.view?.leaderTab).toBe("other");
      // The older tab no longer runs timers: an edit is uploaded once, by the new leader.
      server.requests.length = 0;
      device.editSession("s1", "# One");
      await clock.advance(15_000);
      expect(server.requests).toHaveLength(1);
      expect((await server.repo.get(OWNER, "session", "s1"))?.headRevision).toBe(1);
      // When the new tab goes away the older one leads again.
      newer.close();
      await clock.advance(5_000);
      expect(older.engine.view?.leader).toBe(true);
    });

   it("a tab never takes the leadership from a newer bundle", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const device = new SimDevice(server, OWNER, "device");
      const newer = await device.openTab({ generation: 9 });
      await clock.advance(3_000);
      const older = await device.openTab({ generation: 1 });
      await clock.advance(60_000);
      expect(newer.engine.view?.leader).toBe(true);
      expect(older.engine.view?.leader).toBe(false);
      expect(older.engine.view?.leaderTab).toBe("other");
    });
});

describe("a follower behind a healthy leader", () => {
   it("never steals, never asks the server, and shows 'Syncing in another tab' until the leader has uploaded", async () => {
      const { clock, server, device, follower } = await healthyLeader();
      expect(follower.engine.view).toMatchObject({ leader: false, leaderTab: "other" });
      const before = server.requests.length;
      device.editSession("s1", "# Written in the follower tab", undefined, 1);
      const view = await follower.engine.refreshView();
      expect(presentRecord(view, view.records.find(record => record.key === session("s1"))!)).toMatchObject({ phase: "syncing", label: "Syncing in another tab" });
      await clock.advance(15_000);
      expect(server.requests.length - before).toBe(1);
      expect(await statusOf(follower, "s1")).toBe("synced");
      expect(follower.engine.view?.leader).toBe(false);
      expect(describeSyncStatus(await follower.engine.refreshView(), clock.now())?.label).toBe("In your cloud");
   });

   it("an idle follower costs nothing for hours", async () => {
      const { clock, server } = await healthyLeader();
      const before = server.requests.length;
      await clock.advance(6 * 3_600_000);
      expect(server.requests.length - before).toBe(0);
   });

   it("asks the leader to sync work it still sees unsynced after a minute, and the leader sends nothing when nothing is owed", async () => {
      const { clock, server, device, leader, follower } = await healthyLeader();
      // A record the leader was never told about (its storage event was lost); only the follower noticed.
      device.storage.setItem("cv-sv:session-backup:missed", JSON.stringify({ markdown: "# Missed", css: "", title: "Missed", revision: 1, pending: false, savedAt: clock.now() }));
      follower.engine.notifyLocalChange({ kind: "session", id: "missed", origin: "local" });
      await clock.advance(30_000);
      expect(await server.repo.get(OWNER, "session", "missed")).toBeNull(); // still waiting, honestly labelled
      expect((await follower.engine.refreshView()).records[0]).toMatchObject({ status: "local-only" });
      await clock.advance(45_000);
      expect((await server.repo.get(OWNER, "session", "missed"))?.headRevision).toBe(1);
      expect(leader.engine.view?.leader).toBe(true);
      // Asking again with nothing owed costs no request.
      const before = server.requests.length;
      follower.engine["deps"].coordinator.broadcast({ type: "sync-request" });
      await clock.advance(10_000);
      expect(server.requests.length - before).toBe(0);
    });

   it("two followers that both give up on a silent leader end with exactly one leader", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const device = new SimDevice(server, OWNER, "device");
      await device.holdLeadership();
      const a = await device.openTab();
      const b = await device.openTab();
      await clock.advance(30_000);
      expect([a, b].filter(tab => tab.engine.view?.leader)).toHaveLength(1);
      const requests = server.requests.length;
      await clock.advance(10 * 60_000);
      expect(server.requests.length - requests).toBeLessThanOrEqual(1);
      await flush();
    });
});
