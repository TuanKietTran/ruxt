# Testing And Devops

Last updated: main@6c64d4f | 2026-09-20

## Scope

This spec covers:

- package scripts and dependency locks in `package.json`, `infra/package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`;
- the Vitest runner configuration in `vitest.config.ts` and the checked-in suites under `tests/`;
- TypeScript/Nuxt preparation in `tsconfig.json`, `infra/tsconfig.json`, and generated `.nuxt` types;
- `.gitignore`, `.env.example`, and local/generated artifacts;
- `.github/workflows/deploy.yml` and repository contribution templates;
- development and automation commands, including MCP and headless PDF prerequisites;
- current executable validation coverage.

## Development Commands

The root package owns:

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint                 # architecture/layout/type-ownership checks
pnpm test                 # hermetic Vitest suites under tests/
pnpm test:watch           # same suites in watch mode
pnpm test:smoke           # opt-in HTTP smoke suite against a running server
pnpm generate
pnpm preview
pnpm cv:pipeline:setup # create the ignored Python venv for imports
```

`postinstall` runs `nuxt prepare`, generating Nuxt types/config under `.nuxt`. The root `tsconfig.json` references Nuxt-generated app/server/shared/node projects; run preparation before treating standalone TypeScript results as authoritative. `infra/tsconfig.json` is strict and owns workspace aliases for infrastructure source.

The app normally runs at `http://localhost:3000`; its MCP Streamable HTTP endpoint is `/mcp`. The editor's persistent EventSource means browser automation should not wait for network idle.

## Dependencies And Platform Requirements

The lockfile is the dependency integrity/version authority. pnpm overrides all CodeMirror users to `@codemirror/state` 6.7.3 and permits native/build scripts for Parcel watcher, `better-sqlite3`, and esbuild.

SQLite local development requires the native `better-sqlite3` package to build or have a compatible binary. Deno KV support lives in the `infra` workspace. CV editing uses browser-only CodeMirror and html2canvas paths; Markdown rendering is unified/remark/rehype based.

Server imports require Python plus `pdfplumber`, `pytesseract`, and Pillow; `pnpm cv:pipeline:setup` installs them into `.data/cv-pipeline-venv`. OCR additionally needs the Tesseract executable, and scanned-PDF fallback needs `pdftoppm`. The server reports missing Python packages through `/api/cv-capabilities` rather than accepting unusable jobs. `CV_PIPELINE_PYTHON`, `CV_PIPELINE_DIR`, upload size, artifact TTL, and storage location are configurable.

`scripts/render-pdf.mjs` requires an installed Chromium-compatible executable. `playwright-core` does not download a browser; set `CHROMIUM_PATH` unless the default macOS Brave path exists. The script currently expects exactly two rendered CV sheets.

## Automated Test Suites

`vitest` (dev dependency, Node environment) is the runner. `vitest.config.ts` re-declares the `@core` and `@infra` aliases that `nuxt.config.ts` owns, because Vitest does not read Nuxt configuration, and it includes only `tests/**/*.test.ts`.

Suites are layered by what they can assert without a server:

- `tests/core/cqrs.test.ts`: mediator command/query routing, the unknown-request error, thrown-error-to-failed-result conversion, and rejection unwrapping at `send()`.
- `tests/core/cv-split.test.ts`: `core/domain/cv/split.ts` inline-Markdown reduction, contact classification, profile extraction for both the Harvard table layout and the pipeline `###`/italic-metadata layout, and skeleton generation including idempotency and fenced-code preservation. The Harvard cases read `app/data/reference-cv.md`, which is checked-in placeholder content and not user data.
- `tests/core/save-cv-template.test.ts`: `SaveCvTemplate` save-as-new and override paths, name trimming/cap, size ceilings, override refusal for built-in or `public` templates, plus `CloneCvTemplate` id validation and version pinning.
- `tests/core/cv-documents.test.ts`: `CvDocument` invariants, `assertExpectedRevision`/`CvRevisionConflict`, and the create/save/patch handlers against an in-memory `CvDocumentPort` that mirrors the store's revision and conflict contract.
- `tests/core/domain-foundations.test.ts`: email, instant/duration/social-date, money, billing cycle, subscription status transitions and terminal states, subscription lifecycle, plan normalization, and card masking/Luhn rejection.
- `tests/core/iam-policy.test.ts`: attribute validation and the deny-overrides combinator, including default-deny, owner scope, service-account read-only override, and same-org read-only access.
- `tests/core/feature-flags.test.ts`: wildcard-host boundaries, exact/prefix route ownership, authenticated-route suppression on shared Deno hosts, public-route availability, and deployment host-list overrides.

Handler suites construct handlers directly with fake repositories rather than booting Nitro, so the singleton mediator and infra bootstrap are not required. `tests/helpers/fakes.ts` owns those fakes; the mediator helper calls `mountVendor()` once because the mediator is a process singleton.

