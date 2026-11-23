import { describe, expect, it } from "vitest";
import { SimClock, SimDevice, SimServer, flush, grantedConsent } from "../helpers/cloud-sync-sim";
import type { EngineView, RecordKey } from "../../app/utils/cloudSync/contracts";
import { LOCAL_PROFILES_KEY } from "../../app/utils/localProfiles";
import { JOB_PREFERENCES_KEY } from "../../app/utils/jobSnapshot";

/**
 * Automatic two-way sync: once a kind is consented to and the retention notice is acknowledged, its records
 * sync with no click, in both directions, without ever overwriting or deleting local data.
 */
const OWNER = "clerk:user_auto";
const session = (id: string) => `session:${id}` as RecordKey;
const profile = (id: string) => `profile:${id}` as RecordKey;

async function world(devices = 1, configure: (server: SimServer) => void = () => {}) {
   const clock = new SimClock();
   const server = new SimServer(clock);
   configure(server);
   const list: SimDevice[] = [];
   for (let index = 0; index < devices; index += 1) {
      const device = new SimDevice(server, OWNER, `device-${index}`);
      await device.openTab();
      list.push(device);
   }
   await clock.advance(1_000);
   return { clock, server, devices: list };
}
const view = (device: SimDevice) => device.leader!.refreshView();
const statusOf = async (device: SimDevice, key: RecordKey) => (await view(device)).records.find(record => record.key === key)?.status;
const writeProfile = (device: SimDevice, entries: unknown[]) => device.storage.setItem(LOCAL_PROFILES_KEY, JSON.stringify(entries));
const profileEntry = (id: string, name: string) => ({
   id, label: name, createdAt: 1, updatedAt: 2,
   identity: { fullName: name, headline: "", summary: "", location: "" },
});

describe("automatic upload", () => {
   it("uploads new local records of a consented kind without any selection, and keeps uploading edits", async () => {
      const { server, clock, devices: [a] } = await world();
      a!.editSession("s1", "# One");
      a!.editSession("s2", "# Two");
      await clock.advance(12_000);
      expect((await server.repo.list(OWNER)).map(copy => copy.clientItemId).sort()).toEqual(["s1", "s2"]);
      expect(await statusOf(a!, session("s1"))).toBe("synced");
      a!.editSession("s1", "# One, edited");
      await clock.advance(12_000);
      expect((await server.repo.get(OWNER, "session", "s1"))?.headRevision).toBe(2);
   });

   it("uploads records that already existed in local storage when the device first catches up", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const device = new SimDevice(server, OWNER, "d0");
      device.storage.setItem("cv-sv:session-backup:old", JSON.stringify({ markdown: "# Old", css: "", title: "Old", revision: 3, pending: false, savedAt: 1700000000000 }));
      await device.openTab();
      await clock.advance(3_000);
      expect((await server.repo.get(OWNER, "session", "old"))?.snapshot.title).toBe("Old");
   });

   it("syncs nothing for a kind without consent, or before the retention notice is acknowledged", async () => {
      const unconsented = await world(1, server => server.consent.set(OWNER, grantedConsent(true, { only: ["template"] })));
      unconsented.devices[0]!.editSession("s1", "# Local");
      await unconsented.clock.advance(60_000);
      expect(await unconsented.server.repo.list(OWNER)).toEqual([]);
      const unacknowledged = await world(1, server => server.consent.set(OWNER, grantedConsent(true, { acknowledged: false })));
      unacknowledged.devices[0]!.editSession("s1", "# Local");
      await unacknowledged.clock.advance(60_000);
      expect(await unacknowledged.server.repo.list(OWNER)).toEqual([]);
      expect(await statusOf(unacknowledged.devices[0]!, session("s1"))).toBe("local-only");
   });

   it("uploads profiles too, including a legacy one that had no id", async () => {
      const { server, clock, devices: [a] } = await world();
      writeProfile(a!, [profileEntry("p1", "Ada"), { identity: { fullName: "Legacy", headline: "", summary: "", location: "" } }]);
      a!.leader!.notifyLocalChange({ kind: "profile", id: "*", origin: "local" });
      await clock.advance(12_000);
      const copies = await server.repo.list(OWNER);
      expect(copies.filter(copy => copy.kind === "profile")).toHaveLength(2);
      const stored = JSON.parse(a!.storage.getItem(LOCAL_PROFILES_KEY)!);
      expect(stored.every((entry: { id?: string }) => typeof entry.id === "string" && entry.id)).toBe(true);
      expect(copies.map(copy => copy.clientItemId)).toEqual(expect.arrayContaining(stored.map((entry: { id: string }) => entry.id)));
   });
});

