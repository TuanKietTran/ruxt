# Repository ownership

| Repository | Owns |
| --- | --- |
| TuanKietTran/ruxt | Product UI, HTTP/MCP adapters, runtime infrastructure, app specifications/tests |
| TuanKietTran/ruxt-core | Private core, public shared primitives, public editor layer |
| TuanKietTran/ruxt-admin | Separate admin app, Clerk role enforcement, metrics/jobs, template administration |

Applications consume pinned package exports or a deliberate packed fallback. No submodules, sibling source aliases, or private source copies are used.

Ruxt and Admin deploy separately and have distinct application boundaries. Shared storage must be configured explicitly. Admin access requires its server-side role check, not ordinary Ruxt authentication.

Package contracts are maintained in ruxt-core/specs; admin contracts in ruxt-admin/specs. Repository visibility and package registry ACLs are separate from code ownership.
