# Deploy tooling for the isolated ruxt celld fleet: pinned celld v0.6.2 binary, Node, esbuild.
# Build context is the ruxt repository root (see compose.yaml).
FROM ghcr.io/denoland/celld:v0.6.2 AS cell
FROM node:22.15.1-bookworm-slim
COPY --from=cell /usr/local/bin/celld /usr/local/bin/celld
# Pinned to the esbuild version resolved in pnpm-lock.yaml (esbuild@0.28.2, transitive dependency).
RUN npm install -g esbuild@0.28.2
RUN corepack enable
WORKDIR /app
COPY . /app
RUN pnpm install --frozen-lockfile
