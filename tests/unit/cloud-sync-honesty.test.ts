import { describe, expect, it } from "vitest";
import { SimClock, SimDevice, SimServer } from "../helpers/cloud-sync-sim";
import type { RecordKey } from "../../app/utils/cloudSync/contracts";
import { presentRecord } from "../../app/utils/cloudSync/syncPresentation";
import { describeSyncStatus } from "../../app/utils/cloudSync/statusLabel";
import { SyncHttpError } from "../../app/utils/cloudSync/types";

/** The status the user sees must be the truth: a failure is named, a wait has a reason, nothing stays "Syncing" for ever. */
const OWNER = "clerk:user_honest";
const session = (id: string) => `session:${id}` as RecordKey;

async function world() {
   const clock = new SimClock();
   const server = new SimServer(clock);
   const device = new SimDevice(server, OWNER, "device");
   const tab = await device.openTab();
   await clock.advance(2_000);
   return { clock, server, device, tab };
}

describe("an exchange that breaks on something other than the network", () => {
   it("is reported as 'Sync failed' with the cause, backs off, and recovers on the next success", async () => {
      const { clock, server, device, tab } = await world();
      device.editSession("s1", "# One");
      const original = device.blobs.set.bind(device.blobs);
      let broken = true;
      device.blobs.set = async (key, value) => { if (broken) throw new Error("the snapshot store is unreadable"); return original(key, value); };
      await clock.advance(15_000);
      const failed = await tab.engine.refreshView();
      expect(failed.status).toBe("error");
      expect(failed.lastError).toMatchObject({ code: "SYNC_INTERNAL" });
      expect(failed.lastError?.message).toContain("the snapshot store is unreadable");
      expect(describeSyncStatus(failed, clock.now())).toMatchObject({ tone: "danger", label: "Sync failed" });
      expect(failed.retryAt).not.toBeNull();
      broken = false;
      await tab.engine.syncNow();
      await clock.advance(5_000);
      const healed = await tab.engine.refreshView();
      expect(healed.status).toBe("idle");
      expect(healed.lastError).toBeNull();
      expect(healed.records.find(record => record.key === session("s1"))?.status).toBe("synced");
      expect((await server.repo.get(OWNER, "session", "s1"))?.headRevision).toBe(1);
   });
});

describe("a failed sync is a visible wait, not a resting label", () => {
   it("shows the retry, labels owed records 'Waiting for sync', and Sync now goes through the backoff", async () => {
      const { clock, server, device, tab } = await world();
      server.refuse = new SyncHttpError(500, "Internal server error");
      device.editSession("s1", "# One");
      await clock.advance(15_000);
      const view = await tab.engine.refreshView();
      expect(view.status).toBe("error");
      expect(view.retryAt).not.toBeNull();
      expect(presentRecord(view, view.records[0]!)).toMatchObject({ phase: "waiting", label: "Waiting for sync", reason: expect.stringContaining("failed") });
      expect(describeSyncStatus(view, clock.now())).toMatchObject({ label: "Sync failed", detail: "Internal server error" });
      server.refuse = null;
      await tab.engine.syncNow();
      await clock.advance(5_000);
      const healed = await tab.engine.refreshView();
      expect(healed.records[0]?.status).toBe("synced");
      expect(healed.retryAt).toBeNull();
   });

   it("the backoff survives a reload, and is visible in the reloaded tab", async () => {
      const { clock, server, device, tab } = await world();
      server.refuse = new SyncHttpError(500, "Internal server error");
      device.editSession("s1", "# One");
      await clock.advance(15_000);
      tab.close();
      const reloaded = await device.openTab();
      await clock.advance(2_000);
      const view = await reloaded.engine.refreshView();
      expect(view.retryAt).not.toBeNull();
      expect(view.status).toBe("error");
      expect(presentRecord(view, view.records[0]!).phase).toBe("waiting");
   });
});

describe("offline", () => {
   it("an offline device says so before any attempt, and its owed records wait with that reason", async () => {
      const { clock, device, tab } = await world();
      device.online = false;
      device.editSession("s1", "# One");
      const view = await tab.engine.refreshView();
      expect(view.status).toBe("offline");
      expect(presentRecord(view, view.records[0]!)).toMatchObject({ phase: "waiting", reason: expect.stringContaining("offline") });
      expect(describeSyncStatus(view, clock.now())).toMatchObject({ label: "Offline", detail: "1 change waiting" });
   });
});

describe("the view says who syncs and what is happening", () => {
   it("a leader reports itself, running, scheduled and idle", async () => {
      const { clock, device, tab } = await world();
      expect(tab.engine.view).toMatchObject({ leader: true, leaderTab: "this", activity: "idle", retryAt: null });
      device.editSession("s1", "# One");
      expect((await tab.engine.refreshView()).activity).toBe("scheduled");
      await clock.advance(15_000);
      expect((await tab.engine.refreshView()).activity).toBe("idle");
   });
});