Error-message assertions are deliberate: `server/utils/api-errors.ts` maps domain messages to HTTP status by text, so the suites pin the exact wording that produces 400/404/409/413.

`tests/smoke/http.test.ts` is opt-in and self-skipping. Without `SMOKE_BASE_URL` the whole suite is skipped so `pnpm test` stays hermetic; with it, the suite fails fast if no server answers `/api/health`. It covers health, CV capabilities in either available or degraded form, the unauthenticated `/api/public/templates` catalog, the 401 on unauthenticated `POST /api/cv-templates`, auth rejection paths, anonymous session inspection, MCP `initialize` over Streamable HTTP, and server-rendered `/` and `/p`.

## Artifacts And Sensitive Data

Ignored build/runtime paths include `.output`, `.nuxt`, `.nitro`, `.cache`, `dist`, `node_modules`, `.data`, logs, local SQLite database/WAL files, and local `.env*` except `.env.example`.

Do not commit generated Nuxt/Nitro output, `local.db`, `.data/cv`, rendered PDFs/images, logs, or local environment files. CV documents, exports, and browser profile storage may contain personal data. Do not copy profile `localStorage` values into fixtures, screenshots, logs, or issue reports. Session secrets and future MCP credentials belong in local/deployment secret configuration, never source or command output.

## CI And Deployment

The checked-in `.github/workflows/deploy.yml` validates a Deno-targeted build on pushes to `main`, pull requests, and manual dispatch. Deno Deploy's native GitHub integration separately builds each commit and promotes the default branch to Production.

Deno environment variables are runtime context configuration, not repository or GitHub secrets. Configure the same three names twice in the Deno application settings:

| Deno context | Timelines | Clerk keys | Session secret |
|---|---|---|---|
| Production | Production/default branch | matching `pk_live_` and `sk_live_` values | unique `NUXT_SESSION_SECRET` |
| Development | Preview URLs and Git Branch URLs | matching `pk_test_` and `sk_test_` values | a different `NUXT_SESSION_SECRET` |

The names are `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NUXT_CLERK_SECRET_KEY`, and `NUXT_SESSION_SECRET`. They are not needed in Deno's Build context. Deno configuration also sets `NUXT_PUBLIC_FEATURE_FLAGS_AUTH_DISABLED_HOSTS=*.deno.net` and `NUXT_PUBLIC_FEATURE_FLAGS_AUTH_ROUTES` to the authenticated route list shown in `.env.example`. Both are comma-separated runtime policy and have empty application defaults, so no deployment rule is hard-coded; custom application domains retain authentication. `server/plugins/validate-deployment-env.ts` uses `DENO_TIMELINE` to reject absent keys, test keys in Production, live keys in non-production timelines, or a weak/missing session secret. Clerk production must allow the production application domain; preview OAuth remains isolated in Clerk Development and must not be used for real accounts or data.

Issue and PR templates request layer classification, acceptance criteria, local `pnpm dev` testing, and screenshots/logs, but they do not execute checks.

## Validation Expectations

For documentation-only spec changes, verify the DocumentMap has exactly one link for every non-index spec and no dead relative links.

For source changes, the current minimum available gates are:

```bash
pnpm lint
pnpm test
pnpm build
pnpm dev                 # exercise user-facing/API behavior
# connect an MCP client to http://localhost:3000/mcp
node scripts/render-pdf.mjs <url> <output.pdf>
```

Build success covers Nuxt compilation and some TypeScript integration but does not replace API, persistence, realtime, browser, export, or deployment testing. User-facing editor changes should be checked at responsive sizes and in print preview; concurrency changes should use two browser clients or browser plus MCP.

## Current Gaps

- There is no format or dedicated type-check package script. The checked-in `lint` script enforces focused architecture contracts but is not a general TypeScript/Vue/style linter.
- CI is disabled and therefore does not run the test suites or enforce frozen install, build, security checks, or artifact validation.
- Executable coverage exists for domain transitions/validators, IAM policy, CV split/template handlers, and CV document revision/patch handlers. It does not yet cover the real Nitro document store, repository parity, SQLite migration, Deno KV indexes, SSE streams, import cancellation/recovery, Markdown sanitization, CodeMirror, responsive UI, or export output.
- The smoke suite asserts status codes and coarse shapes only; it does not authenticate, so authenticated CV, template-save, import, subscription, and IAM routes have no end-to-end coverage.
- No component or browser-level tests exist; `app/` is covered only indirectly through the architecture lint and the smoke suite's server-rendered page checks.
- Headless PDF automation is not portable by default and has no package script or CI browser setup.
- There is no production deployment smoke test, multi-instance persistence test, or documented backup/restore procedure for either `local.db` or CV filesystem data.
