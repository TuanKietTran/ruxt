import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Create a temp platform root and point PLATFORM_DATA_DIR at its data dir.
 * Must be called before importing tools/platform/src (it reads the env at
 * load time); this helper only touches node builtins and process.env.
 */
export function makePlatformRoot(prefix: string, actor?: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  process.env.PLATFORM_DATA_DIR = join(root, 'data');
  if (actor !== undefined) process.env.PLATFORM_ACTOR = actor;
  return root;
}

export function stagingEnvironmentsJson(requiredEnv: string[] = []): string {
  return JSON.stringify({ environments: [{ name: 'staging', deploymentEnv: 'staging', databaseId: 'db-sqlite', adapterId: 'native', requiredEnv }] });
}

export function stagingDatabasesJson(root: string): string {
  return JSON.stringify({ databases: [{ id: 'db-sqlite', environment: 'staging', adapter: 'sqlite', reference: join(root, 'store.db'), migrationState: { applied: [] }, health: 'unknown' }] });
}

/** Seed the single staging environment + sqlite database registries and the empty store file they reference. */
export function seedStagingRegistries(root: string, requiredEnv: string[] = []): void {
  mkdirSync(join(root, 'data', 'registries'), { recursive: true });
  writeFileSync(join(root, 'data', 'registries', 'environments.json'), stagingEnvironmentsJson(requiredEnv));
  writeFileSync(join(root, 'data', 'registries', 'databases.json'), stagingDatabasesJson(root));
  writeFileSync(join(root, 'store.db'), '');
}