describe("a second device with empty storage", () => {
  it("signs in and sees every record after one sync, with no clicks", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const first = new SimDevice(server, OWNER, "first");
      await first.openTab();
      await clock.advance(1_000);
      for (let index = 0; index < 6; index += 1) first.editSession(`s${index}`, `# Session ${index}`);
      writeProfile(first, [profileEntry("p1", "Ada"), profileEntry("p2", "Grace")]);
      first.leader!.notifyLocalChange({ kind: "profile", id: "*", origin: "local" });
      first.storage.setItem("cv-sv:local-templates:v1", JSON.stringify([]));
      await clock.advance(15_000);
      expect((await server.repo.list(OWNER)).length).toBe(8);

      // The same account on a browser that has never seen any of it.
      const second = new SimDevice(server, OWNER, "second");
      await second.openTab();
      await clock.advance(3_000);
      for (let index = 0; index < 6; index += 1) expect(second.readSession(`s${index}`)?.markdown).toBe(`# Session ${index}`);
      expect(JSON.parse(second.storage.getItem(LOCAL_PROFILES_KEY)!).map((entry: { id: string }) => entry.id).sort()).toEqual(["p1", "p2"]);
      const seen = await view(second);
      expect(seen.records.filter(record => record.status === "synced")).toHaveLength(8);
      expect(seen.records.some(record => record.status === "cloud-only")).toBe(false);
      // One catch-up, not one request per record.
      expect(server.requestsFor(OWNER, "second").length).toBeLessThanOrEqual(2);
   });

   it("keeps listening: a record created later on the first device appears on the second by itself", async () => {
      const { clock, devices: [a, b] } = await world(2);
      a!.editSession("late", "# Later");
      await clock.advance(15_000);
      expect(b!.readSession("late")?.markdown).toBe("# Later");
      expect(await statusOf(b!, session("late"))).toBe("synced");
   });

   it("downloads only kinds the account consented to", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const first = new SimDevice(server, OWNER, "first");
      await first.openTab();
      await clock.advance(1_000);
      first.editSession("s1", "# Session");
      writeProfile(first, [profileEntry("p1", "Ada")]);
      first.leader!.notifyLocalChange({ kind: "profile", id: "*", origin: "local" });
      await clock.advance(15_000);
      server.consent.set(OWNER, grantedConsent(true, { only: ["session"] })); // profiles consent revoked since
      const second = new SimDevice(server, OWNER, "second");
      await second.openTab();
      await clock.advance(3_000);
      expect(second.readSession("s1")?.markdown).toBe("# Session");
      expect(second.storage.getItem(LOCAL_PROFILES_KEY)).toBeNull();
      expect(await statusOf(second, profile("p1"))).toBe("cloud-only");
   });
});

