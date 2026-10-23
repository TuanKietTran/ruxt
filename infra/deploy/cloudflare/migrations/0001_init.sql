-- Cloudflare D1 schema: keep aligned with infra/db/schema.ts and SQLite adapters.
CREATE TABLE IF NOT EXISTS subscriptions (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, plan_id TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, current_period_start TEXT NOT NULL, current_period_end TEXT NOT NULL, trial_ends_at TEXT, cancelled_at TEXT, paused_at TEXT, next_interval_plan_id TEXT);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, billing_cycle TEXT NOT NULL, trial_days INTEGER, provider TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'catalog', created_by TEXT, features TEXT NOT NULL DEFAULT '[]', is_public INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS idx_plans_public ON plans(is_public);
CREATE INDEX IF NOT EXISTS idx_plans_created_by ON plans(created_by);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS iam_subjects (user_id TEXT PRIMARY KEY NOT NULL, org_id TEXT, tier TEXT NOT NULL, is_service_account INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS cloud_consent_states (owner_id TEXT NOT NULL, category TEXT NOT NULL, granted INTEGER NOT NULL, policy_version TEXT NOT NULL, changed_at TEXT NOT NULL, PRIMARY KEY(owner_id, category));
CREATE TABLE IF NOT EXISTS cloud_consent_events (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, actor_user_id TEXT NOT NULL, category TEXT NOT NULL, granted INTEGER NOT NULL, policy_version TEXT NOT NULL, changed_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cloud_consent_events_owner_changed ON cloud_consent_events(owner_id, changed_at);
CREATE TABLE IF NOT EXISTS user_preferences (owner_id TEXT PRIMARY KEY NOT NULL, preferences TEXT NOT NULL, updated_at TEXT NOT NULL);
