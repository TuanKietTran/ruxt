# Architecture And Runtime

Last updated: feat/ruxt-core-split@4dd5c27 | 2026-10-22

## Scope

This spec covers:

- root configuration in `package.json`, `pnpm-workspace.yaml`, `nuxt.config.ts`, and `tsconfig.json`;
- Nuxt application entry and routing under `app/`;
- Nitro plugins and routes under `server/`;
- generic CQRS dispatch in `shared/cqrs.ts`, private compatibility exports and registration in `infra/registry.ts`;
- public CV presentation contracts under `shared/domain/cv/`, private import/application types and use cases under `core/`;
- the `infra` workspace package, shared-package migration boundary, and top-level source ownership.

## Runtime Shape

The application is Nuxt 4 with Vue 3 and Nitro, using TypeScript ESM and an ES2022 Nitro target. Nuxt file routing owns browser pages; Nitro file routing owns HTTP endpoints. `@clerk/nuxt` supplies browser identity components and verified server request context. The root package includes `infra` as a pnpm workspace package.

Current top-level ownership is:

- `app/`: Vue pages, layouts, components, composables, themes, editor data, browser export utilities, and browser workers;
- `server/`: Nitro startup, HTTP route adaptation, session helpers, CV persistence/realtime, the Python pipeline adapter/worker, and MCP;
- `@ruxt/shared` (canonical source `ruxt-core/packages/shared`, public): generic value objects/time/email/phone, CQRS/saga, feature evaluation, analytics primitives, preferences schema and pure CV presentation/profile/document/transform/revision/recovery contracts;
- `@ruxt/core` (private root of the `ruxt-core` workspace): payment, commercial lifecycle/catalog, IAM/auth/password policy, cloud consent, CV import/application implementations and wire/state contracts, all business handlers and repository ports. Private legacy paths may re-export shared code; shared never imports/re-exports private. There is no application-local `core/` copy;
- `infra/`: scrypt, SQLite/Deno KV adapters, deployment strategy selection, and handler registration;
- the private `ruxt-admin` repository: separately served Nuxt dashboard with independent GitHub OAuth, analytics readers, and template administration;
- `scripts/`: standalone automation, currently headless PDF rendering.

`@infra` remains an application workspace alias. Core imports use documented `@ruxt/core/...` package exports directly; Nuxt/Vite/Nitro/TypeScript/Vitest do not alias its source directory. `nuxt.config.ts` also adds a Nitro Rollup loader for first-party `?raw` imports so Markdown and CSS seed assets can be imported by server code.

## Dependency Direction

The intended application dependency direction is:

```text
app ----------------------------> public shared/editor
 |                                     ^
 v                                     |
server -> private core handlers <--- infra adapters
                 |                     |
                 +----> public shared <-+
```

`core` does not import Nuxt, Nitro, Vue, database, or transport modules. Cross-runtime feature evaluation is exposed through `@ruxt/shared/features`; app and server adapters do not import its internal modules. Browser app code cannot import private core, even type-only; HTTP-facing commercial/import DTOs are app-owned adapters composed from public presentation contracts, not private policy implementations. Repository interfaces in `core/repos/` are ports implemented by `infra/deploy/*` or Nitro-owned adapters. The app, server, and unit tests resolve documented package exports from installed exact packed shared/core/editor artifacts, never through an alias into sibling source. The local workflow builds and packs before installing; it does not publish or bump a release version. The legacy `core/` folder remains removed. Preferences schema/defaults and local CV backup reconciliation are public shared; account preferences get/set handlers and repository ports remain private core, registered in `infra/registry.ts`. Cloud consent/retention and import/application workflow rules remain private, not in the shared recovery helper. HTTP routes adapt requests to CQRS handlers. CV REST and MCP independently dispatch document handlers; import routes dispatch one-purpose import handlers and use server adapters for multipart bytes and subprocess execution.

Browser and Nitro code import reusable CV contracts through `@ruxt/shared/cv`; private server adapters additionally use core import/application contracts. The canonical presentation source is `shared/domain/cv/`;  the retired `shared/types/cv.ts` forwarding layer no longer exists. App-local copies of core CV/profile contracts are forbidden: UI-only persistence metadata may be expressed as intersections with exported core types.

## CQRS And Boot

`shared/cqrs.ts` owns one process-global `Mediator`; private `core/cqrs.ts` re-exports the same implementation, not a duplicate singleton. `mountVendor()` creates it once. Handlers are keyed by string `requestName`; command lookup is attempted before query lookup. `createHandler()` converts thrown handler/domain errors into `{ success: false, error }`, and `Mediator.send()` throws that error to callers.

Nitro boot is split between:

1. `server/plugins/init-cqrs.ts`, which mounts the mediator;
2. `server/plugins/init-infra.ts`, which calls `bootstrap()`;
3. `server/plugins/init-cv.ts`, which assembles Nitro-owned CV adapters and delegates all CV handler registration to `infra/cv-registry.ts`;
4. `infra/registry.ts`, which resolves a persistence strategy, builds repositories, constructs `ScryptHasher`, and registers auth, cloud-consent, plan, subscription, and IAM handlers.

