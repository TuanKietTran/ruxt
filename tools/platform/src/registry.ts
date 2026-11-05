import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RegistryType } from './types.ts';

const pkgDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(pkgDir, '..', '..', '..');
export const dataDir = process.env.PLATFORM_DATA_DIR || join(repoRoot, 'tools/platform', 'data');
export const registriesDir = join(dataDir, 'registries');
export const plansDir = join(dataDir, 'plans');
export const auditDir = join(dataDir, 'audit');

const REGISTRY_FILES: Record<string, string> = {
  releases: 'releases.json',
  domains: 'domains.json',
  databases: 'databases.json',
  environments: 'environments.json',
  flags: 'flags.json',
  deployments: 'deployments.json',
  legacy: 'legacy.json',
};

export function registryPath(name: string): string {
  const file = REGISTRY_FILES[name];
  if (!file) throw new Error(`unknown registry: ${name}`);
  return join(registriesDir, file);
}

export async function registryChecksum(name: string): Promise<string> {
  return sha256(await readFile(registryPath(name), 'utf8'));
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export interface ValidationError {
  field: string;
  message: string;
}

export class RegistryError extends Error {
  constructor(public errors: ValidationError[]) {
    super(errors.map(error => `${error.field}: ${error.message}`).join('; '));
    this.name = 'RegistryError';
  }
}

function required(record: unknown, field: string): ValidationError[] {
  const object = record as Record<string, unknown>;
  if (object[field] === undefined || object[field] === null) {
    return [{ field, message: 'required field is missing' }];
  }
  return [];
}

function requiredString(record: unknown, field: string): ValidationError[] {
  const errors = required(record, field);
  const object = record as Record<string, unknown>;
  const value = object[field];
  if (value !== undefined && value !== null && typeof value !== 'string') {
    errors.push({ field, message: 'must be a string' });
  }
  return errors;
}

function requiredStringArray(record: unknown, field: string): ValidationError[] {
  const errors = required(record, field);
  const object = record as Record<string, unknown>;
  const value = object[field];
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    errors.push({ field, message: 'must be an array' });
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== 'string') errors.push({ field, message: 'must be an array of strings' });
    }
  }
  return errors;
}

function requiredEnum(record: unknown, field: string, allowed: string[]): ValidationError[] {
  const errors = required(record, field);
  const object = record as Record<string, unknown>;
  const value = object[field];
  if (value !== undefined && value !== null && !allowed.includes(value as string)) {
    errors.push({ field, message: `must be one of ${allowed.join(', ')}` });
  }
  return errors;
}

function requiredObject(record: unknown, field: string): ValidationError[] {
  const errors = required(record, field);
  const object = record as Record<string, unknown>;
  const value = object[field];
  if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
    errors.push({ field, message: 'must be an object' });
  }
  return errors;
}

function validateDnsRecord(record: unknown, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const object = record as Record<string, unknown>;
  const prefix = `records[${index}]`;
  errors.push(...requiredString(object, 'type'), ...requiredString(object, 'name'), ...requiredString(object, 'value'));
  const allowedTypes = ['A', 'AAAA', 'CNAME', 'TXT', 'MX'];
  if (object.type !== undefined && object.type !== null && !allowedTypes.includes(object.type as string)) {
    errors.push({ field: `${prefix}.type`, message: `must be one of ${allowedTypes.join(', ')}` });
  }
  return errors;
}

function validateReleaseRegistry(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const object = data as Record<string, unknown>;
  if (!Array.isArray(object.releases)) {
    errors.push({ field: 'releases', message: 'must be an array' });
    return errors;
  }
  for (const [index, release] of (object.releases as unknown[]).entries()) {
    const prefix = `releases[${index}]`;
    errors.push(...requiredString(release, 'version'), ...requiredString(release, 'tag'), ...requiredString(release, 'commit'),
      ...requiredString(release, 'channel'), ...requiredString(release, 'createdAt'), ...requiredString(release, 'notes'));
    errors.push(...requiredEnum(release, 'channel', ['dev', 'canary', 'stable']),
      ...requiredEnum(release, 'health', ['unknown', 'ok', 'failed']));
    errors.push(...requiredObject(release, 'packages'));
    if (Array.isArray((release as Record<string, unknown>).artifacts)) {
      for (const [artifactIndex, artifact] of ((release as Record<string, unknown>).artifacts as unknown[]).entries()) {
        errors.push(...validateArtifact(artifact, `${prefix}.artifacts[${artifactIndex}]`));
      }
    }
  }
  return errors;
}

