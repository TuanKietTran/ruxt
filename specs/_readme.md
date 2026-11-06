# Specifications

## Subsystem Map

### Application

| Specification | Covers |
| --- | --- |
| [Product requirements](prd.md) | Goals, personas, information architecture, per-surface requirements, non-goals, success metrics, release channels, legacy sunset, security requirements |
| [PRD personas](prd/personas.md) | End user, owner/admin, and operator personas; permissions follow the persona, not the person |
| [PRD information architecture](prd/ia-flows.md) | Shells, global elements, and flows across every surface |
| [PRD requirements](prd/requirements.md) | Per-surface Must and Should requirements; a surface is not releasable without its Must items |
| [PRD non-goals](prd/non-goals.md) | Deliberately out-of-scope product decisions |
| [PRD success metrics](prd/success-metrics.md) | Product metrics from server analytics aggregates, quality metrics from automated checks |
| [PRD release channels](prd/release-channels.md) | Dev, canary, and stable channels; stable web releases from version tags |
| [PRD legacy sunset](prd/legacy-sunset.md) | Clerk, Cloudflare, and Deno Deploy retirement by January 2027, each behind a narrow seam |
| [PRD security requirements](prd/security-requirements.md) | Product-level security requirements applying to every surface |
| [Architecture](architecture-runtime.md) | Runtime, ownership, packages, boot |
| [Editor](cv-editor.md) | Layout, profiles, rendering, exports |
| [Design system](design-system.md) | Token source, generation and drift, ownership, platform consumption |
| [Design tokens](design/tokens.md) | Token categories, naming, per-theme color roles, typography, spacing, radius, elevation |
| [Design themes](design/themes.md) | Named themes, runtime switching, density, preference persistence and defaults |
| [Design layout](design/layout.md) | Window classes, breakpoints, navigation model, admin dense tables |
| [Design screens](design/screens.md) | Routes, information architecture, empty/loading/error/auth states |
| [Design accessibility](design/accessibility.md) | Focus, contrast, text scaling, reduced motion, keyboard shortcuts, skip links |
| [Design motion](design/motion.md) | Duration and easing tokens, reduced-motion behavior |
| [Design Penpot sync](design/penpot.md) | Token sync method and token-to-Penpot mapping; tokens.json is the source of truth, Penpot is a mirror |
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

## Cross-Cutting

Source code defines current behavior. Planned behavior is labelled explicitly. Reusable domain/editor contracts belong to ruxt-core; administration contracts belong to ruxt-admin. Changes to a contract should update its owning specification.
