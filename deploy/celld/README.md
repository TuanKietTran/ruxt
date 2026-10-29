# Local celld fleet

Isolated Worker emulation with celld v0.6.2, MinIO, and two nodes. Compose project/bucket: ruxt-celld. Host ports: 19877 and 19878; node-to-node port 8081 stays container-only.

## Files

- compose.yaml: storage, bucket initialization, nodes, optional tools service.
- minio.Dockerfile: pinned MinIO/mc builds for local storage.
- tools.Dockerfile: celld, Node, esbuild, and application dependencies.
- env.example: local configuration.

## Run

1. Copy env.example to deploy/celld/.env and set a generated MinIO password.
2. Start storage/nodes:
   ~~~sh
   docker compose --env-file deploy/celld/.env -f deploy/celld/compose.yaml up -d --build minio bucket-init node-a node-b
   ~~~
3. Deploy the local Worker:
   ~~~sh
   CONFIRM_RUXT_CELLD_DEPLOY=YES docker compose --env-file deploy/celld/.env -f deploy/celld/compose.yaml --profile tools run --rm tools
   ~~~
4. Check http://127.0.0.1:19877 and http://127.0.0.1:19878.
5. Stop with the same compose arguments and stop. Removing volumes destroys fleet state.

## Limits

Local MinIO is not production storage qualification. Emulation does not establish Cloudflare CPU/bundle quotas or live Clerk behavior. Compose --env-file configures containers; it does not automatically supply Worker runtime variables.
