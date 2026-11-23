import { describe, expect, it } from "vitest";
import type { EngineView, RecordStatus, SyncRecordView } from "../../app/utils/cloudSync/contracts";
import { SYNC_KINDS } from "../../app/utils/cloudSync/kinds";
import { connectionText, matchesPhase, owedCount, presentRecord, quotaFacts, syncAvailability } from "../../app/utils/cloudSync/syncPresentation";
import { bannerFor, summarizeSync } from "../../app/utils/cloudSync/syncSummary";
import { describeSyncStatus } from "../../app/utils/cloudSync/statusLabel";
import { filterRecords } from "../../app/utils/cloudSync/recordsView";
import { CONSENT, makeView, row } from "../helpers/cloud-sync-view";

/**
 * The status model: a record sync owns ends "In your cloud"; "On this device only" and "Only in your cloud" are
 * resting labels only where sync is not responsible, and passing states ("Syncing", "Waiting for sync" with a
 * reason) everywhere else. Every status x setup x role x network combination the Records tab, chip, banner and
 * Overview can show is checked against those rules.
 */
const NOW = Date.parse("2026-11-23T10:05:00.000Z");
const STATUSES: RecordStatus[] = [
   "local-only", "cloud-only", "synced", "modified", "behind", "pending", "conflict", "error", "blocked", "over-limit", "cloud-removed", "local-missing",
];
const TRANSIENT: RecordStatus[] = ["local-only", "cloud-only", "modified", "behind", "pending"];

type Setup = "automatic" | "selected" | "unconsented" | "unacknowledged";
const SETUPS: Setup[] = ["automatic", "selected", "unconsented", "unacknowledged"];
const ROLES = {
   leader: { leader: true, leaderTab: "this" },
   follower: { leader: false, leaderTab: "other" },
   unknown: { leader: false, leaderTab: "unknown" },
   silent: { leader: false, leaderTab: "silent" },
   outdated: { leader: false, leaderTab: "outdated" },
} as const;
const NETWORKS = { online: {}, offline: { status: "offline" }, retrying: { status: "error", lastError: { code: "HTTP_500", message: "Internal server error", at: "x" } } } as const;

function build(status: RecordStatus, setup: Setup, role: keyof typeof ROLES, network: keyof typeof NETWORKS, extra: Partial<SyncRecordView> = {}): { view: EngineView; record: SyncRecordView } {
   const record = row("session", "r", status, { linked: !["local-only", "cloud-only"].includes(status), message: ["conflict", "error", "blocked", "over-limit"].includes(status) ? "the reason" : undefined, ...extra });
   const view = makeView([record], { ...ROLES[role], ...NETWORKS[network] } as Partial<EngineView>, setup === "automatic" ? ["session"] : []);
   if (setup === "unconsented") view.kinds.session = { mode: "auto", consented: false, automatic: false };
   if (setup === "unacknowledged") view.kinds.session = { mode: "auto", consented: true, automatic: false };
   return { view, record };
}

const everyCombination = () => {
   const combinations: Array<[RecordStatus, Setup, keyof typeof ROLES, keyof typeof NETWORKS]> = [];
   for (const status of STATUSES) for (const setup of SETUPS) for (const role of Object.keys(ROLES) as Array<keyof typeof ROLES>) for (const network of Object.keys(NETWORKS) as Array<keyof typeof NETWORKS>) combinations.push([status, setup, role, network]);
   return combinations;
};

describe("a record that sync owns never rests as only-here or only-there", () => {
   it.each(everyCombination().filter(([status, setup]) => setup === "automatic" && ["local-only", "cloud-only"].includes(status)))(
      "%s on an automatic kind, %s / %s / %s",
      (status, setup, role, network) => {
         const { view, record } = build(status, setup, role, network);
         const presentation = presentRecord(view, record);
         expect(["syncing", "waiting"]).toContain(presentation.phase);
         expect(presentation.label).not.toBe("On this device only");
         expect(presentation.label).not.toBe("Only in your cloud");
         expect(presentation.reason).toBeTruthy();
      },
   );

   it("a stuck record (this tab leads, nothing is running or scheduled) says so instead of 'Syncing'", () => {
      const { view, record } = build("local-only", "automatic", "leader", "online");
      view.activity = "idle";
      expect(presentRecord(view, record)).toMatchObject({ phase: "waiting", label: "Waiting for sync", reason: expect.stringContaining("Sync now") });
      view.activity = "running";
      expect(presentRecord(view, record)).toMatchObject({ phase: "syncing", label: "Syncing" });
   });

   it("is 'checking' while the account's consent is not known yet, not 'off'", () => {
      const { view, record } = build("local-only", "automatic", "leader", "online");
      view.consent = null;
      view.kinds.session = { mode: "auto", consented: false, automatic: false };
      expect(presentRecord(view, record)).toMatchObject({ phase: "syncing", reason: "Checking your cloud settings." });
      view.status = "offline";
      expect(presentRecord(view, record)).toMatchObject({ phase: "waiting", reason: expect.stringContaining("offline") });
   });
});

