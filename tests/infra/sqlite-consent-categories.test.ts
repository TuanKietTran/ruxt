import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOUD_DATA_CATEGORIES } from "@ruxt/core/domain/cloud-data/consent";

const Database = createRequire(resolve(process.cwd(), "infra/package.json"))("better-sqlite3");
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

/** A database created before cloud profiles and job preferences existed: a three-category CHECK with real rows. */
function legacyDatabase(categories: string[]): string {
   const dir = mkdtempSync(join(tmpdir(), "ruxt-consent-"));
   dirs.push(dir);
   const path = join(dir, "legacy.db");
   const db = new Database(path);
   const list = categories.map(category => `'${category}'`).join(", ");
   db.exec(`CREATE TABLE cloud_consent_states (owner_id TEXT NOT NULL, category TEXT NOT NULL CHECK (category IN (${list})), granted INTEGER NOT NULL, policy_version TEXT NOT NULL, changed_at TEXT NOT NULL, PRIMARY KEY (owner_id, category))`);
   db.exec(`CREATE TABLE cloud_consent_events (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, category TEXT NOT NULL CHECK (category IN (${list})), granted INTEGER NOT NULL, policy_version TEXT NOT NULL, changed_at TEXT NOT NULL)`);
   db.prepare("INSERT INTO cloud_consent_states VALUES (?, ?, 1, 'v', '2026-11-01T00:00:00.000Z')").run("owner-1", "cloudSessions");
   db.prepare("INSERT INTO cloud_consent_events VALUES ('e1', 'owner-1', 'owner-1', 'cloudSessions', 1, 'v', '2026-11-01T00:00:00.000Z')").run();
   db.close();
   return path;
}

async function openThroughApp(path: string) {
   vi.resetModules();
   process.env.RUXT_SQLITE_PATH = path;
   const { getSqliteClient } = await import("../../infra/db/sqlite");
   return getSqliteClient();
}

describe("SQLite consent categories follow core's registry", () => {
   it("rebuilds an older consent table once, keeps its rows, and then accepts every current category", async () => {
      const path = legacyDatabase(["cloudSessions", "cloudTemplates", "cloudProfiles"]);
      const client = await openThroughApp(path);
      expect(client.prepare("SELECT owner_id, category, granted FROM cloud_consent_states").all()).toEqual([{ owner_id: "owner-1", category: "cloudSessions", granted: 1 }]);
      expect(client.prepare("SELECT id FROM cloud_consent_events").all()).toEqual([{ id: "e1" }]);
      for (const category of CLOUD_DATA_CATEGORIES) {
         client.prepare("INSERT OR REPLACE INTO cloud_consent_states VALUES (?, ?, 0, 'v', '2026-11-02T00:00:00.000Z')").run("owner-2", category);
      }
      expect(client.prepare("SELECT COUNT(*) AS n FROM cloud_consent_states WHERE owner_id = 'owner-2'").get()).toEqual({ n: CLOUD_DATA_CATEGORIES.length });
      expect(() => client.prepare("INSERT INTO cloud_consent_states VALUES ('owner-3', 'cloudUnknown', 0, 'v', 'x')").run()).toThrow(/CHECK/);
      const before = client.prepare("SELECT sql FROM sqlite_master WHERE name = 'cloud_consent_states'").get();
      client.close();

      // Reopening an up-to-date database changes nothing and loses nothing.
      const again = await openThroughApp(path);
      expect(again.prepare("SELECT sql FROM sqlite_master WHERE name = 'cloud_consent_states'").get()).toEqual(before);
      expect(again.prepare("SELECT COUNT(*) AS n FROM cloud_consent_states").get()).toEqual({ n: 1 + CLOUD_DATA_CATEGORIES.length });
      again.close();
   });

   it("also upgrades the oldest two-category tables", async () => {
      const client = await openThroughApp(legacyDatabase(["cloudSessions", "cloudTemplates"]));
      client.prepare("INSERT INTO cloud_consent_states VALUES ('owner-4', 'cloudJobPreferences', 1, 'v', '2026-11-02T00:00:00.000Z')").run();
      expect(client.prepare("SELECT category FROM cloud_consent_states WHERE owner_id = 'owner-4'").get()).toEqual({ category: "cloudJobPreferences" });
      client.close();
   });
});
