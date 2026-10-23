# Extending the Platform

This guide covers the most common extension points: adding handlers, deploy strategies, IAM policies, and API routes.

---

## 1. Adding a New Command or Query Handler

All business operations are implemented as CQRS handlers registered with the Mediator. Follow the same three-export pattern used by every existing handler.

### Step 1 — Create the handler file

```core/handlers/my-operation.ts
import { createHandler, useMediator } from "../cqrs";
import type { SubscriptionRepository } from "../repos/subscription.repo";

// 1. Define the input and output shapes
export interface MyOperationInput {
  subscriptionId: string;
}

export interface MyOperationOutput {
  done: boolean;
}

// 2. Create the handler (pure function — no side effects from framework)
export function createMyOperationHandler(repo: SubscriptionRepository) {
  return createHandler<MyOperationInput, MyOperationOutput>(
    "MyOperation",
    async (payload) => {
      const sub = await repo.findById(/* ... */);
      if (!sub) return { success: false, error: "Subscription not found" };

      // domain logic here …

      return { success: true, data: { done: true } };
    },
  );
}

// 3. Factory for the CQRS envelope (use "command" for mutations, "query" for reads)
export function myOperationCommand(input: MyOperationInput) {
  return {
    _type: "command" as const,
    requestName: "MyOperation",
    payload: input,
  };
}

// 4. Registration helper — called once at boot
export function registerMyOperation(repo: SubscriptionRepository) {
  useMediator().registerCommand(createMyOperationHandler(repo));
}
```

### Step 2 — Register at boot

Open `infra/registry.ts` and add two lines:

```infra/registry.ts
import { registerMyOperation } from "@core/handlers/my-operation";

export function registerAll(repos: Repos): void {
  const { sub } = repos;
  // … existing registrations …
  registerMyOperation(sub);   // ← add this
}
```

### Step 3 — Dispatch from an API route

```server/routes/api/subscriptions/[id]/my-operation.post.ts
import { myOperationCommand } from "@core/handlers/my-operation";
import { useMediator } from "@core/cqrs";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id")!;
  const mediator = useMediator();

  const result = await mediator.send(
    myOperationCommand({ subscriptionId: id }),
  );

  return result;
});
```

> **Public-route naming:** Any new API route that intentionally allows unauthenticated access must live under `server/routes/api/public/` and be exposed as `/api/public/*`. Authentication operations under `/api/auth/*` are the only naming exception. Existing legacy public routes are not precedent for new endpoints. Data tags such as `public` may select returned records, but the route adapter must still explicitly establish the unauthenticated boundary.

---

## 2. Adding a New Repository

When the core needs to persist a new aggregate, define the interface in `core/repos/` and implement it for every deploy target.

### Step 1 — Define the repository interface

```core/repos/notification.repo.ts
export interface StoredNotification {
  id: string;
  userId: string;
  message: string;
  sentAt: string; // ISO-8601
}

export interface NotificationRepository {
  save(n: StoredNotification): Promise<void>;
  findByUser(userId: string): Promise<StoredNotification[]>;
}
```

### Step 2 — Add to the `Repos` aggregate

```infra/types.ts
import type { NotificationRepository } from "@core/repos/notification.repo";

export interface Repos {
  sub: SubscriptionRepository;
  plan: PlanRepository;
  iam: IamSubjectRepository;
  user: UserRepository;
  notification: NotificationRepository;   // ← add
}
```

### Step 3 — Implement for SQLite (on-premise)

```infra/deploy/onprem/notification-repo-sqlite.ts
import type { NotificationRepository, StoredNotification } from "@core/repos/notification.repo";
import { getDb } from "@infra/db/sqlite";

export class SqliteNotificationRepo implements NotificationRepository {
  async save(n: StoredNotification): Promise<void> {
    const db = await getDb();
    db.prepare(
      `INSERT OR REPLACE INTO notifications (id, user_id, message, sent_at) VALUES (?, ?, ?, ?)`
    ).run(n.id, n.userId, n.message, n.sentAt);
  }

  async findByUser(userId: string): Promise<StoredNotification[]> {
    const db = await getDb();
    return db.prepare(`SELECT * FROM notifications WHERE user_id = ?`).all(userId) as StoredNotification[];
  }
}
```

Wire it into `infra/deploy/onprem/repos.ts`:

```infra/deploy/onprem/repos.ts
import { SqliteNotificationRepo } from "./notification-repo-sqlite";

createDeployStrategy({
  // …
  buildRepos() {
    return {
      // … existing …
      notification: new SqliteNotificationRepo(),
    };
  },
});
```

Repeat the same pattern for `infra/deploy/deno/` (using Deno KV).

### Step 4 — Add the SQLite table

```infra/db/schema.ts
export const notifications = sqliteTable("notifications", {
  id:      text("id").primaryKey(),
  userId:  text("user_id").notNull(),
  message: text("message").notNull(),
  sentAt:  text("sent_at").notNull(),
});
```

---

## 3. Adding a New Deploy Strategy

Deploy strategies let you swap the storage backend without touching core logic. The system picks the strategy with the highest `weight` whose `predicate()` returns `true`.

