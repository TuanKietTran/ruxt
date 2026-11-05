export type AdapterId = 'native' | 'clerk' | 'cloudflare' | 'deno';
export type AdapterKind = 'hosting' | 'identity' | 'data' | 'delivery';

export interface SunsetInfo {
  date: string;
  dependents: string[];
  checklist: { id: string; label: string; state: 'pending' | 'in-progress' | 'done' }[];
}

export interface PlanContext {
  target: string;
  actor: string;
  options?: Record<string, string>;
}

export interface PlanItem {
  id: string;
  kind: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  checksum: string;
}

export interface Plan {
  id: string;
  adapterId: AdapterId;
  action: string;
  target: string;
  createdAt: string;
  actor: string;
  items: PlanItem[];
  counts: { items: number; byKind: Record<string, number> };
  hash: string;
  snapshot?: Record<string, string>;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  planHash: string;
  mode: 'dry-run' | 'applied';
  result: 'ok' | 'refused' | 'failed';
  detail?: string;
}

export interface HealthResult {
  adapterId: string;
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  detail: string;
}

export interface ProviderAdapter {
  id: AdapterId;
  kind: AdapterKind;
  capabilities: string[];
  sunset?: SunsetInfo;
  plan(ctx: PlanContext): Promise<Plan>;
  apply(planId: string, confirmHash: string): Promise<AuditEntry>;
  verify(planId: string): Promise<{ ok: boolean; detail: string }>;
  health(): Promise<HealthResult>;
}

export interface ArtifactRecord {
  platform: 'web' | 'desktop-macos' | 'desktop-windows' | 'desktop-linux' | 'android' | 'ios' | 'flutter';
  name: string;
  checksum: string;
  sizeBytes: number;
  builtAt: string;
  source: string;
}

export interface ReleaseRecord {
  version: string;
  tag: string;
  commit: string;
  channel: 'dev' | 'canary' | 'stable';
  createdAt: string;
  notes: string;
  packages: Record<string, string>;
  artifacts: ArtifactRecord[];
  health: 'unknown' | 'ok' | 'failed';
  promotedFrom?: string;
  rolledBackFrom?: string;
}

export interface ReleaseRegistry { releases: ReleaseRecord[]; }

export interface DnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX';
  name: string;
  value: string;
  ttlSeconds?: number;
  proxied?: boolean;
}

export interface DomainRecord {
  domain: string;
  registrar: string;
  providerAdapter: string;
  binding: { app: string; environment: string; target: string };
  verification: { state: 'unverified' | 'pending' | 'verified' | 'failed'; checkedAt: string; detail: string };
  tls: { status: 'unknown' | 'active' | 'pending' | 'expired' | 'failed'; issuer?: string; expiresAt?: string };
  records: DnsRecord[];
}

export interface DomainRegistry { domains: DomainRecord[]; }

export interface DatabaseRecord {
  id: string;
  environment: string;
  adapter: 'sqlite' | 'deno-kv' | 'cloudflare-d1';
  reference: string;
  migrationState: { applied: string[]; lastAppliedAt?: string; checksum?: string };
  health: 'unknown' | 'ok' | 'degraded' | 'down';
}

export interface DatabaseRegistry { databases: DatabaseRecord[]; }

export interface EnvironmentRecord {
  name: string;
  deploymentEnv: string;
  domain?: string;
  databaseId: string;
  adapterId: string;
  requiredEnv: string[];
}

export interface EnvironmentRegistry { environments: EnvironmentRecord[]; }

export interface FlagRecord {
  id: string;
  kind: 'host-list' | 'route-list' | 'boolean';
  values: string[];
  environment: string;
  source: 'env' | 'registry';
}

export interface FlagRegistry { flags: FlagRecord[]; }

export interface DeploymentRecord {
  id: string;
  environment: string;
  version: string;
  adapterId: string;
  deployedAt: string;
  planHash: string;
  status: 'planned' | 'applied' | 'verified' | 'failed' | 'rolled-back';
  auditId: string;
}

export interface DeploymentRegistry { deployments: DeploymentRecord[]; }

export interface ChecklistItem { id: string; label: string; state: 'pending' | 'in-progress' | 'done'; }

export interface LegacyProviderRecord {
  provider: 'clerk' | 'cloudflare' | 'deno';
  sunsetDate: string;
  dependents: string[];
  checklist: ChecklistItem[];
  replacement: string;
}

export interface LegacyRegistry { providers: LegacyProviderRecord[]; }

export interface RegistryType {
  releases: ReleaseRegistry;
  domains: DomainRegistry;
  databases: DatabaseRegistry;
  environments: EnvironmentRegistry;
  flags: FlagRegistry;
  deployments: DeploymentRegistry;
  legacy: LegacyRegistry;
}
