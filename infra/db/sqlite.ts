import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { CLOUD_COPY_SCHEMA } from "@infra/deploy/cloud-copy-sql";
import { CLOUD_DATA_CATEGORIES } from "@ruxt/core/domain/cloud-data/consent";

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

/** The raw better-sqlite3 connection behind the Drizzle instance (same file, same WAL). */
export function getSqliteClient() {
   return getSqliteDb().$client;
}

/** Every consent category core defines (one per cloud-copy kind), so a new kind needs no edit here. */
const CONSENT_CATEGORIES_CHECK = `CHECK (category IN (${CLOUD_DATA_CATEGORIES.map(category => `'${category}'`).join(", ")}))`;
const CONSENT_CHECK_PATTERN = /CHECK \(category IN \([^)]*\)\)/;

/**
 * Tables created before a category existed carry a shorter CHECK; rebuild them once, keeping rows. A table
 * whose CHECK is already the current list (or has none) is left alone, so this is idempotent.
 */
function widenConsentCategories(sqlite: Database.Database): void {
   const definition = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?");
   const legacy = (table: string) => {
      const sqlText = String((definition.get(table) as { sql?: string } | undefined)?.sql ?? "");
      return CONSENT_CHECK_PATTERN.test(sqlText) && !sqlText.includes(CONSENT_CATEGORIES_CHECK);
   };
   if (!legacy("cloud_consent_states") && !legacy("cloud_consent_events")) return;
   sqlite.transaction(() => {
      if (legacy("cloud_consent_states")) {
         sqlite.exec("ALTER TABLE cloud_consent_states RENAME TO cloud_consent_states_legacy");
         sqlite.exec(`CREATE TABLE cloud_consent_states (owner_id TEXT NOT NULL, category TEXT NOT NULL ${CONSENT_CATEGORIES_CHECK}, granted INTEGER NOT NULL, policy_version TEXT NOT NULL, changed_at TEXT NOT NULL, PRIMARY KEY (owner_id, category))`);
         sqlite.exec("INSERT INTO cloud_consent_states SELECT owner_id, category, granted, policy_version, changed_at FROM cloud_consent_states_legacy");
         sqlite.exec("DROP TABLE cloud_consent_states_legacy");
      }
      if (legacy("cloud_consent_events")) {
         sqlite.exec("ALTER TABLE cloud_consent_events RENAME TO cloud_consent_events_legacy");
         sqlite.exec(`CREATE TABLE cloud_consent_events (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, category TEXT NOT NULL ${CONSENT_CATEGORIES_CHECK}, granted INTEGER NOT NULL, policy_version TEXT NOT NULL, changed_at TEXT NOT NULL)`);
         sqlite.exec("INSERT INTO cloud_consent_events SELECT id, owner_id, actor_user_id, category, granted, policy_version, changed_at FROM cloud_consent_events_legacy");
         sqlite.exec("DROP TABLE cloud_consent_events_legacy");
         sqlite.exec("CREATE INDEX IF NOT EXISTS idx_cloud_consent_events_owner_changed ON cloud_consent_events (owner_id, changed_at)");
      }
   })();
}

export function getSqliteDb() {
   if (_db) return _db;

   const sqlite = new Database(process.env.RUXT_SQLITE_PATH || "local.db");
   sqlite.pragma("journal_mode = WAL");
   sqlite.pragma("busy_timeout = 5000");
   _db = drizzle(sqlite, { schema });

   _db.run(sql`
      CREATE TABLE IF NOT EXISTS subscriptions (
         id                   TEXT PRIMARY KEY,
         user_id              TEXT NOT NULL,
         plan_id              TEXT NOT NULL,
         status               TEXT NOT NULL,
         started_at           TEXT NOT NULL,
         current_period_start TEXT NOT NULL,
         current_period_end   TEXT NOT NULL,
         trial_ends_at           TEXT,
         cancelled_at            TEXT,
         paused_at               TEXT,
         next_interval_plan_id   TEXT
      )
   `);

   _db.run(sql`
      CREATE TABLE IF NOT EXISTS iam_subjects (
         user_id            TEXT PRIMARY KEY,
         org_id             TEXT,
         tier               TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'enterprise')),
         is_service_account INTEGER NOT NULL DEFAULT 0
      )
   `);

   _db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_iam_subjects_org_id ON iam_subjects (org_id)
   `);

   _db.run(sql`
      CREATE TABLE IF NOT EXISTS plans (
         id            TEXT PRIMARY KEY,
         name          TEXT NOT NULL,
         description   TEXT NOT NULL DEFAULT '',
         provider      TEXT NOT NULL DEFAULT '',
         amount_minor  INTEGER NOT NULL,
         currency      TEXT NOT NULL,
         billing_cycle TEXT NOT NULL,
         trial_days    INTEGER,
         features      TEXT NOT NULL DEFAULT '[]',
         is_public     INTEGER NOT NULL DEFAULT 1
      )
   `);
   try { _db.run(sql`ALTER TABLE plans ADD COLUMN provider TEXT NOT NULL DEFAULT ''`); } catch { /* exists */ }
   try { _db.run(sql`ALTER TABLE plans ADD COLUMN source TEXT NOT NULL DEFAULT 'catalog'`); } catch { /* exists */ }
   try { _db.run(sql`ALTER TABLE plans ADD COLUMN created_by TEXT`); } catch { /* exists */ }

   _db.run(sql`
      CREATE TABLE IF NOT EXISTS users (
         id            TEXT PRIMARY KEY,
         email         TEXT NOT NULL UNIQUE,
         password_hash TEXT NOT NULL,
         created_at    TEXT NOT NULL
      )
   `);

   _db.run(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email)
   `);

   sqlite.exec(`CREATE TABLE IF NOT EXISTS cloud_consent_states (owner_id TEXT NOT NULL, category TEXT NOT NULL ${CONSENT_CATEGORIES_CHECK}, granted INTEGER NOT NULL, policy_version TEXT NOT NULL, changed_at TEXT NOT NULL, PRIMARY KEY (owner_id, category))`);
   sqlite.exec(`CREATE TABLE IF NOT EXISTS cloud_consent_events (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, category TEXT NOT NULL ${CONSENT_CATEGORIES_CHECK}, granted INTEGER NOT NULL, policy_version TEXT NOT NULL, changed_at TEXT NOT NULL)`);

   _db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_cloud_consent_events_owner_changed
      ON cloud_consent_events (owner_id, changed_at)
   `);

   _db.run(sql`
      CREATE TABLE IF NOT EXISTS user_preferences (
         owner_id    TEXT PRIMARY KEY,
         preferences TEXT NOT NULL,
         updated_at  TEXT NOT NULL
      )
   `);

   widenConsentCategories(sqlite);
   for (const statement of CLOUD_COPY_SCHEMA) sqlite.exec(statement);

   return _db;
}