describe("conflict-safe download", () => {
   it("never overwrites a local record whose content differs: both versions are kept for the Conflicts tab", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const first = new SimDevice(server, OWNER, "first");
      await first.openTab();
      await clock.advance(1_000);
      first.editSession("shared", "from the first device");
      await clock.advance(15_000);
      // The second browser already holds a different record under the same id (a copy made before it was linked).
      const second = new SimDevice(server, OWNER, "second");
      second.storage.setItem("cv-sv:session-backup:shared", JSON.stringify({ markdown: "different local content", css: "", title: "Mine", revision: 1, pending: false, savedAt: 1700000000000 }));
      await second.openTab();
      await clock.advance(3_000);
      expect(second.readSession("shared")!.markdown).toBe("different local content");
      expect(await statusOf(second, session("shared"))).toBe("conflict");
      const sides = await second.leader!.compare(session("shared"));
      expect(sides.local?.content).toContain("different local content");
      expect(sides.cloud?.content).toContain("from the first device");
      // Keeping both resolves it without losing either side.
      await second.leader!.resolve(session("shared"), "both");
      await clock.advance(3_000);
      const markdowns = [...Array(second.storage.length).keys()]
         .map(index => second.storage.key(index)!).filter(key => key.startsWith("cv-sv:session-backup:"))
         .map(key => JSON.parse(second.storage.getItem(key)!).markdown).sort();
      expect(markdowns).toEqual(["different local content", "from the first device"]);
   });

   it("links an identical local record without rewriting it", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const first = new SimDevice(server, OWNER, "first");
      await first.openTab();
      await clock.advance(1_000);
      first.editSession("same", "identical", "Same");
      await clock.advance(15_000);
      const second = new SimDevice(server, OWNER, "second");
      second.storage.setItem("cv-sv:session-backup:same", JSON.stringify({ markdown: "identical", css: "", title: "Same", revision: 7, pending: false, savedAt: 1700000000000 }));
      await second.openTab();
      await clock.advance(3_000);
      expect(await statusOf(second, session("same"))).toBe("synced");
      expect(JSON.parse(second.storage.getItem("cv-sv:session-backup:same")!).revision).toBe(7);
   });

   it("a cloud removal marks the link and leaves the local record; deleting locally never deletes the cloud copy", async () => {
      const { clock, devices: [a, b], server } = await world(2);
      a!.editSession("s1", "# Keep me");
      await clock.advance(15_000);
      expect(b!.readSession("s1")).not.toBeNull();
      await a!.leader!.removeFromCloud([session("s1")]);
      await clock.advance(5_000);
      expect(await server.repo.get(OWNER, "session", "s1")).toBeNull();
      expect(b!.readSession("s1")!.markdown).toBe("# Keep me");
      expect(await statusOf(b!, session("s1"))).toBe("cloud-removed");
      expect(a!.readSession("s1")!.markdown).toBe("# Keep me");
      // Removing the cloud copy is a decision: automatic sync does not upload it again behind the user's back.
      await clock.advance(120_000);
      expect(await server.repo.get(OWNER, "session", "s1")).toBeNull();
      expect(await statusOf(a!, session("s1"))).toBe("local-only");
   });

   it("a record the user stopped syncing is not linked, uploaded or downloaded again until chosen", async () => {
      const { clock, devices: [a, b], server } = await world(2);
      a!.editSession("s1", "# One");
      await clock.advance(15_000);
      await b!.leader!.unlink([session("s1")]);
      b!.storage.removeItem("cv-sv:session-backup:s1");
      await clock.advance(60_000);
      await b!.leader!.syncNow();
      expect(b!.readSession("s1")).toBeNull();
      expect((await view(b!)).records.find(record => record.key === session("s1"))).toMatchObject({ status: "cloud-only", optedOut: true });
      // Choosing it again ends the opt-out.
      await b!.leader!.download([session("s1")]);
      expect(b!.readSession("s1")!.markdown).toBe("# One");
      expect(await server.repo.get(OWNER, "session", "s1")).not.toBeNull();
   });

   it("a browser that refuses the write leaves a visible error instead of retrying on every exchange", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const first = new SimDevice(server, OWNER, "first");
      await first.openTab();
      await clock.advance(1_000);
      first.editSession("s1", "# One");
      await clock.advance(15_000);
      const second = new SimDevice(server, OWNER, "second");
      const originalSet = second.storage.setItem.bind(second.storage);
      second.storage.setItem = (key: string, value: string) => { if (key.startsWith("cv-sv:session-backup:")) throw new Error("QuotaExceededError"); originalSet(key, value); };
      await second.openTab();
      await clock.advance(3_000);
      expect(await statusOf(second, session("s1"))).toBe("error");
      const requests = server.requestsFor(OWNER, "second").length;
      await clock.advance(10 * 60_000);
      expect(server.requestsFor(OWNER, "second").length).toBe(requests);
   });
});

describe("modes", () => {
   it("'only records I select' keeps the old behavior and changing the mode deletes nothing", async () => {
      const { clock, devices: [a, b], server } = await world(2);
      a!.editSession("s1", "# Auto");
      await clock.advance(15_000);
      await b!.leader!.setMode("session", "selected");
      a!.editSession("s2", "# Not for B");
      b!.editSession("local-b", "# Local on B");
      await clock.advance(15_000);
      // Selected mode: B neither downloads s2 nor uploads local-b, but keeps everything it has and keeps syncing s1.
      expect(b!.readSession("s2")).toBeNull();
      expect(await server.repo.get(OWNER, "session", "local-b")).toBeNull();
      expect(b!.readSession("s1")!.markdown).toBe("# Auto");
      expect(await statusOf(b!, session("s2"))).toBe("cloud-only");
      expect((await view(b!)).kinds.session).toMatchObject({ mode: "selected", consented: true, automatic: false });
      a!.editSession("s1", "# Auto, edited");
      await clock.advance(20_000);
      expect(b!.readSession("s1")!.markdown).toBe("# Auto, edited");
      // Back to automatic: everything catches up, still deleting nothing.
      await b!.leader!.setMode("session", "auto");
      await clock.advance(15_000);
      expect(b!.readSession("s2")!.markdown).toBe("# Not for B");
      expect((await server.repo.get(OWNER, "session", "local-b"))?.snapshot.content).toContain("Local on B");
      expect(b!.readSession("local-b")).not.toBeNull();
   });

   it("revoking consent stops syncing that kind and keeps local data and the cloud copies", async () => {
      const { clock, devices: [a], server } = await world();
      a!.editSession("s1", "# One");
      await clock.advance(15_000);
      server.consent.set(OWNER, grantedConsent(false));
      await a!.leader!.syncNow();
      a!.editSession("s2", "# Two, after revoking");
      a!.editSession("s1", "# One, edited after revoking");
      await clock.advance(30_000);
      expect((await server.repo.get(OWNER, "session", "s1"))?.snapshot.content).toContain("# One");
      expect((await server.repo.get(OWNER, "session", "s1"))?.snapshot.content).not.toContain("after revoking");
      expect(await server.repo.get(OWNER, "session", "s2")).toBeNull();
      expect(a!.readSession("s2")!.markdown).toBe("# Two, after revoking");
      expect((await view(a!)).kinds.session.automatic).toBe(false);
   });
});

