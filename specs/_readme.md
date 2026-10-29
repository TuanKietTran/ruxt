# Specifications

## Application

| Specification | Covers |
| --- | --- |
| [Architecture](architecture-runtime.md) | Runtime, ownership, packages, boot |
| [Editor](cv-editor.md) | Layout, profiles, rendering, exports |
| [Local sessions](cv-documents-realtime.md) | Browser storage, autosave, recovery |
| [CV workflows](cv-server-workflows.md) | Import, templates, profile transformations |
| [MCP](mcp-automation.md) | Authenticated transport and rendering automation |

## Accounts and storage

| Specification | Covers |
| --- | --- |
| [Authentication and IAM](auth-iam-security.md) | Identity, access checks, trust boundaries |
| [Cloud data](authenticated-cloud-data.md) | Consent and planned synchronization |
| [Subscriptions](subscriptions-catalog.md) | Plans, billing periods, lifecycle |
| [Domain foundations](domain-foundations.md) | Shared primitives and private domain ownership |
| [Persistence](persistence-deployment.md) | SQLite, Deno KV, Cloudflare, Nitro storage |

## Development and operations

| Specification | Covers |
| --- | --- |
| [Setup and checks](testing-devops.md) | Local configuration, commands, CI |
| [UI validation](cv-sv-ui-validation.md) | Browser and export checks |
| [Cloudflare runbook](cloudflare-migration-runbook.md) | Bindings, deployment, rollback |
| [Follow-ups](TODO.md) | Deferred improvements |

Source code defines current behavior. Planned behavior is labelled explicitly. Reusable domain/editor contracts belong to ruxt-core; administration contracts belong to ruxt-admin. Changes to a contract should update its owning specification.
