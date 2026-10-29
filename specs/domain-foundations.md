# Domain foundations

Reusable domain specifications are maintained in [ruxt-core/specs/domain.md](https://github.com/TuanKietTran/ruxt-core/blob/main/specs/domain.md).

Public @ruxt/shared owns value objects, datetime, email, phone, preferences, analytics primitives, and pure CV transformations. Private @ruxt/core owns password/IAM, payment, catalog/subscription, consent, import state, handlers, and repository interfaces.

Ruxt imports package exports rather than maintaining a domain copy. Browser-specific HTTP DTOs remain application-owned.
