---
name: New use-case / handler
about: Propose a new CQRS command or query handler
title: "[Handler] "
labels: enhancement, core
assignees: ""
---

## Use-case summary

<!-- One sentence: what should the system be able to do? -->

## Command or Query?

- [ ] **Command** — mutates state (e.g. cancel, pause, create)
- [ ] **Query** — read-only (e.g. get, list, check)

## Handler name

<!-- PascalCase, e.g. "ExpireSubscription" or "ListInvoices" -->

## Input payload

<!-- What fields does the handler need? -->

| Field | Type | Required | Notes |
|---|---|---|---|
| | | | |

## Output payload

<!-- What does the handler return on success? -->

| Field | Type | Notes |
|---|---|---|
| | | |

## Domain logic

<!-- Describe the business rules this handler must enforce. Reference domain entities and status transitions where relevant. -->

## Repository dependencies

<!-- Which repos does this handler need? Check all that apply. -->

- [ ] `SubscriptionRepository`
- [ ] `PlanRepository`
- [ ] `IamSubjectRepository`
- [ ] `UserRepository`
- [ ] New repository required — describe below

## API surface

<!-- Does this handler need a new API route? If yes, specify the method and path. -->

- [ ] No new route needed
- [ ] `METHOD /api/path` — describe the request/response shape below

## Acceptance criteria

- [ ] Handler created at `core/handlers/<name>.ts` following the three-export pattern
- [ ] Registered in `infra/registry.ts`
- [ ] API route added (if applicable)
- [ ] Error cases handled (not found, invalid transition, etc.)