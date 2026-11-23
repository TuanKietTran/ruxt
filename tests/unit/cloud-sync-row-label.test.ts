import { describe, expect, it } from "vitest";
import { makeView, row } from "../helpers/cloud-sync-view";
import { rowSyncLabel } from "../../app/utils/cloudSync/syncPresentation";

/**
 * The small label on a session or template row in the editor sidebar. It used to read "local" for every session,
 * including the ones already in the cloud; it must say what sync did with that record.
 */
describe("rowSyncLabel (the sidebar's per-row label)", () => {
   it("says 'In your cloud' for a record that is on both sides, never 'local'", () => {
      const view = makeView([row("session", "a", "synced", { linked: true })]);
      expect(rowSyncLabel(view, "session", "a")).toMatchObject({ label: "In your cloud", tone: "ok" });
   });

   it("says 'Syncing' while an automatic kind's record is still going up, never 'local'", () => {
      const view = makeView([row("session", "a", "local-only")]);
      expect(rowSyncLabel(view, "session", "a")?.label).toBe("Syncing");
   });

   it("says 'Syncing in another tab' in a follower tab and 'Waiting for sync' with the reason when offline", () => {
      expect(rowSyncLabel(makeView([row("session", "a", "modified", { linked: true })], { leader: false, leaderTab: "other" }), "session", "a")?.label).toBe("Syncing in another tab");
      const offline = rowSyncLabel(makeView([row("session", "a", "modified", { linked: true })], { status: "offline" }), "session", "a");
      expect(offline).toMatchObject({ label: "Waiting for sync" });
      expect(offline?.title).toMatch(/offline/i);
   });

   it("says 'On this device only' with the reason where sync is not responsible for the record", () => {
      const view = makeView([row("session", "a", "local-only")], {}, []);
      const label = rowSyncLabel(view, "session", "a");
      expect(label?.label).toBe("On this device only");
      expect(label?.title).toMatch(/only when you select/i);
   });

   it("shows exceptions with their label", () => {
      expect(rowSyncLabel(makeView([row("session", "a", "conflict", { linked: true })]), "session", "a")?.label).toBe("Conflict");
      expect(rowSyncLabel(makeView([row("session", "a", "over-limit")]), "session", "a")?.label).toBe("Not synced: over limit");
   });

   it("treats a record the first scan has not listed yet as about to sync, and picks the right kind", () => {
      const view = makeView([row("template", "a", "synced", { linked: true })]);
      expect(rowSyncLabel(view, "session", "a")?.label).toBe("Syncing");
      expect(rowSyncLabel(view, "template", "a")?.label).toBe("In your cloud");
   });

   it("has nothing to say without an account, with sync off, or before the first view", () => {
      expect(rowSyncLabel(null, "session", "a")).toBeNull();
      expect(rowSyncLabel(makeView([], { status: "disabled" }), "session", "a")).toBeNull();
      expect(rowSyncLabel(makeView([], { status: "signed-out" }), "session", "a")).toBeNull();
   });
});
