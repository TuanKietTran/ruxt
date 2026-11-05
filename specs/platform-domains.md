# Platform domains

## Current state

Exactly one domain is configured: `ruxt.mashallow.cloud`, a Cloudflare custom domain on the `ruxt` Worker (`wrangler.json`, `workers_dev` also enabled). There is no DNS, TLS or registrar code or scripting anywhere in the repository, no domain registry, and no verification state. Deployment definitions do not by themselves establish production readiness: the account, bindings, environment, routing and rollback target are confirmed manually per [Cloudflare runbook](cloudflare-migration-runbook.md). The registry, state machine, DNS planning and TLS fields below are Planned.

## Domain registry (Planned, schema)

File: `tools/platform/data/registries/domains.json` — `{ domains: DomainRecord[] }`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `domain` | string | yes | Fully qualified domain, primary key |
| `registrar` | string | yes | Registrar name as a reference label only; no account identifiers or credentials |
| `providerAdapter` | string | yes | Adapter id that manages DNS for this domain, e.g. `cloudflare` |
| `binding` | object | yes | `{ app: string, environment: string, target: string }` — application name, environment name from platform-config.md, and the deployment target the domain routes to |
| `verification` | object | yes | `{ state: VerificationState, checkedAt: string (ISO 8601), detail: string }` |
| `tls` | object | yes | `{ status: 'unknown' \| 'active' \| 'pending' \| 'expired' \| 'failed', issuer?: string, expiresAt?: string (ISO 8601) }` — status fields only, no certificate material |
| `records` | DnsRecord[] | yes | Desired DNS records for this domain (see below) |

`VerificationState` is a state machine: `unverified -> pending -> verified`, with `failed` reachable from `pending` and a return to `pending` on a new verification plan. A domain is usable for a release only in `verified`.

`DnsRecord`: `{ type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX', name: string, value: string, ttlSeconds?: number, proxied?: boolean }`. Record values that are secret-adjacent (for example verification tokens) are stored by named reference, following the secrets-by-reference rule in platform-control-plane.md.

## Worked example: the current domain

```json
{
  "domain": "ruxt.mashallow.cloud",
  "registrar": "Cloudflare",
  "providerAdapter": "cloudflare",
  "binding": { "app": "ruxt", "environment": "production", "target": "worker:ruxt" },
  "verification": { "state": "verified", "checkedAt": "2026-11-04T00:00:00Z", "detail": "Custom domain active on the Worker route" },
  "tls": { "status": "active" },
  "records": [
    { "type": "CNAME", "name": "ruxt.mashallow.cloud", "value": "ruxt (custom domain)", "proxied": true }
  ]
}
```

This record describes the configuration that exists today; recording the remaining fields from a live check is part of the first `domains verify` run, not assumed here.

## DNS planning

CLI (module `tools/platform/src/commands/domains.ts`):

```
platform domains list
platform domains plan-dns --domain <domain>
platform domains plan-verify --domain <domain>
```

`plan-dns` reads the desired `records` from the registry and the current records through the adapter's read path, and produces a Plan whose items are one per record difference (`create`, `update`, `delete`, each with `before`/`after` and a checksum). Planning makes no DNS change; applying a DNS plan is owner-run through the control plane's apply flow, and is Planned for the Cloudflare adapter in this phase. `plan-verify` produces a verification plan: resolving the domain, checking the binding target answers, and checking TLS status; `verify` on that plan advances the `verification` state machine and updates `tls` in the registry as an applied result.
