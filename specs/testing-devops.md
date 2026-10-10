# Testing And Devops

Last updated: main@aca87ed | 2026-10-10

## Scope

This spec covers:

- package scripts and dependency locks in `package.json`, `infra/package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`;
- the Vitest runner configuration in `vitest.config.ts` and the checked-in suites under `tests/`;
- TypeScript/Nuxt preparation in `tsconfig.json`, `infra/tsconfig.json`, and generated `.nuxt` types;
- `.gitignore`, `.env.example`, and local/generated artifacts;
- `.github/workflows/deploy.yml` and repository contribution templates;
- development and automation commands, including MCP and headless PDF prerequisites;
- the local setup/run/teardown lifecycle;
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

## Local Lifecycle

Verified 2026-10-10 on Windows with Node 24, no globally installed pnpm, and port 3000 already taken.

**Setup**

```bash
pnpm install --frozen-lockfile   # CI pins pnpm 11.25.0; `npx -y pnpm@11.25.0 <cmd>` works without a global pnpm
pnpm lint && pnpm test           # hermetic gate; the two tests/smoke files skip without SMOKE_BASE_URL
```

Install takes about 40 seconds. `better-sqlite3` and esbuild build without extra tooling, and `postinstall` runs `nuxt prepare` into `.nuxt`. The test gate reported 163 passed and 19 skipped. `pnpm cv:pipeline:setup` (Python/Tesseract import pipeline) is optional for the editor and was not exercised.

**Run**

```bash
pnpm exec nuxt dev --host 127.0.0.1 --port 3010   # `pnpm dev` is the same on the default port 3000
```

The first request compiles and takes about 9 seconds. Quick checks:

- `GET /` returns 200.
- `GET /api/cvs` lists the auto-created "Current CV" and creates `.data/cv`.
- `GET /api/plans` returns `{"plans":[]}`.
- `POST /mcp` with `{"jsonrpc":"2.0","id":1,"method":"tools/list"}` needs the header `accept: application/json, text/event-stream`. It answers as an SSE `message` event listing `list_cvs`, `open_cv`, `save_cv` and the other tools.

Boot logs `infra ready — SQLite` and creates `local.db` (with `-shm`/`-wal`) in the working directory.

**Clerk keyless mode.** If `NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `NUXT_CLERK_SECRET_KEY` are unset, `@clerk/nuxt` starts in keyless mode on dev start:

- It provisions a temporary, unclaimed Clerk development instance, which is an outbound call.
- It writes `.clerk/` (git-ignored via `/.clerk/` in `.gitignore`; the module re-appends that entry to the tracked file only when it is missing).

Set a `pk_test_`/`sk_test_` pair in `.env` to avoid it.

**Teardown**

1. Stop the server process tree. Through `npx`, the chain is npx, then pnpm, then `nuxt.mjs`, and killing only the launching shell leaves `nuxt` listening. On Windows use `taskkill /PID <npx node pid> /T /F`, after matching the command line to the `nuxt dev` you started.
2. Delete runtime state: `.data/` (CV documents, pipeline jobs, analytics), `.clerk/`, and `local.db`, `local.db-shm`, `local.db-wal`. All are git-ignored.
3. Optional full purge: `rm -rf node_modules .nuxt`. Keep them as a dependency cache otherwise.

**Windows.** `build`, `test:smoke` and `cv:pipeline:setup` use POSIX syntax (`VAR=x cmd`, `${VAR:-x}`, `sh`) and fail under cmd or PowerShell. Run them from Git Bash or invoke the underlying command directly. `setup-cv-pipeline.sh` creates the venv at `.data/cv-pipeline-venv/bin/python`, a POSIX path; Windows venvs use `Scripts\python.exe`, so set `CV_PIPELINE_PYTHON`.

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

Ignored build/runtime paths include `.output`, `.nuxt`, `.nitro`, `.cache`, `dist`, `node_modules`, `.data`, logs, local SQLite database/WAL files, and local `.env*` except `.env.example`. `.clerk/` (Clerk keyless state, which can include secrets) is ignored by `/.clerk/`.

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
- A keyless `nuxt dev` (no Clerk keys in `.env`) still creates an unclaimed Clerk development instance as an outbound side effect, and the resulting `.clerk/` holds that instance's secret key.
- Three package scripts (`build`, `test:smoke`, `cv:pipeline:setup`) are POSIX-shell only, and the CV pipeline venv path is hard-coded to `bin/`, so none of them work natively on Windows.
- There is no documented teardown command; stopping the dev server and clearing `.data`, `.clerk` and `local.db*` is manual (see Local Lifecycle).
- There is no production deployment smoke test, multi-instance persistence test, or documented backup/restore procedure for either `local.db` or CV filesystem data.
