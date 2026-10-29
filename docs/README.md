# Documentation

Current behavior and setup live in [specs/_readme.md](../specs/_readme.md).

| Guide | Purpose |
| --- | --- |
| [Architecture](architecture.md) | Runtime and package ownership |
| [Extending](extending.md) | Handlers, repositories, policies, routes |
| [Repository ownership](repository-split.md) | Boundaries between the three projects |
| [Cloudflare migration](MIGRATION.md) | Runtime/storage limits and readiness |
| [Local fleet](cloudflare-migration.md) | celld emulation |
| [Data migration](data-migration.md) | Deno KV export, transform, import, verify |
| [Cutover](cutover-checklist.md) | Routing, freeze, rollback |

Administration specifications belong to [ruxt-admin/specs](https://github.com/TuanKietTran/ruxt-admin/tree/main/specs). Reusable package contracts belong to [ruxt-core/specs](https://github.com/TuanKietTran/ruxt-core/tree/main/specs).