Handler registration belongs to `infra`; Nitro plugins may assemble runtime-specific adapters but must not register individual core features directly.

Handler modules own request input/output shapes, a handler factory, a command/query envelope factory, and a registration helper. API route files should remain thin adapters.

## Shared Editor Layout Rule

First-party CV-related editor surfaces must reuse `app/layouts/editor.vue`. Standard CV and template pages use its source/preview regions. Other tools such as `/p` supply the named `workspace` slot and replace document navigation through the `sidebar` slot, so tool-specific navigation replaces rather than duplicates the Sessions/Templates sidebar while the header, activity bar, theme, sizing, and status treatment remain consistent. Do not create a parallel full-page product shell for an editor tool without an explicit spec change.

`scripts/lint-architecture.mjs` enforces the current profile-layout, public/local profile, shared core-type, and preview style-isolation boundaries through `pnpm lint`.

## Route Surfaces

Current browser routes include (the dedicated admin workspace deliberately adds no `/admin` route here):

- `/`: the master CV editor, rendered without the default layout;
- `/?s=<id>`: named CV session editor, also without the default layout;
- `/about`: product overview page (local-first CV editor, optional cloud);
- `/login`: deep-link/redirect bridge to the global Clerk-backed sign-in and account-creation dialog;
- `/p`: browser-local profile editor;
- `/settings`: public editor preferences (browser-local, or account-stored when signed in);
- `/settings/cloud-data`: authenticated, independent cloud-session/template consent controls;
- `/?t=<id>&v=<version>`: read-only template source and preview; anonymous selection is restricted to the public catalog;
- `/d`: subscription dashboard;
- `/d/providers`: provider-grouped plan inventory;

The legacy browser plan-catalog route formerly at `/p` is retired; that path now serves the browser-local profile editor, while the catalog domain and API remain in place.

Current API route families are `/api/health`, `/api/auth/*`, `/api/cloud-data/*`, `/api/public/*`, `/api/cvs/*`, `/api/cv-imports/*`, `/api/cv-applications/*`, `/api/cv-artifacts/*`, `/api/cv-templates/*`, `/api/cv-capabilities`, `/api/plans/*`, `/api/subscriptions/*`, and `/api/iam/*`. `/mcp` is a protocol endpoint handled by the MCP SDK over Streamable HTTP rather than a JSON REST route. Their data and security contracts belong to the corresponding subsystem specs.

### Public API Route Convention

From this contract onward, every newly introduced HTTP API that permits unauthenticated access **must** make that trust boundary visible in its route path under `/api/public/*` and its source file under `server/routes/api/public/`. For example, the unauthenticated template catalog is `GET /api/public/templates`; the complete authenticated catalog remains `GET /api/cv-templates`.

`/api/auth/*` is the sole naming exception because login, registration, logout, and session inspection inherently mix anonymous and authenticated authentication operations. Existing legacy public endpoints such as `/api/health`, CV document routes, and plan catalog routes are grandfathered until explicitly migrated; do not use their naming as precedent for new routes. A `public` data tag controls catalog inclusion but does not by itself bypass route authentication—the `/api/public/*` adapter remains the explicit public boundary.

### Feature Route Policy

`@ruxt/shared/features` exposes the framework-free feature strategy and authenticated-feature rule factory; it contains no deployment host or route values. Both global browser middleware and Nitro middleware construct and evaluate the same rule from runtime configuration. `NUXT_PUBLIC_FEATURE_FLAGS_AUTH_DISABLED_HOSTS` supplies comma-separated exact or wildcard hosts, while `NUXT_PUBLIC_FEATURE_FLAGS_AUTH_ROUTES` supplies comma-separated exact or `/**` prefix routes. Deno configuration sets these to `*.deno.net` and the authenticated browser/API routes, causing those routes to return 404 and suppressing authentication, import, and authenticated-template controls while public/local editor routes remain enabled. Empty values enable the feature on every host and assign no routes. Host controls are deployment segmentation, not a substitute for authorization.

## Runtime State

`nuxt.config.ts` owns application runtime aliases; `vitest.config.ts` repeats `@infra` because Vitest does not read Nuxt configuration. Neither may restore a source-directory `@core` alias. Package boundaries and types resolve through installed package export metadata.

The mediator, deployment strategy registry, SQLite connection, Deno KV connection, CV listener sets, per-document write queues, and pending analytics accumulator are process-local singletons. Clerk owns broker sessions; normalized browser auth and theme state use Nuxt `useState`; theme preference is persisted in `localStorage`; editor preferences use `localStorage` when signed out and the owner-keyed preference store when signed in. Canonical imported CV profiles exist as versioned snapshots inside CV applications. The separate `/p` convenience editor stores lightweight profile drafts only in browser `localStorage`; it has no server repository or canonical-application status. CV documents and subscription data use separate persistence systems.

## Current Gaps

- `README.md` and `docs/` still describe Ruxt primarily as a subscription platform; they do not fully map the current CV editor surface.
- Route/domain errors outside the auth routes are not translated consistently to explicit HTTP status codes.
- Handler registration is string-keyed and allows later duplicate registration to overwrite an earlier handler silently.
- Runtime ordering depends on the two Nitro plugin files being initialized in the required mediator-before-infra sequence.
