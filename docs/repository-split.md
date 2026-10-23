# Repository ownership

Ruxt is split into three repositories before any Deno Deploy project is connected:

| Repository | Visibility | Ownership |
|---|---|---|
| `TuanKietTran/ruxt` | Public | Product Nuxt app, Nitro APIs/adapters, infrastructure, product docs, and app tests |
| `TuanKietTran/ruxt-core` | Public | Framework-free `@ruxt/core` package and route-free `@ruxt/editor` Nuxt layer shared by Ruxt and Ruxt Admin |
| `TuanKietTran/ruxt-admin` | Private | Dedicated admin Nuxt app, GitHub allowlist authentication, analytics UI, and template administration |

## Dependency policy

`ruxt-core` is the sole source of shared domain contracts and editor primitives. It publishes independently versioned `@ruxt/core` and `@ruxt/editor` packages. The two applications consume pinned package versions; they do not use Git submodules, sibling-directory aliases, or private source copies. This keeps Deno Deploy builds reproducible and prevents the public Ruxt repository from containing admin source or history.

Until the first packages are published, extraction branches may retain workspace references only as a migration aid. Do not connect a Deno Deploy project until each application installs shared packages from the registry with a frozen lockfile and passes its standalone build.

## Deployment boundary

- Ruxt and Ruxt Admin are separate deployable services and origins.
- Ruxt exposes no `/admin` route or public admin navigation.
- Admin visibility is private at the repository and deployment layers; OAuth allowlisting remains authoritative.
- Storage sharing is configured explicitly by deployment. Filesystem paths are not a cross-host synchronization mechanism.
- Deno Deploy project creation and GitHub repository linking happen only after the remote split, package publication, and standalone build verification.