function validateArtifact(artifact: unknown, prefix: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const object = artifact as Record<string, unknown>;
  errors.push(...requiredString(object, 'platform'), ...requiredString(object, 'name'), ...requiredString(object, 'checksum'),
    ...requiredString(object, 'builtAt'), ...requiredString(object, 'source'));
  const value = object.sizeBytes;
  if (value !== undefined && value !== null && typeof value !== 'number') {
    errors.push({ field: `${prefix}.sizeBytes`, message: 'must be a number' });
  }
  return errors;
}

function validateDomainRegistry(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const object = data as Record<string, unknown>;
  if (!Array.isArray(object.domains)) {
    errors.push({ field: 'domains', message: 'must be an array' });
    return errors;
  }
  for (const [index, domain] of (object.domains as unknown[]).entries()) {
    const prefix = `domains[${index}]`;
    errors.push(...requiredString(domain, 'domain'), ...requiredString(domain, 'registrar'), ...requiredString(domain, 'providerAdapter'));
    errors.push(...requiredObject(domain, 'binding'), ...requiredObject(domain, 'verification'), ...requiredObject(domain, 'tls'));
    const binding = (domain as Record<string, unknown>).binding as Record<string, unknown> | undefined;
    if (binding) {
      errors.push(...requiredString(binding, 'app'), ...requiredString(binding, 'environment'), ...requiredString(binding, 'target'));
    }
    const verification = (domain as Record<string, unknown>).verification as Record<string, unknown> | undefined;
    if (verification) {
      errors.push(...requiredEnum(verification, 'state', ['unverified', 'pending', 'verified', 'failed']),
        ...requiredString(verification, 'checkedAt'), ...requiredString(verification, 'detail'));
    }
    const tls = (domain as Record<string, unknown>).tls as Record<string, unknown> | undefined;
    if (tls) {
      errors.push(...requiredEnum(tls, 'status', ['unknown', 'active', 'pending', 'expired', 'failed']));
    }
    if (Array.isArray((domain as Record<string, unknown>).records)) {
      for (const [recordIndex, record] of ((domain as Record<string, unknown>).records as unknown[]).entries()) {
        errors.push(...validateDnsRecord(record, recordIndex));
      }
    }
  }
  return errors;
}

function validateDatabaseRegistry(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const object = data as Record<string, unknown>;
  if (!Array.isArray(object.databases)) {
    errors.push({ field: 'databases', message: 'must be an array' });
    return errors;
  }
  for (const [index, database] of (object.databases as unknown[]).entries()) {
    const prefix = `databases[${index}]`;
    errors.push(...requiredString(database, 'id'), ...requiredString(database, 'environment'),
      ...requiredEnum(database, 'adapter', ['sqlite', 'deno-kv', 'cloudflare-d1']), ...requiredString(database, 'reference'),
      ...requiredObject(database, 'migrationState'), ...requiredEnum(database, 'health', ['unknown', 'ok', 'degraded', 'down']));
    const migrationState = (database as Record<string, unknown>).migrationState as Record<string, unknown> | undefined;
    if (migrationState) {
      errors.push(...requiredStringArray(migrationState, 'applied'));
    }
  }
  return errors;
}

function validateEnvironmentRegistry(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const object = data as Record<string, unknown>;
  if (!Array.isArray(object.environments)) {
    errors.push({ field: 'environments', message: 'must be an array' });
    return errors;
  }
  for (const [index, environment] of (object.environments as unknown[]).entries()) {
    const prefix = `environments[${index}]`;
    errors.push(...requiredString(environment, 'name'), ...requiredString(environment, 'deploymentEnv'),
      ...requiredString(environment, 'databaseId'), ...requiredString(environment, 'adapterId'),
      ...requiredStringArray(environment, 'requiredEnv'));
  }
  return errors;
}

