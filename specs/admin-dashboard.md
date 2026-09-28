# Dedicated Admin Dashboard

## Scope

The administration surface is a separate Nuxt application in the sibling `admin/` pnpm workspace. It is not mounted at `/admin` in the ruxt application and does not share ruxt's Clerk or legacy sessions. It may be deployed on an independently restricted origin.

It provides:

- GitHub-only administrator authentication;
- route, authenticated-owner, CQRS request, and Nitro task analytics;
- a durable CV import-job snapshot;
- versioned public CV template creation, editing, publication, unpublication, and deletion.

## Authentication and authorization

The login page starts and completes GitHub's OAuth authorization-code flow through `GET /api/oauth/github`; GitHub returns to the public `/oauth/github` bridge page. The callback uses a cryptographically random, session-bound state value. The token is used only to fetch `GET https://api.github.com/user`; it is never persisted. A successful callback rotates the session and retains only the numeric GitHub id, login, display name, and avatar URL.

Authorization is based on immutable numeric GitHub ids from `NUXT_GITHUB_ALLOWED_IDS`, not mutable login names. The initial allowlist contains `35926768` (`TuanKietTran`). Every `/api/*` request rechecks the current allowlist, so removing an id revokes existing sessions. Mutating API requests require an `Origin` that exactly matches `NUXT_ADMIN_ORIGIN`; missing and mismatched origins are rejected. The browser middleware is navigation convenience only; `admin/server/middleware/admin-guard.ts` is authoritative.

The admin app must have a unique `NUXT_SESSION_SECRET` of at least 32 characters outside development. Production also requires an HTTPS `NUXT_ADMIN_ORIGIN` with no path, query, or fragment. The OAuth callback is pinned to that origin; an explicit `NUXT_GITHUB_REDIRECT_URL`, when supplied, must exactly equal `<NUXT_ADMIN_ORIGIN>/oauth/github`. Startup fails closed when the origin, OAuth credentials, numeric allowlist, callback, or secure session secret is invalid. Production sessions use a host-only `__Host-` secure cookie, and private responses carry no-store, anti-framing, and no-referrer headers.

## Storage boundary

Both applications point at the same logical Nitro storage namespaces:

| Namespace | Producer / owner | Admin use |
|---|---|---|
| `analytics` | ruxt analytics plugin | read hourly aggregate metrics |
| `cvPipeline` | ruxt import pipeline | read import-job status |
| `cv` | ruxt CV adapters | manage template versions |

Filesystem defaults resolve to the root `.data/` directory. Separate/container deployments must configure `CV_DATA_DIR`, `CV_PIPELINE_DATA_DIR`, and `ANALYTICS_DATA_DIR` to shared durable backends or equivalent mounts. The current configuration uses Nitro's filesystem driver and therefore does not provide cross-host sharing without a shared volume.

The root feature-route policy does not govern the admin app. No `/admin` route or public navigation link is added to ruxt. The dedicated app sends `noindex, nofollow` metadata and an `X-Robots-Tag: noindex, nofollow, noarchive` response header to avoid search discovery, but authorization never relies on obscurity. Access segmentation for the admin origin belongs to its deployment in addition to the GitHub allowlist.

## Analytics

Ruxt aggregates samples in process by UTC hour and flushes approximately every 30 seconds. Keys are:

- `routes:<YYYY-MM-DDTHH>`: HTTP method plus matched route shape, with concrete ids normalized;
- `users:<YYYY-MM-DDTHH>`: authenticated owner id API activity;
- `cqrs:<YYYY-MM-DDTHH>`: query/command name and latency;
- `tasks:<YYYY-MM-DDTHH>`: Nitro background task outcomes.

Each metric records count, error count, total/max latency, and optional HTTP status counts. This is operational telemetry, not billing-grade data: an abrupt process termination can lose the pending interval, and multiple writers require a storage backend with appropriate update semantics. The dashboard reads trailing windows of 1 to 720 hourly buckets.

Owner ids are operational identifiers. No CV contents, request bodies, OAuth tokens, email addresses, or IP addresses are recorded.

## Template lifecycle

Templates use ruxt's existing immutable key scheme `templates:<id>:v<version>`.

- Creation stores unpublished version 1.
- Editing stores a new unpublished version; existing versions are immutable.
- Publishing adds the data-owned `public` tag and removes it from every other version of that template.
- Unpublishing removes the tag.
- Published or built-in versions cannot be deleted. Built-in versions would be re-seeded by ruxt and should instead be unpublished.
- `pipeline-default` is internal and cannot be published.
- User `local` templates are visible only as a count and remain managed by their owner in the CV editor.

Public discovery remains `GET /api/public/templates` in ruxt; the admin app changes the same persisted template records rather than introducing a second catalog.

### Template editor

`/templates/new` and `/templates/:id` use an IDE-style workspace with template metadata, Markdown/CSS tabs, a resizable live preview, Markdown formatting commands, and source-file import. Import accepts a template JSON object or `.md`/`.markdown` and `.css` files; importing only updates the unsaved browser draft. Creating persists unpublished v1, while saving an existing template always appends a new immutable unpublished version.

The browser workspace does not call or route through the ruxt application. Reusable source-editor and preview primitives live in the private `@ruxt/editor` workspace package (`packages/editor`), exposed as a route-free Nuxt layer consumed by both applications. The package owns CodeMirror and Markdown-rendering dependencies. Domain contracts remain in `core`, and persistence remains behind each application's own server API.

## Local operation

```bash
pnpm install
cp admin/.env.example admin/.env
pnpm dev          # ruxt on :3000; produces analytics
pnpm dev:admin    # dedicated admin on :3001
```

Create a GitHub OAuth app with callback URL `http://localhost:3001/oauth/github`.

## Admin subdomain deployment

The admin application builds as an independent Node/Nitro service; it is not deployed beneath the ruxt process or URL path. CI typechecks it, builds `admin/.output`, and uploads that directory as the `ruxt-admin-node-server` artifact. A container image can be built from the repository root:

```bash
docker build -f admin/Dockerfile -t ruxt-admin .
docker run --rm -p 3001:3000 \
  -e NUXT_ADMIN_ORIGIN=https://admin.example.com \
  -e NUXT_GITHUB_CLIENT_ID \
  -e NUXT_GITHUB_CLIENT_SECRET \
  -e NUXT_GITHUB_ALLOWED_IDS \
  -e NUXT_SESSION_SECRET \
  -e NUXT_GITHUB_REDIRECT_URL=https://admin.example.com/oauth/github \
  -v ruxt-data:/data \
  ruxt-admin
```

Point the admin subdomain's DNS and HTTPS reverse proxy at this service, set `NUXT_ADMIN_ORIGIN` to that exact origin, and configure the GitHub OAuth app callback as `https://admin.example.com/oauth/github`. The application uses the configured canonical origin rather than trusting forwarded host headers. The proxy must terminate HTTPS before traffic reaches users; it should still preserve the original `Host` and scheme for correct application URLs. `/api/health` is the only unauthenticated operational endpoint.

Production filesystem defaults are `/data/cv`, `/data/cv-pipeline`, and `/data/analytics`. Mount the same durable volume used by ruxt, or set `CV_DATA_DIR`, `CV_PIPELINE_DATA_DIR`, and `ANALYTICS_DATA_DIR` to shared paths during the build. Filesystem storage does not synchronize separate hosts; use a genuinely shared Nitro storage driver before scaling the applications independently.

Do not share session secrets or cookies with ruxt. Set a unique `NUXT_SESSION_SECRET` of at least 32 characters. The admin cookie is secure in production and the origin must therefore use HTTPS.
