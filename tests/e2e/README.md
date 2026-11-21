# Cloud-data API end-to-end tests

Proves the cloud-data HTTP API against a real running Nitro server (node-server build, SQLite persistence, legacy cookie auth). Skipped unless E2E_BASE_URL is set; the unconfigured-server checks are skipped unless E2E_UNCONFIGURED_URL is set.

## Build

NITRO_PRESET=node-server corepack pnpm@11.25.0 exec nuxt build

## Start the servers (Git Bash)

Configured server on 3121:

mkdir -p /tmp/ruxt-e2e
PORT=3121 RUXT_SQLITE_PATH=/tmp/ruxt-e2e/e2e.db NUXT_SESSION_SECRET=e2e-session-secret-0123456789abcdef0123 NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZTJlLmNsZXJrLmFjY291bnRzLmRldiQ NUXT_CLERK_SECRET_KEY=sk_test_e2e_not_a_real_key NUXT_CLOUD_RETENTION_NOTICE_VERSION=e2e-notice-1 NUXT_CLOUD_RETENTION_SESSION_CURRENT_COPY_RETENTION_DAYS=30 NUXT_CLOUD_RETENTION_TEMPLATE_RETENTION_DAYS=30 NUXT_CLOUD_RETENTION_PROFILE_RETENTION_DAYS=30 NUXT_CLOUD_RETENTION_CHECKPOINT_RETENTION_DAYS=7 NUXT_CLOUD_RETENTION_RETENTION_EXTENSION_DAYS=30 node .output/server/index.mjs > /tmp/ruxt-e2e/server.log 2>&1 &

Unconfigured server on 3122: same command without the NUXT_CLOUD_RETENTION_* variables, with a separate db e2e-unconfigured.db and its own log file. Wait for GET /api/health on both.

## Run

E2E_BASE_URL=http://127.0.0.1:3121 E2E_UNCONFIGURED_URL=http://127.0.0.1:3122 npx vitest run tests/e2e/cloud-data-api.test.ts

## Stop

Kill both server PIDs and delete the throwaway databases when done.
