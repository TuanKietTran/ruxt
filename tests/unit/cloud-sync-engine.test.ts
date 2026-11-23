import { describe, expect, it } from "vitest";
import { SimClock, SimDevice, SimServer, flush } from "../helpers/cloud-sync-sim";
import { SyncHttpError } from "../../app/utils/cloudSync/types";
import type { RecordKey } from "../../app/utils/cloudSync/contracts";

const OWNER = "clerk:user_alice";
const key = (id: string) => `session:${id}` as RecordKey;

async function world(devices = 1) {
   const clock = new SimClock();
   const server = new SimServer(clock);
   const list: SimDevice[] = [];
   for (let index = 0; index < devices; index += 1) {
      const device = new SimDevice(server, OWNER, `device-${index}`);
      await device.openTab();
      list.push(device);
   }
   await clock.advance(1_000);
   return { clock, server, devices: list };
}

const status = async (device: SimDevice, id: string) => (await device.leader!.refreshView()).records.find(record => record.key === key(id))?.status;

describe("cloud sync engine", () => {
   it("stops, instead of retrying, when the server says the session now belongs to another account, and keeps local data", async () => {
      const { server, clock, devices: [a] } = await world();
      a!.editSession("s1", "v1");
      await a!.leader!.upload([key("s1")]);
      await flush();
      server.refuse = new SyncHttpError(409, "The signed-in account changed", "OWNER_MISMATCH");
      a!.editSession("s1", "edited while the account had changed");
      const before = server.requests.length;
      await clock.advance(15_000);
      expect(server.requests.length).toBe(before + 1);
      // No retry storm: the engine halted until it is restarted for the right account.
      await clock.advance(10 * 60_000);
      expect(server.requests.length).toBe(before + 1);
      expect((await a!.leader!.refreshView()).status).toBe("signed-out");
      expect((a!.readSession("s1") as { markdown: string }).markdown).toBe("edited while the account had changed");
   });

   it("in 'only records I select' mode, does one exchange on start and never uploads unselected local data", async () => {
      const { server, clock, devices: [a] } = await world();
      await a!.leader!.setMode("session", "selected");
      a!.editSession("s1", "# Local only");
      await clock.advance(120_000);
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0]!.mutations).toBe(0);
      expect(await status(a!, "s1")).toBe("local-only");
      expect(server.socketCount()).toBe(1);
   });

   it("uploads a selected session, then batches rapid edits into one request after the quiet period", async () => {
      const { server, clock, devices: [a] } = await world();
      a!.editSession("s1", "v1");
      await a!.leader!.upload([key("s1")]);
      await flush();
      expect(server.requests.at(-1)!.mutations).toBe(1);
      expect(await status(a!, "s1")).toBe("synced");
      const before = server.requests.length;
      for (let edit = 2; edit <= 6; edit += 1) { a!.editSession("s1", `v${edit}`); await clock.advance(1_500); }
      expect(server.requests.length).toBe(before);
      await clock.advance(10_000);
      expect(server.requests.length).toBe(before + 1);
      const copy = await server.repo.get(OWNER, "session", "s1");
      expect(JSON.parse(copy!.snapshot.content).markdown).toBe("v6");
      expect(copy!.headRevision).toBe(2);
   });

   it("never holds an edit back longer than the maximum delay while typing continues", async () => {
      const { server, clock, devices: [a] } = await world();
      a!.editSession("s1", "v0");
      await a!.leader!.upload([key("s1")]);
      const before = server.requests.length;
      for (let second = 0; second < 50; second += 5) { a!.editSession("s1", `typing ${second}`); await clock.advance(5_000); }
      expect(server.requests.length - before).toBe(1);
   });

   it("carries a change to another device through push and applies it when that copy is clean", async () => {
      const { server, clock, devices: [a, b] } = await world(2);
      a!.editSession("s1", "from A");
      await a!.leader!.upload([key("s1")]);
      await clock.advance(3_000);
      // No click: the device with consent downloads it as soon as the cloud tells it about the copy.
      expect(await status(b!, "s1")).toBe("synced");
      expect(b!.readSession("s1")!.markdown).toContain("from A");
      a!.editSession("s1", "A again");
      await clock.advance(12_000);
      const content = b!.readSession("s1") as any;
      expect(content.markdown).toBe("A again");
      expect(content.cloudApplied).toBe(true);
      expect(server.socketCount(OWNER)).toBe(2);
   });

   it("keeps both versions when two devices change the same session, and resolves by keeping both", async () => {
      const { clock, devices: [a, b] } = await world(2);
      a!.editSession("s1", "base");
      await a!.leader!.upload([key("s1")]);
      await clock.advance(3_000);
      await b!.leader!.download([key("s1")]);
      b!.online = false;
      b!.editSession("s1", "B offline edit");
      a!.editSession("s1", "A edit");
      await clock.advance(15_000);
      b!.online = true;
      b!.leader!.onOnline();
      await clock.advance(3_000);
      expect(await status(b!, "s1")).toBe("conflict");
      expect(b!.readSession("s1")!.markdown).toBe("B offline edit");
      await b!.leader!.resolve(key("s1"), "both");
      expect(b!.readSession("s1")!.markdown).toBe("A edit");
      const copies = (await b!.leader!.refreshView()).records.filter(record => record.title.includes("(this device)"));
      expect(copies).toHaveLength(1);
      expect(await status(b!, "s1")).toBe("synced");
   });

   it("keep cloud saves the local version in recovery first; keep local overwrites the cloud explicitly", async () => {
      const { server, clock, devices: [a, b] } = await world(2);
      a!.editSession("s1", "base");
      await a!.leader!.upload([key("s1")]);
      await clock.advance(3_000);
      await b!.leader!.download([key("s1")]);
      b!.online = false;
      b!.editSession("s1", "B text");
      a!.editSession("s1", "A text");
      await clock.advance(15_000);
      b!.online = true;
      b!.leader!.onOnline();
      await clock.advance(3_000);
      await b!.leader!.resolve(key("s1"), "cloud");
      const view = await b!.leader!.refreshView();
      expect(view.recovery).toHaveLength(1);
      expect(b!.readSession("s1")!.markdown).toBe("A text");
      const recovered = await b!.leader!.restoreRecovery(view.recovery[0]!);
      expect(recovered).toBeTruthy();
      expect(b!.readSession(recovered!)!.markdown).toBe("B text");

      a!.online = false;
      a!.editSession("s1", "A offline");
      b!.editSession("s1", "B wins later");
      await clock.advance(15_000);
      a!.online = true;
      a!.leader!.onOnline();
      await clock.advance(3_000);
      expect(await status(a!, "s1")).toBe("conflict");
      await a!.leader!.resolve(key("s1"), "local");
      const copy = await server.repo.get(OWNER, "session", "s1");
      expect(JSON.parse(copy!.snapshot.content).markdown).toBe("A offline");
   });

   it("removing a cloud copy never touches local data on any device", async () => {
      const { clock, devices: [a, b] } = await world(2);
      a!.editSession("s1", "keep me");
      await a!.leader!.upload([key("s1")]);
      await clock.advance(3_000);
      await b!.leader!.download([key("s1")]);
      await a!.leader!.removeFromCloud([key("s1")]);
      await clock.advance(3_000);
      expect(a!.readSession("s1")!.markdown).toBe("keep me");
      expect(b!.readSession("s1")!.markdown).toBe("keep me");
      expect(await status(b!, "s1")).toBe("cloud-removed");
      expect(await status(a!, "s1")).toBe("local-only");
   });

   it("restores a cloud checkpoint as a new local copy without changing the cloud head", async () => {
      const { server, clock, devices: [a] } = await world();
      a!.editSession("s1", "first");
      await a!.leader!.upload([key("s1")]);
      clock.time += 26 * 3_600_000; // next UTC day, so the first version becomes a checkpoint
      a!.editSession("s1", "second");
      await clock.advance(11_000);
      const history = await a!.leader!.history(key("s1"));
      expect(history.checkpoints).toHaveLength(1);
      const id = await a!.leader!.restoreAsCopy(key("s1"), history.checkpoints[0]!.snapshot);
      expect(a!.readSession(id!)!.markdown).toBe("first");
      expect(JSON.parse((await server.repo.get(OWNER, "session", "s1"))!.snapshot.content).markdown).toBe("second");
      await a!.leader!.promote(key("s1"), history.checkpoints[0]!.snapshot);
      expect(JSON.parse((await server.repo.get(OWNER, "session", "s1"))!.snapshot.content).markdown).toBe("first");
      expect(a!.readSession("s1")!.markdown).toBe("first");
   });

   it("blocks uploads without consent and retries them after consent is granted", async () => {
      const { server, clock, devices: [a] } = await world();
      const denied = { policyVersion: "x", retentionConfiguration: null, retentionConfigurationMissing: [], retentionAcknowledgement: { acknowledgedVersion: null, acknowledgedAt: null },
         cloudSessions: { granted: false, changedAt: null }, cloudTemplates: { granted: false, changedAt: null }, cloudProfiles: { granted: false, changedAt: null } };
      server.consent.set(OWNER, denied);
      a!.editSession("s1", "private");
      await a!.leader!.upload([key("s1")]);
      await clock.advance(2_000);
      expect(await status(a!, "s1")).toBe("blocked");
      expect(await server.repo.get(OWNER, "session", "s1")).toBeNull();
      server.consent.set(OWNER, { ...denied, cloudSessions: { granted: true, changedAt: null } });
      await a!.leader!.upload([key("s1")]);
      expect(await status(a!, "s1")).toBe("synced");
   });

   it("retries an unacknowledged upload with the same mutation id after a server failure", async () => {
      const { server, clock, devices: [a] } = await world();
      a!.editSession("s1", "v1");
      server.down = true;
      await a!.leader!.upload([key("s1")]);
      const failed = server.requests.at(-1)!;
      expect(failed.status).toBe(503);
      server.down = false;
      await clock.advance(60_000);
      const copy = await server.repo.get(OWNER, "session", "s1");
      expect(copy?.headRevision).toBe(1);
      expect((await server.repo.load(OWNER)).mutations).toHaveLength(1);
   });
});