describe("per-kind quota", () => {
   const sessions = (device: SimDevice, count: number, from = 0) => { for (let index = from; index < from + count; index += 1) device.editSession(`s${index}`, `# Session ${index}`); };

   it("syncs about nineteen mixed records with the default caps", async () => {
      const { clock, devices: [a], server } = await world();
      sessions(a!, 9);
      writeProfile(a!, Array.from({ length: 10 }, (_, index) => profileEntry(`p${index}`, `Person ${index}`)));
      a!.leader!.notifyLocalChange({ kind: "profile", id: "*", origin: "local" });
      await clock.advance(20_000);
      expect((await server.repo.list(OWNER)).length).toBe(19);
      const seen = await view(a!);
      expect(seen.records.filter(record => record.status === "over-limit")).toHaveLength(0);
      expect(seen.quota?.kinds?.session).toMatchObject({ limit: 20, used: 9 });
   });

   it("shows what does not fit as 'Not synced: over limit', keeps it local, and never retries in a loop", async () => {
      const { clock, devices: [a], server } = await world(1, s => { s.limits = { session: 3 }; });
      sessions(a!, 5);
      await clock.advance(20_000);
      const seen = await view(a!);
      expect(seen.records.filter(record => record.status === "synced")).toHaveLength(3);
      const over = seen.records.filter(record => record.status === "over-limit");
      expect(over).toHaveLength(2);
      expect(over[0]!.message).toMatch(/over limit \(3 of 3 CV sessions/);
      for (let index = 0; index < 5; index += 1) expect(a!.readSession(`s${index}`)).not.toBeNull(); // nothing dropped
      expect((await server.repo.list(OWNER)).length).toBe(3);
      const requests = server.requests.length;
      await clock.advance(2 * 3_600_000);
      expect(server.requests.length - requests).toBeLessThanOrEqual(2); // fallback reconciliation only
      expect(a!.leader!.view?.kinds.session.automatic).toBe(true);
   });

   it("a full kind does not use up room for another kind", async () => {
      const { clock, devices: [a], server } = await world(1, s => { s.limits = { session: 1, profile: 5 }; });
      sessions(a!, 3);
      writeProfile(a!, [profileEntry("p1", "Ada"), profileEntry("p2", "Grace")]);
      a!.leader!.notifyLocalChange({ kind: "profile", id: "*", origin: "local" });
      await clock.advance(20_000);
      const copies = await server.repo.list(OWNER);
      expect(copies.filter(copy => copy.kind === "session")).toHaveLength(1);
      expect(copies.filter(copy => copy.kind === "profile")).toHaveLength(2);
   });

   it("uploads the over-limit records once room appears (a copy was removed)", async () => {
      const { clock, devices: [a], server } = await world(1, s => { s.limits = { session: 2 }; });
      sessions(a!, 3);
      await clock.advance(20_000);
      expect((await view(a!)).records.filter(record => record.status === "over-limit")).toHaveLength(1);
      const synced = (await view(a!)).records.find(record => record.status === "synced")!;
      await a!.leader!.removeFromCloud([synced.key]);
      await clock.advance(20_000);
      const after = await view(a!);
      expect(after.records.filter(record => record.status === "over-limit")).toHaveLength(0);
      expect((await server.repo.list(OWNER)).length).toBe(2);
      expect(a!.readSession(synced.id)).not.toBeNull();
   });

   it("picks up a raised cap on the next explicit sync", async () => {
      const { clock, devices: [a], server } = await world(1, s => { s.limits = { session: 1 }; });
      sessions(a!, 2);
      await clock.advance(20_000);
      expect((await server.repo.list(OWNER)).length).toBe(1);
      server.limits = { session: 5 };
      await a!.leader!.syncNow();
      await clock.advance(5_000);
      expect((await server.repo.list(OWNER)).length).toBe(2);
      expect((await view(a!)).records.filter(record => record.status === "over-limit")).toHaveLength(0);
   });

   it("a download that would exceed nothing is never blocked by the cap (existing copies always come down)", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      const first = new SimDevice(server, OWNER, "first");
      await first.openTab();
      await clock.advance(1_000);
      sessions(first, 4);
      await clock.advance(20_000);
      server.limits = { session: 2 }; // lowered after the fact
      const second = new SimDevice(server, OWNER, "second");
      await second.openTab();
      await clock.advance(3_000);
      for (let index = 0; index < 4; index += 1) expect(second.readSession(`s${index}`)).not.toBeNull();
   });
});

