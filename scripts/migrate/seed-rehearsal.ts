// Seeds a local Deno KV file with synthetic data in the production layout, for migration rehearsals.
//   deno run -A --unstable-kv scripts/migrate/seed-rehearsal.ts <kv file>
import chunkedDenoKv from "../../server/storage/chunked-deno-kv.ts";

const kv = await (globalThis as any).Deno.openKv((globalThis as any).Deno.args[0]);
const now = "2026-10-01T00:00:00.000Z";
for (let i = 1; i <= 3; i++) {
   const user = { id: `u${i}`, email: `user${i}@example.com`, passwordHash: `hash'${i}`, createdAt: now };
   await kv.set(["user", user.id], user);
   await kv.set(["user_email", user.email], user.id);
   await kv.set(["iam_sub", user.id], { userId: user.id, orgId: i === 1 ? "org1" : null, tier: "free", isServiceAccount: false });
   if (i === 1) await kv.set(["iam_sub_org", "org1", user.id], "");
   await kv.set(["user_preferences", user.id], { ownerId: user.id, preferences: { theme: "dark" }, updatedAt: now });
   const sub = { id: `s${i}`, userId: user.id, planId: "p1", status: "active", startedAt: now, currentPeriodStart: now, currentPeriodEnd: now };
   await kv.set(["sub", sub.id], sub);
   await kv.set(["sub_user", user.id, sub.id], "");
   const state = { ownerId: user.id, category: "analytics", granted: true, policyVersion: "1", changedAt: now };
   await kv.set(["cloud_consent", user.id, "analytics"], state);
   await kv.set(["cloud_consent_event", user.id, now, `e${i}`], { id: `e${i}`, ownerId: user.id, actorUserId: user.id, category: "analytics", granted: true, policyVersion: "1", changedAt: now });
}
await kv.set(["plan", "p1"], { id: "p1", name: "Pro", description: "It's pro", provider: "", source: "catalog", createdBy: null, price: { amountMinor: 900, currency: "USD" }, billingCycle: "monthly", trialDays: 7, features: ["a", "b"], isPublic: true });
await kv.set(["plan_public", "p1"], "");
const cv = chunkedDenoKv({ base: "cv", openKv: async () => kv });
await cv.setItem("doc:small", { id: "small", title: "Small" });
await cv.setItem("doc:big", { id: "big", markdown: "x".repeat(200_000) });
const pipeline = chunkedDenoKv({ base: "cv-pipeline", openKv: async () => kv });
await pipeline.setItem("imports:j1", { id: "j1", status: "done" });
kv.close();
console.log("seeded");
