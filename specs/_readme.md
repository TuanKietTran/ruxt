# Specifications

## Subsystem Map

### Application

| Specification | Covers |
| --- | --- |
| [Architecture](architecture-runtime.md) | Runtime, ownership, packages, boot |
| [Editor](cv-editor.md) | Layout, profiles, rendering, exports |
| [Design system](design-system.md) | Token source, generation and drift, ownership, platform consumption |
| [Design tokens](design/tokens.md) | Token categories, naming, per-theme color roles, typography, spacing, radius, elevation |
| [Design themes](design/themes.md) | Named themes, runtime switching, density, preference persistence and defaults |
| [Design layout](design/layout.md) | Window classes, breakpoints, navigation model, admin dense tables |
| [Design screens](design/screens.md) | Routes, information architecture, empty/loading/error/auth states |
| [Design accessibility](design/accessibility.md) | Focus, contrast, text scaling, reduced motion, keyboard shortcuts, skip links |
| [Design motion](design/motion.md) | Duration and easing tokens, reduced-motion behavior |
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
- [Platform: Android](platform-android.md)
