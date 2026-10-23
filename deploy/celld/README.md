# ruxt on a local celld fleet

Local validation of the ruxt Worker on celld v0.6.2 without a Cloudflare account. Fully isolated from `distributed-agent-chat`: project `ruxt-celld`, bucket `ruxt-celld`, volumes `ruxt-celld_*`, host ports 19877/19878. Do not use `session-chat` resources or ports 8787, 18877, 18878.

Status: local configuration only; the compose procedure and pinned tools image are present, but they have not been built or run. No start/inspect/stop/deploy scripts or celld runtime evidence are included. The repository now contains `wrangler.json` and the app build configuration.

## Files

- `compose.yaml`: MinIO (local S3), bucket init, two celld nodes, optional `tools` deploy service (profile `tools`).
- `minio.Dockerfile`: builds pinned upstream MinIO `RELEASE.2025-04-22T22-12-26Z` and mc `RELEASE.2025-04-16T18-13-26Z` from source. Local test storage only.
- `tools.Dockerfile`: pinned celld v0.6.2 binary, Node 22.15.1, esbuild, pnpm install of the repo.
- `env.example`: variable names and defaults. Copy to `.env` (gitignored).

## Procedure (each step needs explicit operator approval)

1. Create `deploy/celld/.env` from `env.example`, set `MINIO_ROOT_PASSWORD` to a generated value. Do not print it.
2. Start storage and nodes: `docker compose --env-file deploy/celld/.env -f deploy/celld/compose.yaml up -d --build minio bucket-init node-a node-b`
3. Deploy the built Worker to the isolated bucket: `CONFIRM_RUXT_CELLD_DEPLOY=YES docker compose --env-file deploy/celld/.env -f deploy/celld/compose.yaml --profile tools run --rm tools`
4. Inspect (tools container, read-only probe): `docker compose --env-file deploy/celld/.env -f deploy/celld/compose.yaml run --rm tools celld diagnose --read-only --bucket s3://ruxt-celld --endpoint http://minio:9000 --region us-east-1`
5. Stop: `docker compose --env-file deploy/celld/.env -f deploy/celld/compose.yaml stop`. Do not use `down -v` unless destroying all ruxt fleet state.

Worker URLs: `http://127.0.0.1:19877` (node-a), `http://127.0.0.1:19878` (node-b).

## Limits

- MinIO is local test storage, not production storage qualification.
- The node-to-node (`--internal-listen`, port 8081) listener is container-only and not published.
- `celld deploy` bundles with esbuild and requires `wrangler.json` at the project root. esbuild is pinned to 0.28.2, matching `pnpm-lock.yaml`. The `pnpm install` step and the tools image build have not been run.
- Compose `--env-file` only; `.env` is not read by the Worker runtime.
