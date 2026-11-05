# Platform releases

## Current state

Releases are git tags and nothing else: `v0.1.0` and `v0.1.1` (2026-10-28), `v0.1.2` (2026-10-28), `v0.1.3` and `v0.1.4` (2026-11-04). Tag subjects double as release notes. The deploy job in `.github/workflows/deploy.yml` runs only on pushed `v*` tags or manual dispatch, in the GitHub environment `cloudflare`. There is no version field in the repository, no `CHANGELOG` file, no release channels, and no artifact, promotion or rollback records. Everything below that goes beyond the tag flow is Planned.

## Versions

- The application version is a single semantic version `MAJOR.MINOR.PATCH`, recorded in the release registry when a release is created (Planned). Git tags keep the `v` prefix (`v0.1.4`); the registry stores the version without it (`0.1.4`).
- Package versions in the pnpm workspace (for example `@ruxt/core` and `@ruxt/editor`, currently `0.1.1` in the admin application) are recorded per release as a map, not managed independently: a release captures the package versions present at its tag.
- A pre-release carries a channel suffix in the registry only (`0.2.0-canary.1`); git tags are created only for stable releases and for canary releases that are deployed.

## Release channels

Three channels, Planned as registry data (no channel concept exists today):

| Channel | Meaning | Who receives it |
| --- | --- | --- |
| `dev` | Every merged main build; identified by commit, not a version | Local and self-hosted development |
| `canary` | A tagged pre-release deployed for verification | The production domain only after a canary plan is applied |
| `stable` | A promoted or directly tagged release | Default for all deployments |

## Release record (registry schema)

File: `tools/platform/data/registries/releases.json` — `{ releases: ReleaseRecord[] }`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `version` | string | yes | Semver without the `v` prefix |
| `tag` | string | yes | Git tag, e.g. `v0.1.4`; the tag is the release record of origin |
| `commit` | string | yes | Full commit hash the tag points at |
| `channel` | `'dev' \| 'canary' \| 'stable'` | yes | |
| `createdAt` | string (ISO 8601) | yes | |
| `notes` | string | yes | Generated changelog section for this release (see below) |
| `packages` | object | yes | Map of package name to version at the tag |
| `artifacts` | ArtifactRecord[] | yes | May be empty for a web-only release |
| `health` | `'unknown' \| 'ok' \| 'failed'` | yes | Result of the post-release smoke checks |
| `promotedFrom` | string | no | Version this release was promoted from |
| `rolledBackFrom` | string | no | Version whose rollback created this record |

`ArtifactRecord`: `{ platform: 'web' | 'desktop-macos' | 'desktop-windows' | 'desktop-linux' | 'android' | 'ios' | 'flutter', name: string, checksum: string (SHA-256), sizeBytes: number, builtAt: string (ISO 8601), source: string }`, where `source` names the build command or workflow that produced the artifact. Desktop, Android, iOS and Flutter artifacts are Planned: the only build that exists today is the web build (Deno default and Cloudflare `cf:build`).

## Changelog generation (Planned)

`platform releases changelog --from <tag> --to <tag>` generates a changelog section from commit subjects between the two tags, grouped by the conventional prefixes already in use (`fix:`, `feat:`, `docs:` and unprefixed subjects under Changes), in tag order, matching how the existing tag subjects read as release notes. The generated section is stored in the release record's `notes` field and prepended to a `CHANGELOG.md` at release creation. Generation is a plan-producing action: the changelog diff is a plan item, and writing it happens on apply.

## Build orchestration, promotion and rollback (Planned)

CLI (module `tools/platform/src/commands/releases.ts`):

```
platform releases list
platform releases plan-create --version <semver> --channel <channel>
platform releases plan-promote --version <semver> --to stable
platform releases plan-rollback --to <version>
```

Each `plan-*` command produces a Plan (platform-control-plane.md) whose items are, in order: tag creation, changelog write, registry record, per-platform artifact builds that exist for the target platforms, deployment, and the smoke checks below. Promotion `canary -> stable` never rebuilds: it re-tags the canary commit as a stable version and reuses its artifact records and checksums. Rollback creates a new release record pointing at the earlier version's commit and artifacts, with `rolledBackFrom` set; it never moves or deletes tags.

## Health and smoke checks

After any release apply, `platform verify --plan <planId>` runs the release checks and records the result in the record's `health` field: the deployed `/api/health` response, the custom domain answering on the release's domain record (platform-domains.md), and the storage health reported by the active data adapter (platform-data.md). A failed check marks the release `health: 'failed'` and is a verification result, not an automatic rollback.
