import { describe, expect, it } from "vitest";
import { CLOUD_COPY_KIND_REGISTRY, CLOUD_COPY_KINDS } from "@ruxt/core/domain/cloud-copy";
import type { EngineView, SyncRecordView } from "../../app/utils/cloudSync/contracts";
import { SYNC_KIND_REGISTRY, SYNC_KINDS } from "../../app/utils/cloudSync/kinds";
import { bannerFor, chipSummary, summarizeSync } from "../../app/utils/cloudSync/syncSummary";
import { describeSyncStatus } from "../../app/utils/cloudSync/statusLabel";
import type { SyncKind } from "../../app/utils/cloudSync/types";
import { makeView, row } from "../helpers/cloud-sync-view";

const view = (records: SyncRecordView[], overrides: Partial<EngineView> = {}, auto: SyncKind[] = ["session", "template", "profile", "jobPreferences"]): EngineView => makeView(records, overrides, auto);

describe("the client registry agrees with core's", () => {
   it("lists the same kinds with the same consent categories, schema tags and default caps", () => {
      expect([...SYNC_KINDS].sort()).toEqual([...CLOUD_COPY_KINDS].sort());
      for (const kind of CLOUD_COPY_KINDS) {
         const core = CLOUD_COPY_KIND_REGISTRY[kind];
         const client = SYNC_KIND_REGISTRY[kind];
         expect(client.consentCategory).toBe(core.consentCategory);
         expect(client.schema).toBe(core.schema);
         expect(client.fallbackLimit).toBe(core.defaultLimit);
         expect(Boolean(client.singleton)).toBe(Boolean("singleton" in core && core.singleton));
      }
   });
});

describe("summarizeSync", () => {
   it("sorts records into incoming, not-on-this-device, over-limit, failed and conflicts", () => {
      const summary = summarizeSync(view([
         row("session", "a", "cloud-only"), row("profile", "b", "cloud-only"), row("session", "c", "over-limit"),
         row("session", "d", "blocked", { message: "Turn on cloud saving" }), row("session", "e", "conflict"), row("session", "f", "synced"),
         row("session", "g", "cloud-only", { optedOut: true }),
      ], {}, ["session"]));
      expect(summary.incoming.map(r => r.id)).toEqual(["a"]);
      expect(summary.syncing.map(r => r.id)).toEqual(["a"]);
      expect(summary.notOnDevice.map(r => r.id)).toEqual(["b", "g"]);
      expect(summary.downloadable.map(r => r.id)).toEqual(["b"]);
      expect(summary.overLimit.map(r => r.id)).toEqual(["c"]);
      expect(summary.failed.map(r => r.id)).toEqual(["d"]);
      expect(summary.conflicts.map(r => r.id)).toEqual(["e"]);
   });
   it("never offers a download for a kind the account did not consent to", () => {
      const v = view([row("profile", "p", "cloud-only")], {}, []);
      v.kinds.profile.consented = false;
      expect(summarizeSync(v).downloadable).toEqual([]);
   });
});