function validateFlagRegistry(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const object = data as Record<string, unknown>;
  if (!Array.isArray(object.flags)) {
    errors.push({ field: 'flags', message: 'must be an array' });
    return errors;
  }
  for (const [index, flag] of (object.flags as unknown[]).entries()) {
    const prefix = `flags[${index}]`;
    errors.push(...requiredString(flag, 'id'), ...requiredEnum(flag, 'kind', ['host-list', 'route-list', 'boolean']),
      ...requiredStringArray(flag, 'values'), ...requiredString(flag, 'environment'),
      ...requiredEnum(flag, 'source', ['env', 'registry']));
  }
  return errors;
}

function validateDeploymentRegistry(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const object = data as Record<string, unknown>;
  if (!Array.isArray(object.deployments)) {
    errors.push({ field: 'deployments', message: 'must be an array' });
    return errors;
  }
  for (const [index, deployment] of (object.deployments as unknown[]).entries()) {
    const prefix = `deployments[${index}]`;
    errors.push(...requiredString(deployment, 'id'), ...requiredString(deployment, 'environment'),
      ...requiredString(deployment, 'version'), ...requiredString(deployment, 'adapterId'), ...requiredString(deployment, 'deployedAt'),
      ...requiredString(deployment, 'planHash'),
      ...requiredEnum(deployment, 'status', ['planned', 'applied', 'verified', 'failed', 'rolled-back']),
      ...requiredString(deployment, 'auditId'));
  }
  return errors;
}

function validateLegacyRegistry(data: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const object = data as Record<string, unknown>;
  if (!Array.isArray(object.providers)) {
    errors.push({ field: 'providers', message: 'must be an array' });
    return errors;
  }
  for (const [index, provider] of (object.providers as unknown[]).entries()) {
    const prefix = `providers[${index}]`;
    errors.push(...requiredString(provider, 'provider'), ...requiredEnum(provider, 'provider', ['clerk', 'cloudflare', 'deno']),
      ...requiredString(provider, 'sunsetDate'), ...requiredStringArray(provider, 'dependents'),
      ...requiredString(provider, 'replacement'));
    const checklist = (provider as Record<string, unknown>).checklist as unknown[] | undefined;
    if (!Array.isArray(checklist)) {
      errors.push({ field: `${prefix}.checklist`, message: 'must be an array' });
    }
    if (Array.isArray(checklist)) {
      for (const [itemIndex, item] of checklist.entries()) {
        const itemObject = item as Record<string, unknown>;
        const itemPrefix = `${prefix}.checklist[${itemIndex}]`;
        errors.push(...requiredString(itemObject, 'id'), ...requiredString(itemObject, 'label'),
          ...requiredEnum(itemObject, 'state', ['pending', 'in-progress', 'done']));
      }
    }
  }
  return errors;
}

const VALIDATORS: Record<string, (data: unknown) => ValidationError[]> = {
  releases: validateReleaseRegistry,
  domains: validateDomainRegistry,
  databases: validateDatabaseRegistry,
  environments: validateEnvironmentRegistry,
  flags: validateFlagRegistry,
  deployments: validateDeploymentRegistry,
  legacy: validateLegacyRegistry,
};

export async function loadRegistry<K extends keyof RegistryType>(name: K): Promise<RegistryType[K]> {
  const text = await readFile(registryPath(name), 'utf8');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RegistryError([{ field: name, message: 'invalid JSON' }]);
  }
  const errors = VALIDATORS[name](data);
  if (errors.length) throw new RegistryError(errors);
  return data as RegistryType[K];
}

export async function saveRegistry<K extends keyof RegistryType>(name: K, data: RegistryType[K]): Promise<void> {
  mkdirSync(registriesDir, { recursive: true });
  await writeFile(registryPath(name), JSON.stringify(data, null, 2) + '\n', 'utf8');
}