```infra/deploy/planetscale/repos.ts
import { createDeployStrategy } from "@infra/deploy/strategy";

createDeployStrategy({
  label: "PlanetScale",
  importPath: "@infra/deploy/planetscale/repos",
  weight: 5,                          // higher than SQLite (1), lower than Deno KV (10)

  predicate() {
    return Boolean(process.env.DATABASE_URL?.includes("planetscale"));
  },

  buildRepos() {
    return {
      sub:          new PlanetScaleSubscriptionRepo(),
      plan:         new PlanetScalePlanRepo(),
      iam:          new PlanetScaleIamRepo(),
      user:         new PlanetScaleUserRepo(),
    };
  },
});
```

Then import the new strategy in `infra/deploy/index.ts`:

```infra/deploy/index.ts
import "@infra/deploy/deno/repos";
import "@infra/deploy/onprem/repos";
import "@infra/deploy/planetscale/repos";   // ← add
```

No other files need to change.

### Cloudflare Workers example

The checked-in target is `infra/deploy/cloudflare/repos.ts`: it registers at weight 5 only when Nitro exposes `globalThis.__env__.RUXT_DB`, between Deno (10) and SQLite fallback (1). It supplies every `Repos` property and uses D1 because aggregate lookups require indexes and cloud-consent projection plus audit event must commit atomically. The schema is `infra/deploy/cloudflare/migrations/0001_init.sql`. Keep the D1 columns synchronized with `infra/db/schema.ts` and test repository behavior against the same contract as the other adapters.

Nitro CV namespaces are separate from the repository aggregate. `RUXT_CLOUDFLARE_STORAGE=1` selects the chunked KV driver (`RUXT_KV`) for CV, pipeline and analytics storage. The driver chunks JSON values but does not solve KV eventual consistency or cross-isolate SSE. Worker-incompatible Python extraction is reported unavailable via CV capabilities instead of attempted. Build with `pnpm build:cloudflare`; never use deploy/login commands for build validation.

---

## 4. Adding an IAM Policy

Policies are composable and independently testable. Add new ones in `core/domain/iam/policy.ts` (or a dedicated file) and pass them to `PolicyEvaluator`.

```core/domain/iam/policy.ts
/**
 * Enterprise-tier users may read any subscription inside their org.
 */
export const EnterpriseOrgAdminPolicy: Policy = {
  name: "EnterpriseOrgAdminPolicy",
  evaluate(request) {
    const { subject, action } = request;
    if (subject.tier !== "enterprise" || subject.orgId === null) return null; // abstain

    if (action.code === "subscription:read") {
      return AccessDecision.allow("Enterprise org admin may read all subscriptions in org");
    }
    return null;
  },
};
```

Register it in `core/handlers/check-access.ts`:

```core/handlers/check-access.ts
import { EnterpriseOrgAdminPolicy } from "../domain/iam/policy";

const defaultEvaluator = new PolicyEvaluator([
  OwnerFullAccessPolicy,
  ServiceAccountReadOnlyPolicy,
  SameOrgPolicy,
  EnterpriseOrgAdminPolicy,   // ← add
]);
```

### Policy evaluation rules

| Situation | Outcome |
|---|---|
| Any policy returns **deny** | Immediately deny — no further evaluation |
| No deny + at least one **allow** | Allow |
| All policies **abstain** (`null`) | Deny (default-deny) |

---

## 5. Adding a New API Route

Nitro uses file-system routing. The file name encodes the HTTP method.

| Pattern | Method |
|---|---|
| `name.get.ts` | GET |
| `name.post.ts` | POST |
| `name.put.ts` | PUT |
| `name.delete.ts` | DELETE |

Example — expose a new subscription action:

```server/routes/api/subscriptions/[id]/expire.post.ts
import { useMediator }        from "@core/cqrs";
import { expireCommand }      from "@core/handlers/expire-subscription";
import { requireSession }     from "@/server/utils/session";

export default defineEventHandler(async (event) => {
  const session = await requireSession(event);          // throws 401 if unauthenticated
  const id = getRouterParam(event, "id")!;

  return useMediator().send(expireCommand({ subscriptionId: id, userId: session.userId }));
});
```

---

## 6. Adding a New Domain Value Object

All value objects extend `ValueObject<T>` which provides immutability and structural equality.

```core/domain/subscription/coupon-code.ts
import { ValueObject } from "../value-object";

interface CouponCodeProps { value: string }

export class CouponCode extends ValueObject<CouponCodeProps> {
  static of(raw: string): CouponCode {
    const value = raw.trim().toUpperCase();
    if (!value) throw new Error("CouponCode must not be empty");
    if (!/^[A-Z0-9\-]{4,32}$/.test(value))
      throw new Error("CouponCode must be 4–32 alphanumeric characters");
    return new CouponCode({ value });
  }

  get value(): string { return this.props.value; }
  override toString(): string { return this.props.value; }
  toJSON(): string { return this.props.value; }
}
```

Value objects are **frozen on construction** (see `ValueObject` base class) — never mutate props directly; always return a new instance.

---

## Checklist Summary

| Goal | Files to touch |
|---|---|
| New command/query | `core/handlers/`, `infra/registry.ts`, `server/routes/api/` |
| New aggregate/repo | `core/repos/`, `infra/types.ts`, `infra/deploy/*/`, `infra/db/schema.ts` |
| New storage backend | `infra/deploy/<target>/repos.ts`, `infra/deploy/index.ts` |
| New IAM policy | `core/domain/iam/policy.ts`, `core/handlers/check-access.ts` |
| New API endpoint | `server/routes/api/<path>/<name>.<method>.ts` |
| New value object | `core/domain/<subdomain>/` |