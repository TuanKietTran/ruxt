# Extending Ruxt

## Domain and handlers

Implement business/security use cases in the private ruxt-core repository. Public generic contracts and CV transformations belong in its packages/shared; editor primitives belong in packages/editor.

Each handler owns input/output types, a create*Handler factory, a command/query envelope factory, and a register* helper. Use @ruxt/shared/cqrs and injected repository interfaces. Keep framework/database dependencies in application adapters.

Build and verify the changed packages, then update the consuming artifact and lockfile. Never alias application imports to sibling source.

## Persistence

Implement private core repository interfaces in infra/deploy or Nitro-owned adapters. Register runtime strategies with explicit predicates and weights. Register handlers through infra/registry.ts or infra/cv-registry.ts after the shared mediator is mounted.

Test adapter behavior, serialization, indexes, and atomicity for every supported runtime. An in-process queue is not a multi-instance lock.

## HTTP and authorization

Routes validate transport input, derive authenticated ownership, dispatch handlers, and map errors to HTTP. New anonymous non-auth APIs belong under /api/public/. Calling an IAM query is not a substitute for enforcing its result.

Template visibility, cloud consent, expected revisions, and payload limits belong at the relevant server/core boundary as well as in UI controls.

## User interface

Reuse the editor shell and registered contexts. Browser code imports public shared/editor exports or application-owned DTOs only. Preserve local data on failures and never overwrite dirty content automatically.

Update the owning [specification](../specs/_readme.md). Run relevant unit/adapter checks plus browser/print validation for visible changes.
