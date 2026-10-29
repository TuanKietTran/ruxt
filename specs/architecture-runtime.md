# Architecture and runtime

## Ownership

| Layer | Owns |
| --- | --- |
| app/ | Vue pages, editor shell, local storage, browser exports |
| server/ | Nitro routes, authentication adapters, import workers, MCP |
| infra/ | Repository adapters, deployment strategies, handler registration |
| Public @ruxt/shared | Value objects, CQRS/saga, feature evaluation, CV presentation contracts |
| Public @ruxt/editor | Route-free CodeMirror, preview, CSS isolation, pagination |
| Private @ruxt/core | Business/security policy, handlers, repository interfaces |

Nuxt 4/Vue 3/Nitro provide the application runtime. Browser code imports public packages and application-owned HTTP DTOs only. Server/infra code may import private core through documented exports. Public packages cannot import or re-export private core, including types. The legacy packages/editor directory is inactive.

## Startup

1. init-cqrs mounts the shared mediator.
2. init-infra selects repositories and registers account, consent, preferences, catalog, subscription, and IAM handlers.
3. init-cv assembles CV adapters and delegates registration to infra/cv-registry.ts.

The shared CQRS module owns the mediator singleton. Private compatibility exports must resolve that same instance. Handler lookup is string-keyed; duplicate registrations replace earlier entries.

## Routes

- / and /?s=<id>: local CV editor; /?t=<id>&v=<version>: template preview.
- /p: local profiles; /settings: preferences; /settings/cloud-data: authenticated consent.
- /login: Clerk dialog bridge; /d and /d/providers: subscription management.
- /api/auth, /api/preferences, /api/cloud-data: account services.
- /api/cv-imports, /api/cv-applications, /api/cv-artifacts, /api/cv-templates: authenticated workflows.
- /api/public/templates: public catalog; /mcp: authenticated protocol endpoint.
- /api/plans, /api/subscriptions, /api/iam: legacy APIs with enforcement gaps.

The old /api/cvs routes are removed but remain authentication-gated. Admin is a separate application, with no /admin route here.

## Runtime policy

@infra aliases local infrastructure; package imports never alias sibling source. Feature host/route rules come from public runtime configuration and govern deployment segmentation, not authorization. New anonymous non-auth APIs belong under /api/public/.

Mediator, strategy registry, database connections, and analytics accumulators are process-local. See [persistence](persistence-deployment.md) for strategy selection and [authentication](auth-iam-security.md) for enforcement.
