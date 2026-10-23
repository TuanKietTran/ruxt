# Registry-independent source build of the actual pinned upstream MinIO and mc releases.
# Local celld validation storage only. MinIO is not production-qualified upstream.
# Same pins as distributed-agent-chat/infra/minio.Dockerfile.
FROM golang:1.24.2-bookworm AS minio-build
ENV GOPROXY=https://proxy.golang.org CGO_ENABLED=0 GOTOOLCHAIN=auto
WORKDIR /src
ADD https://codeload.github.com/minio/minio/tar.gz/refs/tags/RELEASE.2025-04-22T22-12-26Z /tmp/source.tar.gz
RUN tar -xzf /tmp/source.tar.gz --strip-components=1 -C /src
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
  go build -buildvcs=false -trimpath -ldflags="-s -w -X github.com/minio/minio/cmd.Version=2025-04-22T22:12:26Z -X github.com/minio/minio/cmd.ReleaseTag=RELEASE.2025-04-22T22-12-26Z -X github.com/minio/minio/cmd.CopyrightYear=2025" -o /out/minio .

FROM golang:1.24.2-bookworm AS mc-build
ENV GOPROXY=https://proxy.golang.org CGO_ENABLED=0 GOTOOLCHAIN=auto
WORKDIR /src
ADD https://codeload.github.com/minio/mc/tar.gz/refs/tags/RELEASE.2025-04-16T18-13-26Z /tmp/source.tar.gz
RUN tar -xzf /tmp/source.tar.gz --strip-components=1 -C /src
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
  go build -buildvcs=false -trimpath -ldflags="-s -w -X github.com/minio/mc/cmd.Version=2025-04-16T18:13:26Z -X github.com/minio/mc/cmd.ReleaseTag=RELEASE.2025-04-16T18-13-26Z -X github.com/minio/mc/cmd.CopyrightYear=2025" -o /out/mc .

FROM debian:bookworm-slim AS base
COPY --from=minio-build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
FROM base AS minio
COPY --from=minio-build /out/minio /usr/local/bin/minio
ENTRYPOINT ["/usr/local/bin/minio"]
FROM base AS mc
COPY --from=mc-build /out/mc /usr/local/bin/mc
ENTRYPOINT ["/usr/local/bin/mc"]
