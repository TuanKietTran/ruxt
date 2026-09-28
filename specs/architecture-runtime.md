# Architecture And Runtime

Last updated: main@6c64d4f | 2026-09-20

## Scope

This spec covers:

- root configuration in `package.json`, `pnpm-workspace.yaml`, `nuxt.config.ts`, and `tsconfig.json`;
- Nuxt application entry and routing under `app/`;
- Nitro plugins and routes under `server/`;
- CQRS dispatch in `core/cqrs.ts` and registration in `infra/registry.ts`;
- CV domain and transport types under `core/domain/cv/`;
- the `infra` and dedicated `admin` workspace packages and top-level source ownership.

## Runtime Shape

The application is Nuxt 4 with Vue 3 and Nitro, using TypeScript ESM and an ES2022 Nitro target. Nuxt file routing owns browser pages; Nitro file routing owns HTTP endpoints. `@clerk/nuxt` supplies browser identity components and verified server request context. The root package includes `infra` as a pnpm workspace package.

Current top-level ownership is:

- `app/`: Vue pages, layouts, components, composables, themes, editor data, browser export utilities, and browser workers;
- `server/`: Nitro startup, HTTP route adaptation, session helpers, CV persistence/realtime, the Python pipeline adapter/worker, and MCP;
- `core/`: framework-free CV/profile/template/application domains, value objects, CQRS handlers, repository/service ports, and shared feature-policy exports under `core/shared/`;
- `infra/`: scrypt, SQLite/Deno KV adapters, deployment strategy selection, and handler registration;
- `admin/`: separately served Nuxt dashboard with independent GitHub OAuth, analytics readers, and template administration;
- `scripts/`: standalone automation, currently headless PDF rendering.

`@core` and `@infra` aliases are configured for Vite and Nitro. `nuxt.config.ts` also adds a Nitro Rollup loader for first-party `?raw` imports so Markdown and CSS seed assets can be imported by server code.

## Dependency Direction

The intended application dependency direction is:

```text
app -----------------------> core (public domain types only)
  |                            ^
  v                            |
server -> core handlers <- infra adapters
```

`core` does not import Nuxt, Nitro, Vue, database, or transport modules. Cross-runtime feature policy is published only through the `@core/shared` package barrel; app and server adapters do not import its internal modules. Repository interfaces in `core/repos/` are ports implemented by `infra/deploy/*` or Nitro-owned adapters. HTTP routes adapt requests to CQRS handlers. CV REST and MCP independently dispatch document handlers; import routes dispatch one-purpose import handlers and use server adapters for multipart bytes and subprocess execution.

Browser and Nitro code import CV contracts from `core/domain/cv/`; the retired `shared/types/cv.ts` forwarding layer no longer exists. App-local copies of core CV/profile contracts are forbidden: UI-only persistence metadata may be expressed as intersections with exported core types.

## CQRS And Boot

`core/cqrs.ts` owns one process-global `Mediator`. `mountVendor()` creates it once. Handlers are keyed by string `requestName`; command lookup is attempted before query lookup. `createHandler()` converts thrown handler/domain errors into `{ success: false, error }`, and `Mediator.send()` throws that error to callers.

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
- `/about`: construction/marketing page;
- `/login`: deep-link/redirect bridge to the global Clerk-backed sign-in and account-creation dialog;
- `/p`: browser-local profile editor;
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

`core/shared` publishes the framework-free feature strategy and authenticated-feature rule factory; it contains no deployment host or route values. Both global browser middleware and Nitro middleware construct and evaluate the same rule from runtime configuration. `NUXT_PUBLIC_FEATURE_FLAGS_AUTH_DISABLED_HOSTS` supplies comma-separated exact or wildcard hosts, while `NUXT_PUBLIC_FEATURE_FLAGS_AUTH_ROUTES` supplies comma-separated exact or `/**` prefix routes. Deno configuration sets these to `*.deno.net` and the authenticated browser/API routes, causing those routes to return 404 and suppressing authentication, import, and authenticated-template controls while public/local editor routes remain enabled. Empty values enable the feature on every host and assign no routes. Host controls are deployment segmentation, not a substitute for authorization.

## Runtime State

`nuxt.config.ts` is the only alias authority at runtime. `vitest.config.ts` re-declares `@core` and `@infra` for the test runner because Vitest does not read Nuxt configuration; the two must be kept in sync when an alias changes.

The mediator, deployment strategy registry, SQLite connection, Deno KV connection, CV listener sets, per-document write queues, and pending analytics accumulator are process-local singletons. Clerk owns broker sessions; normalized browser auth and theme state use Nuxt `useState`; theme preference is persisted in `localStorage`. Canonical imported CV profiles exist as versioned snapshots inside CV applications. The separate `/p` convenience editor stores lightweight profile drafts only in browser `localStorage`; it has no server repository or canonical-application status. CV documents and subscription data use separate persistence systems.

## Current Gaps

- `README.md` and `docs/` still describe Ruxt primarily as a subscription platform; they do not fully map the current CV editor surface.
- Route/domain errors outside the auth routes are not translated consistently to explicit HTTP status codes.
- Handler registration is string-keyed and allows later duplicate registration to overwrite an earlier handler silently.
- Runtime ordering depends on the two Nitro plugin files being initialized in the required mediator-before-infra sequence.
