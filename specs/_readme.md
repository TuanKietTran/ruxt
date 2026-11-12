# Specifications

## Subsystem Map

### Application

| Specification | Covers |
| --- | --- |
| [Product requirements](prd.md) | Goals, personas, information architecture, per-surface requirements, non-goals, success metrics, release channels, legacy sunset, security requirements |
| [Architecture](architecture-runtime.md) | Runtime, ownership, packages, boot |
| [Editor](cv-editor.md) | Layout, profiles, rendering, exports |
| [Design system](design-system.md) | Token source, generation and drift, ownership, platform consumption |
| [Design tokens](design/tokens.md) | Token categories, naming, per-theme color roles, typography, spacing, radius, elevation |
| [Design themes](design/themes.md) | Named themes, runtime switching, density, preference persistence and defaults |
| [Design layout](design/layout.md) | Window classes, breakpoints, navigation model, admin dense tables |
| [Design screens](design/screens.md) | Routes, information architecture, empty/loading/error/auth states |
| [Design accessibility](design/accessibility.md) | Focus, contrast, text scaling, reduced motion, keyboard shortcuts, skip links |
| [Design motion](design/motion.md) | Duration and easing tokens, reduced-motion behavior |
| [Desktop app (GPUI)](platform-gpui-ruxt.md) | Native app scope, tokens, themes, layout |
| [Admin desktop app (GPUI)](platform-gpui-admin.md) | Native admin app scope, backends, themes, layout |
| [Local sessions](cv-documents-realtime.md) | Browser storage, autosave, recovery |
| [CV workflows](cv-server-workflows.md) | Import, templates, profile transformations |
| [MCP](mcp-automation.md) | Authenticated transport and rendering automation |
| [iOS platform](platform-ios.md) | Native iOS app: architecture, flavors, theme, auth, testing |
| [Android platform](platform-android.md) | Android app: architecture, flavors, theme, API use, tests and CI |

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
| [Flutter platform](platform-flutter.md) | Flutter app: architecture, flavors, theme, API use, tests and CI |
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