describe("what a record shows, for every status, setup, role and network", () => {
   it.each(everyCombination())("%s / %s / %s / %s", (status, setup, role, network) => {
      const { view, record } = build(status, setup, role, network);
      const presentation = presentRecord(view, record);
      const transient = TRANSIENT.includes(status);
      const owned = setup === "automatic" || record.linked;

      // Exceptions and waits always carry their reason; resting device/cloud-only states explain why sync leaves them.
      if (presentation.phase === "attention" || presentation.phase === "waiting") expect(presentation.reason).toBeTruthy();
      if (presentation.phase === "device" || presentation.phase === "cloud-only") expect(presentation.reason).toBeTruthy();

      if (status === "synced") expect(presentation).toMatchObject({ phase: "cloud", label: "In your cloud", tone: "ok" });
      if (["conflict", "error", "blocked", "over-limit", "cloud-removed", "local-missing"].includes(status)) expect(presentation.phase).toBe("attention");

      if (status === "local-only" && !owned) expect(presentation).toMatchObject({ phase: "device", label: "On this device only" });
      if (status === "cloud-only" && !owned) expect(presentation).toMatchObject({ phase: "cloud-only", label: "Only in your cloud" });
      if (transient && owned) {
         expect(["syncing", "waiting"]).toContain(presentation.phase);
         if (network !== "online" || role === "silent" || role === "outdated") expect(presentation).toMatchObject({ phase: "waiting", label: "Waiting for sync" });
         else if (role === "leader") expect(presentation).toMatchObject({ phase: "syncing", label: "Syncing" });
         else expect(presentation).toMatchObject({ phase: "syncing", label: "Syncing in another tab" });
      }
      if (transient && !owned && status !== "local-only" && status !== "cloud-only") {
         // A linked record keeps syncing whatever the mode says.
         expect(["syncing", "waiting"]).toContain(presentation.phase);
      }

      // The chip never reuses the retired words and agrees with the record.
      const chip = describeSyncStatus(view, NOW)!;
      expect(chip.label).not.toBe("Synced");
      expect(`${chip.label} ${chip.detail}`).not.toMatch(/Only on this device|Only in the cloud/);
      if (network === "online" && (presentation.phase === "syncing" || presentation.phase === "waiting") && !["conflict", "error"].includes(status)) {
         expect(["Syncing", "Syncing in another tab", "Waiting for sync", "Downloading 1 item from your cloud"]).toContain(chip.label);
      }
      if (status === "synced" && network === "online") expect(chip).toMatchObject({ tone: "ok", label: "In your cloud" });
      if (network === "offline") expect(chip.label).toBe("Offline");

      // The Overview's connection line names a follower instead of "Not connected".
      const connection = connectionText(view);
      expect(connection).not.toBe("Not connected");
      if (network === "online" && role !== "leader") expect(connection).toMatch(/another tab|older version|not answering/i);

      // The banner never offers Download for a record sync fetches by itself, and explains a wait.
      const banner = bannerFor(view, ["session"]);
      if (presentation.phase === "waiting" && !["conflict", "error", "blocked", "over-limit"].includes(status) && network !== "retrying") {
         expect(banner?.text).toMatch(/^Waiting for sync: 1 item is not in sync yet\./);
      }
      if (transient && owned) expect(banner?.download).toBeUndefined();
      // (a sync error outranks everything else in the banner)
      if (status === "cloud-only" && !owned && setup === "selected" && network !== "retrying") expect(banner?.download?.keys).toEqual(["session:r"]);
      if (status === "cloud-only" && setup === "unconsented") expect(banner?.download).toBeUndefined();

      // The filters put the record where its label says.
      const view2 = view;
      const phase = presentation.phase;
      const filters = { device: "device", cloud: "cloud", "cloud-only": "cloud-only", syncing: ["syncing", "waiting"], attention: "attention" } as const;
      for (const [filter, phases] of Object.entries(filters)) {
         expect(filterRecords(view2, view2.records, { kind: "all", status: filter as keyof typeof filters }).length === 1).toBe([phases].flat().includes(phase));
         expect(matchesPhase(presentation, filter as keyof typeof filters)).toBe([phases].flat().includes(phase));
      }
   });
});