describe("bannerFor", () => {
   it("is silent when there is nothing to say, signed out, or sync is off", () => {
      expect(bannerFor(view([row("session", "a", "synced")]), ["session"])).toBeNull();
      expect(bannerFor(null, ["session"])).toBeNull();
      expect(bannerFor(view([], { status: "signed-out" }), ["session"])).toBeNull();
      expect(bannerFor(view([], { status: "disabled" }), ["session"])).toBeNull();
   });
   it("says it is downloading while a catch-up runs, and never leaves an empty list unexplained", () => {
      const downloading = bannerFor(view([row("session", "a", "cloud-only"), row("session", "b", "cloud-only")], { status: "syncing" }), ["session"]);
      expect(downloading).toMatchObject({ tone: "busy", text: "Downloading 2 items from your cloud" });
      const checking = bannerFor(view([], { status: "syncing", lastSyncAt: null }), ["session"]);
      expect(checking).toMatchObject({ tone: "busy", text: "Checking your cloud for CV sessions…" });
   });
   it("offers Download for cloud copies that will not come down by themselves", () => {
      const waiting = bannerFor(view([row("session", "a", "cloud-only"), row("session", "b", "cloud-only")], {}, []), ["session"]);
      expect(waiting?.text).toBe("2 items in your cloud are not on this device.");
      expect(waiting?.download).toEqual({ label: "Download (2)", keys: ["session:a", "session:b"] });
   });
   it("never offers Download for copies an automatic kind is bringing down; it says they are on their way, or why they wait", () => {
      const coming = bannerFor(view([row("session", "a", "cloud-only")], {}, ["session"]), ["session"]);
      expect(coming).toMatchObject({ tone: "busy", text: "Downloading 1 item from your cloud" });
      expect(coming?.download).toBeUndefined();
      const stuck = bannerFor(view([row("session", "a", "cloud-only")], { leader: false, leaderTab: "silent" }, ["session"]), ["session"]);
      expect(stuck).toMatchObject({ tone: "warning", syncNow: true });
      expect(stuck?.text).toMatch(/^Waiting for sync: 1 item is not in sync yet\. The tab that syncs stopped answering/);
      const offline = bannerFor(view([row("session", "a", "cloud-only")], { status: "offline" }, ["session"]), ["session"]);
      expect(offline?.text).toContain("offline");
      expect(offline?.syncNow).toBeUndefined();
   });
   it("explains instead of offering Download when the kind has no consent", () => {
      const v = view([row("profile", "p", "cloud-only")], {}, []);
      v.kinds.profile.consented = false;
      const banner = bannerFor(v, ["profile"]);
      expect(banner?.download).toBeUndefined();
      expect(banner?.text).toContain("Turn on cloud sync for profiles");
   });
   it("reports over-limit, failures with their reason, conflicts and sync errors, in that priority", () => {
      const records = [row("session", "o", "over-limit"), row("session", "f", "blocked", { message: "Turn on cloud saving for this kind of record" }), row("session", "c", "conflict")];
      expect(bannerFor(view(records.slice(0, 1)), ["session"])?.text).toBe("1 item could not sync (over limit). Remove a cloud copy you no longer need to make room.");
      expect(bannerFor(view(records.slice(0, 2)), ["session"])?.text).toBe("1 item could not sync: Turn on cloud saving for this kind of record");
      expect(bannerFor(view(records), ["session"])?.text).toMatch(/^1 conflict /);
      const failed = bannerFor(view(records, { status: "error", lastError: { code: "HTTP_500", message: "Internal server error", at: "x" } }), ["session"]);
      expect(failed).toMatchObject({ tone: "danger", text: "Cloud sync failed: Internal server error" });
   });
   it("only reports the kinds asked for", () => {
      const v = view([row("profile", "p", "over-limit")]);
      expect(bannerFor(v, ["session"])).toBeNull();
      expect(bannerFor(v, ["profile"])).not.toBeNull();
   });
});

describe("the header chip", () => {
   const now = Date.parse("2026-11-23T10:05:00.000Z");
   it("says what it is downloading", () => {
      const label = describeSyncStatus(view([row("session", "a", "cloud-only"), row("profile", "b", "cloud-only")], { status: "syncing" }), now);
      expect(label).toMatchObject({ tone: "busy", label: "Downloading 2 items from your cloud" });
   });
   it("says how many could not sync and why", () => {
      const over = describeSyncStatus(view([row("session", "a", "over-limit"), row("session", "b", "over-limit")]), now);
      expect(over).toMatchObject({ tone: "warning", label: "2 items could not sync (over limit)" });
      const failed = describeSyncStatus(view([row("session", "a", "blocked", { message: "Turn on cloud saving" })]), now);
      expect(failed).toMatchObject({ tone: "warning", label: "1 item could not sync", detail: "Turn on cloud saving" });
   });
   it("shows an error with its reason", () => {
      const label = describeSyncStatus(view([], { status: "error", lastError: { code: "HTTP_500", message: "Internal server error", at: "x" } }), now);
      expect(label).toMatchObject({ tone: "danger", label: "Sync failed", detail: "Internal server error" });
   });
   it("counts across kinds", () => {
      expect(chipSummary(view([row("session", "a", "over-limit"), row("profile", "b", "over-limit"), row("template", "c", "cloud-only")]))).toMatchObject({ overLimit: 2, incoming: 1, syncing: 1, waiting: 0 });
   });
});
