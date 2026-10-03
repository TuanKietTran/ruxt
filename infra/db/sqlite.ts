import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getSqliteDb() {
   if (_db) return _db;

   const sqlite = new Database("local.db");
   sqlite.pragma("journal_mode = WAL");
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

   _db.run(sql`
      CREATE TABLE IF NOT EXISTS cloud_consent_states (
         owner_id       TEXT NOT NULL,
         category       TEXT NOT NULL CHECK (category IN ('cloudSessions', 'cloudTemplates')),
         granted        INTEGER NOT NULL,
         policy_version TEXT NOT NULL,
         changed_at     TEXT NOT NULL,
         PRIMARY KEY (owner_id, category)
      )
   `);

   _db.run(sql`
      CREATE TABLE IF NOT EXISTS cloud_consent_events (
         id             TEXT PRIMARY KEY,
         owner_id       TEXT NOT NULL,
         actor_user_id  TEXT NOT NULL,
         category       TEXT NOT NULL CHECK (category IN ('cloudSessions', 'cloudTemplates')),
         granted        INTEGER NOT NULL,
         policy_version TEXT NOT NULL,
         changed_at     TEXT NOT NULL
      )
   `);

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

   return _db;
}
