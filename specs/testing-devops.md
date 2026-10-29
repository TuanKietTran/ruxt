# Setup and verification

## Local setup

Use a current Node 22 LTS patch (at least 22.12) and pnpm 11.25.0, matching CI.

~~~sh
pnpm install --frozen-lockfile
test -e .env || cp .env.example .env
~~~

Before starting, set matching Clerk development keys and a unique NUXT_SESSION_SECRET of at least 32 characters. Missing keys can trigger Clerk keyless provisioning. Node development selects SQLite; no external database service is required.

~~~sh
pnpm dev
~~~

Open http://localhost:3000. /api/health returns status: ok. Sessions and profiles persist in browser storage; local.db and .data contain server state.

The core dependency uses vendor/tuankiettran-ruxt-core-0.3.0.tgz; shared/editor are exact registry pins. GitHub Packages mode uses NODE_AUTH_TOKEN through .npmrc. Editing the sibling core repository does not update installed artifacts automatically.

## Optional tools

pnpm cv:pipeline:setup creates .data/cv-pipeline-venv and installs pdfplumber, pytesseract, and Pillow. OCR also needs Tesseract; scanned PDFs need Poppler's pdftoppm. CV_PIPELINE_PYTHON overrides the interpreter.

Automated PDF rendering needs an installed Chromium-compatible browser and CHROMIUM_PATH. Shell assignments and the pipeline bin/python path assume POSIX; use WSL/Git Bash or platform equivalents on Windows.

## Checks

~~~sh
pnpm lint
pnpm exec nuxt typecheck
pnpm test
pnpm exec nuxt build --preset node-server
~~~

For the Node build, leave Deno/Cloudflare storage flags unset. pnpm build explicitly enables Deno storage. Nuxt preparation runs on install. Lint uses git ls-files and requires a real checkout/index.

Optional suites: test:workerd, test:smoke, test:session-continuity. Browser/auth suites require configured fixtures; skipped tests do not establish browser coverage. See [UI validation](cv-sv-ui-validation.md).

## Cloudflare and CI

pnpm cf:build, pnpm check:request-budget, and pnpm cf:deploy:dry verify Worker bundling/configuration. They do not verify a deployed runtime, resource access, CPU quotas, or DNS.

The workflow verifies main pushes, pull requests, tags, and manual runs. Deployment follows verification for v* tags on main or manual main dispatch and uses the cloudflare environment. See [runbook](cloudflare-migration-runbook.md).

## Local state

Stop the server before resetting disposable data. Preserve .data, local.db*, and browser storage unless reset is intended. Clearing browser site data removes primary local sessions/profiles. Credentials, exports, local databases, and runtime data do not belong in source control.

Coverage gaps include live Clerk flows, responsive/export regression, multi-instance consistency, restore rehearsal, and production runtime smoke tests.