describe("the same view, said the same way everywhere", () => {
   const scenarios: Array<[string, () => EngineView]> = [
      ["leader, one upload queued", () => makeView([row("session", "a", "local-only")])],
      ["follower behind a healthy leader", () => makeView([row("session", "a", "local-only")], { leader: false, leaderTab: "other" })],
      ["follower behind a silent leader", () => makeView([row("session", "a", "local-only")], { leader: false, leaderTab: "silent" })],
      ["offline", () => makeView([row("session", "a", "modified", { linked: true })], { status: "offline" })],
      ["everything in the cloud", () => makeView([row("session", "a", "synced", { linked: true })])],
   ];
   it.each(scenarios)("%s", (_name, make) => {
      const view = make();
      const chip = describeSyncStatus(view, NOW)!;
      const record = presentRecord(view, view.records[0]!);
      const banner = bannerFor(view, ["session"]);
      const summary = summarizeSync(view);
      if (record.phase === "cloud") expect(chip.label).toBe("In your cloud");
      if (record.phase === "syncing") expect(chip.label).toBe(record.label);
      // Offline outranks a wait in the chip; the banner still says why records wait.
      if (record.phase === "waiting") { expect(chip.label).toBe(view.status === "offline" ? "Offline" : "Waiting for sync"); expect(banner?.text).toContain(record.reason); }
      expect(summary.syncing.length + summary.waiting.length).toBe(owedCount(view));
   });

   it("a follower says 'Another tab is syncing', never 'Not connected', beside its status", () => {
      const view = makeView([row("session", "a", "synced", { linked: true })], { leader: false, leaderTab: "other", push: "idle" });
      expect(connectionText(view)).toBe("Another tab is syncing");
      expect(describeSyncStatus(view, NOW)).toMatchObject({ label: "In your cloud" });
   });

   it("the leader says what its live channel is doing", () => {
      expect(connectionText(makeView([], { push: "connected" }))).toBe("Live updates on");
      expect(connectionText(makeView([], { push: "idle" }))).toBe("Not connected yet");
      expect(connectionText(makeView([], { push: "down" }))).toBe("Reconnecting");
      expect(connectionText(makeView([], { status: "offline", push: "idle" }))).toBe("Offline");
   });

   it("availability names why nothing moves", () => {
      expect(syncAvailability(makeView([]))).toEqual({ where: "here" });
      expect(syncAvailability(makeView([], { leader: false, leaderTab: "other" }))).toEqual({ where: "other-tab" });
      expect(syncAvailability(makeView([], { status: "offline" }))).toMatchObject({ where: "nowhere", cause: "offline" });
      expect(syncAvailability(makeView([], { status: "unavailable" }))).toMatchObject({ cause: "unavailable" });
      expect(syncAvailability(makeView([], { retryAt: "2026-11-23T10:10:00.000Z" }))).toMatchObject({ cause: "retrying" });
      // A view from before the new fields existed still reads sensibly.
      const legacy = makeView([]);
      delete legacy.leaderTab;
      expect(syncAvailability({ ...legacy, leader: false })).toEqual({ where: "other-tab" });
   });
});

describe("the Overview's cloud copy lines", () => {
   it("lists each kind with its own limit", () => {
      const quota = { limit: 61, used: 12, remaining: 49, byKind: { session: 10, template: 1, profile: 1 }, kinds: {
         session: { limit: 20, used: 10, remaining: 10 }, template: { limit: 20, used: 1, remaining: 19 }, profile: { limit: 20, used: 1, remaining: 19 }, jobPreferences: { limit: 1, used: 0, remaining: 1 },
      } };
      expect(quotaFacts(makeView([], { quota })).facts).toEqual([
         { label: "Cloud copies: CV sessions", value: "10 of 20" }, { label: "Cloud copies: CV templates", value: "1 of 20" },
         { label: "Cloud copies: profiles", value: "1 of 20" }, { label: "Cloud copies: job preferences", value: "0 of 1" },
      ]);
   });

   it("falls back to what this device knows when the saved quota has no per-kind caps, and says the limits follow", () => {
      const legacy = { limit: 10, used: 10, remaining: 0, byKind: { session: 10 } };
      const records = Array.from({ length: 10 }, (_, index) => row("session", `s${index}`, "synced", { linked: true, cloudRevision: 1 }));
      const facts = quotaFacts(makeView(records, { quota: legacy }));
      expect(facts.facts).toEqual([{ label: "Cloud copies: CV sessions", value: "10 in your cloud" }]);
      expect(facts.note).toMatch(/after the next sync/);
      expect(quotaFacts(makeView([], { quota: legacy })).facts).toEqual([{ label: "Cloud copies", value: "10 of 10" }]);
      expect(quotaFacts(makeView([], { quota: null })).facts).toEqual([{ label: "Cloud copies", value: "Unknown until the first sync" }]);
   });
});

describe("the sync summary", () => {
   it("keeps cloud copies that sync does not fetch apart from the ones it is fetching", () => {
      const view = makeView([row("session", "a", "cloud-only"), row("profile", "b", "cloud-only")], {}, ["session"]);
      const summary = summarizeSync(view);
      expect(summary.incoming.map(record => record.id)).toEqual(["a"]);
      expect(summary.notOnDevice.map(record => record.id)).toEqual(["b"]);
      expect(summary.downloadable.map(record => record.id)).toEqual(["b"]);
      expect(summarizeSync(makeView([row("profile", "b", "cloud-only", { optedOut: true })], {}, [])).downloadable).toEqual([]);
   });

   it("covers every kind", () => {
      for (const kind of SYNC_KINDS) expect(presentRecord(makeView([row(kind, "x", "synced")]), row(kind, "x", "synced")).label).toBe("In your cloud");
      expect(CONSENT.cloudSessions.granted).toBe(true);
   });
});