describe("old servers", () => {
   it("treats a quota without per-kind caps as one shared total, and an unknown consent category as not granted", async () => {
      const { clock, devices: [a], server } = await world(1, (s) => {
         const original = s.sync.bind(s);
         s.sync = async (owner, body) => {
            const response = await original(owner, body);
            if (response.quota) { const { kinds: _kinds, ...legacy } = response.quota; response.quota = { ...legacy, limit: 10 } as any; }
            if (response.consent) { const { cloudJobPreferences: _removed, ...rest } = response.consent; response.consent = rest as any; }
            return response;
         };
      });
      a!.editSession("s1", "# One");
      await clock.advance(15_000);
      expect((await server.repo.get(OWNER, "session", "s1"))?.headRevision).toBe(1);
      expect((await view(a!)).kinds.jobPreferences.consented).toBe(false);
   });
});

describe("job preferences", () => {
   it("syncs the preferences record automatically once its own consent is granted, and not before", async () => {
      const clock = new SimClock();
      const server = new SimServer(clock);
      server.consent.set(OWNER, grantedConsent(true, { only: ["session"] }));
      const first = new SimDevice(server, OWNER, "first");
      await first.openTab();
      await clock.advance(1_000);
      first.storage.setItem(JOB_PREFERENCES_KEY, JSON.stringify({ target_roles: ["Engineer"], savedAt: 1700000000000 }));
      first.leader!.notifyLocalChange({ kind: "jobPreferences", id: "*", origin: "local" });
      await clock.advance(15_000);
      expect(await server.repo.get(OWNER, "jobPreferences", "job-preferences")).toBeNull(); // default off: its own category is not granted
      server.consent.set(OWNER, grantedConsent(true));
      await first.leader!.syncNow();
      await clock.advance(5_000);
      expect((await server.repo.get(OWNER, "jobPreferences", "job-preferences"))?.snapshot.content).toContain("Engineer");
      const second = new SimDevice(server, OWNER, "second");
      await second.openTab();
      await clock.advance(3_000);
      expect(JSON.parse(second.storage.getItem(JOB_PREFERENCES_KEY)!).target_roles).toEqual(["Engineer"]);
   });

   it("keep both on a conflicting preferences record saves this device's version to recovery instead of losing it", async () => {
      const { clock, devices: [a, b] } = await world(2);
      a!.storage.setItem(JOB_PREFERENCES_KEY, JSON.stringify({ target_roles: ["From A"], savedAt: 1 }));
      a!.leader!.notifyLocalChange({ kind: "jobPreferences", id: "*", origin: "local" });
      await clock.advance(15_000);
      b!.online = false;
      b!.storage.setItem(JOB_PREFERENCES_KEY, JSON.stringify({ target_roles: ["B offline"], savedAt: 2 }));
      b!.leader!.notifyLocalChange({ kind: "jobPreferences", id: "*", origin: "local" });
      a!.storage.setItem(JOB_PREFERENCES_KEY, JSON.stringify({ target_roles: ["A again"], savedAt: 3 }));
      a!.leader!.notifyLocalChange({ kind: "jobPreferences", id: "*", origin: "local" });
      await clock.advance(15_000);
      b!.online = true;
      b!.leader!.onOnline();
      await clock.advance(3_000);
      const key = "jobPreferences:job-preferences" as RecordKey;
      expect(await statusOf(b!, key)).toBe("conflict");
      await b!.leader!.resolve(key, "both");
      const after: EngineView = await view(b!);
      expect(after.recovery.some(entry => entry.kind === "jobPreferences")).toBe(true);
      expect(JSON.parse(b!.storage.getItem(JOB_PREFERENCES_KEY)!).target_roles).toEqual(["A again"]);
      await flush();
   });
});
