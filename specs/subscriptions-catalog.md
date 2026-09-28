# Subscriptions And Catalog

Last updated: main@d1ae665 | 2026-09-13

## Scope

This spec covers:

- subscription and catalog aggregates under `core/domain/subscription/` and `core/domain/catalog/`;
- plan/subscription repository ports in `core/repos/`;
- related handlers under `core/handlers/` and registration in `infra/registry.ts`;
- API routes under `server/routes/api/plans/` and `server/routes/api/subscriptions/`;
- retained browser surfaces `app/pages/d/index.vue`, `app/pages/d/providers.vue`, and `app/types/api.ts`; the plan-catalog page formerly at `/p` is retired and that path is now owned by the local profile editor.

Authentication and authorization boundaries are specified in [auth-iam-security.md](auth-iam-security.md); backend storage is specified in [persistence-deployment.md](persistence-deployment.md).

## Catalog Model

`Plan` owns id, name, description, provider, source (`catalog` or `user`), optional creator, `Money`, `BillingCycle`, optional trial duration, features, and visibility. Names are trimmed, required, and limited to 100 characters. Features are trimmed and empty entries removed.

Money uses non-negative integer minor units for USD, EUR, GBP, AUD, CAD, SGD, JPY, and VND. Currency must match for arithmetic. Billing periods are weekly, monthly, quarterly, biannual, and yearly, modeled as nominal fixed durations of 7, 30, 91, 182, and 365 days. `annualCost` multiplies price by the ratio of 365 days to the nominal cycle.

Plan API routes are:

- `GET /api/plans`: public plans by default; `all=true` returns every plan; a truthy `userId` selects only user-created plans for that id;
- `GET /api/plans/:id`: returns complete serialized plan data;
- `PUT /api/plans/:id`: creates or fully replaces a plan from the body;
- `DELETE /api/plans/:id`: verifies existence, then hard-deletes it.

## Subscription Model

`Subscription` owns id, user id, current plan id, status, start/current-period timestamps, optional trial/cancel/pause timestamps, and an optional next-interval plan id. Mutations return new immutable aggregate instances.

A subscription begins `trialing` only when a positive trial duration is supplied; otherwise it begins `active`. Access is granted only for `active` and `trialing`.

Allowed status transitions are:

```text
trialing -> active | cancelled | expired
active   -> past_due | paused | cancelled | expired
past_due -> active | cancelled | expired
paused   -> active | cancelled | expired
cancelled/expired -> no transitions
```

Pause, resume, and cancel use those transitions. Scheduling a plan change rejects terminal subscriptions and the current plan; a later schedule replaces the prior pending plan. Renewal applies a pending plan id atomically, clears it, advances the period, and restores `past_due` to `active`.

`SubscriptionService` provides next-billing, trial-expiry, and should-renew calculations but has no current handler or scheduled-job call site.

## Subscription API

- `POST /api/subscriptions`: creates with a generated UUID; cycle defaults to monthly and start defaults to now.
- `GET /api/subscriptions?userId=...`: lists subscriptions for the exact user id; missing/non-string id returns 400.
- `GET /api/subscriptions/:id`: returns the complete serialized aggregate.
- `DELETE /api/subscriptions/:id`: hard-deletes an existing subscription.
- `POST /api/subscriptions/:id/cancel`: optional `cancelledAt`.
- `POST /api/subscriptions/:id/pause`: optional `pausedAt`.
- `POST /api/subscriptions/:id/resume`: resumes to active.
- `POST /api/subscriptions/:id/renew`: optional `renewedAt` and billing period, defaulting to now/monthly.
- `PUT /api/subscriptions/:id/plan-change`: schedules body `newPlanId`.
- `DELETE /api/subscriptions/:id/plan-change`: clears a pending change.

Explicit timestamps must be ISO-8601 with `Z` or an offset. Handler/domain failures are surfaced through mediator exceptions; most routes do not map them to resource-specific status codes.

## Browser Management Surfaces

`/d` loads all plans and subscriptions for query `userId`, defaulting to `demo`. It computes active/trial counts, nominal monthly spend per currency, earliest period end, search/status filtering, and plan lookup. It can create a subscription, create a user plan and then subscribe, cancel, and hard-delete after typing the plan name.

The legacy plan-catalog page formerly at `/p` has been removed because it is not part of the CV product; `/p` now belongs to the local profile editor. Catalog and subscription domain code, handlers, repositories, and APIs remain available in core/server. `/d/providers` groups all plans by provider. `app/types/api.ts` mirrors serialized domain output for the retained dashboard pages.

## Current Gaps

- Plan and subscription routes do not authenticate callers, enforce ownership, or invoke IAM decisions.
- Creating a subscription does not verify that the referenced plan exists; scheduling a plan change does not verify the target plan.
- Deleting a plan does not check for referencing subscriptions or cascade/update them.
- `renew()` can run on paused, trialing, cancelled, or expired subscriptions because it does not enforce a renewal-eligible status.
- Trial end and current period end are calculated independently; a trial does not extend or replace the first billing period.
- Nominal fixed-day billing periods are not calendar-month/calendar-year arithmetic.
- Dashboard management covers only create, cancel, and hard delete; pause, resume, renew, and plan-change APIs lack corresponding UI controls.
