# Specifications

## Subsystem Map

### Application

| Specification | Covers |
| --- | --- |
| [Architecture](architecture-runtime.md) | Runtime, ownership, packages, boot |
| [Editor](cv-editor.md) | Layout, profiles, rendering, exports |
| [Local sessions](cv-documents-realtime.md) | Browser storage, autosave, recovery |
| [CV workflows](cv-server-workflows.md) | Import, templates, profile transformations |
| [MCP](mcp-automation.md) | Authenticated transport and rendering automation |

### Accounts and storage

| Specification | Covers |
| --- | --- |
| [Authentication and IAM](auth-iam-security.md) | Identity, access checks, trust boundaries |
| [Cloud data](authenticated-cloud-data.md) | Consent and planned synchronization |
| [Subscriptions](subscriptions-catalog.md) | Plans, billing periods, lifecycle |
| [Domain foundations](domain-foundations.md) | Shared primitives and private domain ownership |
| [Persistence](persistence-deployment.md) | SQLite, Deno KV, Cloudflare, Nitro storage |

### Development and operations

| Specification | Covers |
| --- | --- |
| [Setup and checks](testing-devops.md) | Local configuration, commands, CI |
| [UI validation](cv-sv-ui-validation.md) | Browser and export checks |
| [Cloudflare runbook](cloudflare-migration-runbook.md) | Bindings, deployment, rollback |
| [Follow-ups](TODO.md) | Deferred improvements |

### Platform

| Specification | Covers |
| --- | --- |
| [Platform control plane](platform-control-plane.md) | Principles, adapters, plans, audit, commands |
| [Platform releases](platform-releases.md) | Versions, channels, changelog, promotion, rollback |
| [Platform domains](platform-domains.md) | Domain registry, DNS plans, verification, TLS |
| [Platform data](platform-data.md) | Database registry, migrations, backup, restore |
| [Platform configuration](platform-config.md) | Environments, secrets by reference, flags, deployments |
| [Platform legacy](platform-legacy.md) | Clerk, Cloudflare and Deno sunset tracking to 2027-01 |
| [Platform admin](platform-admin.md) | Admin pages, API shapes, plan viewer |

## Cross-Cutting

Source code defines current behavior. Planned behavior is labelled explicitly. Reusable domain/editor contracts belong to ruxt-core; administration contracts belong to ruxt-admin. Changes to a contract should update its owning specification.
