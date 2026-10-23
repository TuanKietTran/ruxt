import { Plan, PlanId } from "@ruxt/core/domain/catalog";
import { Subscription, SubscriptionId } from "@ruxt/core/domain/subscription/subscription";
import { UserId } from "@ruxt/core/domain/iam/user-id";
import type { CloudConsentCategoryState, CloudConsentEvent } from "@ruxt/core/domain/cloud-data/consent";
import { normalizeUserPreferences, type UserPreferencesRecord } from "@ruxt/core/domain/preferences";
import type { SubscriptionRepository } from "@ruxt/core/repos/subscription.repo";
import type { PlanRepository } from "@ruxt/core/repos/plan.repo";
import type { IamSubjectRepository, StoredSubject } from "@ruxt/core/repos/iam.repo";
import type { UserRepository, StoredUser } from "@ruxt/core/repos/user.repo";
import type { CloudConsentRepository } from "@ruxt/core/repos/cloud-consent.repo";
import type { UserPreferencesRepository } from "@ruxt/core/repos/user-preferences.repo";
import { assertD1, getD1 } from "./d1";

const upsert = async (sql: string, ...values: unknown[]) => assertD1(await getD1().prepare(sql).bind(...values).run());
const all = async <T>(sql: string, ...values: unknown[]) => (await getD1().prepare(sql).bind(...values).all<T>()).results ?? [];

export class D1SubscriptionRepo implements SubscriptionRepository {
   async findById(id: SubscriptionId) {
      const row = await getD1().prepare("SELECT * FROM subscriptions WHERE id = ?").bind(id.value).first<any>();
      return row ? Subscription.fromJSON({ id: row.id, userId: row.user_id, planId: row.plan_id, status: row.status, startedAt: row.started_at, currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end, trialEndsAt: row.trial_ends_at, cancelledAt: row.cancelled_at, pausedAt: row.paused_at, nextIntervalPlanId: row.next_interval_plan_id }) : null;
   }
   async save(s: Subscription) { const j = s.toJSON(); await upsert("INSERT INTO subscriptions(id,user_id,plan_id,status,started_at,current_period_start,current_period_end,trial_ends_at,cancelled_at,paused_at,next_interval_plan_id) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,plan_id=excluded.plan_id,status=excluded.status,started_at=excluded.started_at,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,trial_ends_at=excluded.trial_ends_at,cancelled_at=excluded.cancelled_at,paused_at=excluded.paused_at,next_interval_plan_id=excluded.next_interval_plan_id", j.id,j.userId,j.planId,j.status,j.startedAt,j.currentPeriodStart,j.currentPeriodEnd,j.trialEndsAt,j.cancelledAt,j.pausedAt,j.nextIntervalPlanId); }
   async delete(id: SubscriptionId) { await upsert("DELETE FROM subscriptions WHERE id=?", id.value); }
   async findByUser(userId: string) { const rows = await all<any>("SELECT * FROM subscriptions WHERE user_id=?", userId); return rows.map(r => Subscription.fromJSON({ id:r.id,userId:r.user_id,planId:r.plan_id,status:r.status,startedAt:r.started_at,currentPeriodStart:r.current_period_start,currentPeriodEnd:r.current_period_end,trialEndsAt:r.trial_ends_at,cancelledAt:r.cancelled_at,pausedAt:r.paused_at,nextIntervalPlanId:r.next_interval_plan_id })); }
}

const planJson = (r: any) => ({ id:r.id,name:r.name,description:r.description,provider:r.provider,source:r.source,createdBy:r.created_by,price:{amountMinor:r.amount_minor,currency:r.currency},billingCycle:r.billing_cycle,trialDays:r.trial_days,features:JSON.parse(r.features || "[]"),isPublic:Boolean(r.is_public) });
export class D1PlanRepo implements PlanRepository {
   async findById(id: PlanId) { const r=await getD1().prepare("SELECT * FROM plans WHERE id=?").bind(id.value).first<any>(); return r ? Plan.fromJSON(planJson(r)) : null; }
   async findAll() { return (await all<any>("SELECT * FROM plans")).map(r=>Plan.fromJSON(planJson(r))); }
   async findPublic() { return (await all<any>("SELECT * FROM plans WHERE is_public=1")).map(r=>Plan.fromJSON(planJson(r))); }
   async findByUser(userId: string) { return (await all<any>("SELECT * FROM plans WHERE source='user' AND created_by=?",userId)).map(r=>Plan.fromJSON(planJson(r))); }
   async save(p: Plan) { const j=p.toJSON(); await upsert("INSERT INTO plans(id,name,description,amount_minor,currency,billing_cycle,trial_days,provider,source,created_by,features,is_public) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,amount_minor=excluded.amount_minor,currency=excluded.currency,billing_cycle=excluded.billing_cycle,trial_days=excluded.trial_days,provider=excluded.provider,source=excluded.source,created_by=excluded.created_by,features=excluded.features,is_public=excluded.is_public",j.id,j.name,j.description,j.price.amountMinor,j.price.currency,j.billingCycle,j.trialDays,j.provider,j.source,j.createdBy,JSON.stringify(j.features),j.isPublic?1:0); }
   async delete(id: PlanId) { await upsert("DELETE FROM plans WHERE id=?",id.value); }
}

export class D1IamRepo implements IamSubjectRepository {
   async findByUserId(id: UserId) { const r=await getD1().prepare("SELECT * FROM iam_subjects WHERE user_id=?").bind(id.value).first<any>(); return r ? {userId:r.user_id,orgId:r.org_id,tier:r.tier,isServiceAccount:Boolean(r.is_service_account)} as StoredSubject : null; }
   async save(s: StoredSubject) { await upsert("INSERT INTO iam_subjects(user_id,org_id,tier,is_service_account) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET org_id=excluded.org_id,tier=excluded.tier,is_service_account=excluded.is_service_account",s.userId,s.orgId,s.tier,s.isServiceAccount?1:0); }
   async delete(id: UserId) { await upsert("DELETE FROM iam_subjects WHERE user_id=?",id.value); }
}

export class D1UserRepo implements UserRepository {
   async findByEmail(email: string) { return await getD1().prepare("SELECT id,email,password_hash AS passwordHash,created_at AS createdAt FROM users WHERE email=?").bind(email).first<StoredUser>(); }
   async findById(id: string) { return await getD1().prepare("SELECT id,email,password_hash AS passwordHash,created_at AS createdAt FROM users WHERE id=?").bind(id).first<StoredUser>(); }
   async save(u: StoredUser) { await upsert("INSERT INTO users(id,email,password_hash,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,created_at=excluded.created_at",u.id,u.email,u.passwordHash,u.createdAt); }
}

export class D1CloudConsentRepo implements CloudConsentRepository {
   async listCurrent(ownerId: string) { const rows=await all<any>("SELECT * FROM cloud_consent_states WHERE owner_id=?",ownerId); return rows.map(r=>({ownerId:r.owner_id,category:r.category,granted:Boolean(r.granted),policyVersion:r.policy_version,changedAt:r.changed_at} as CloudConsentCategoryState)); }
   async saveChange(s: CloudConsentCategoryState,e: CloudConsentEvent) {
      // D1 batch is transactional: projection and immutable audit event commit together.
      const db=getD1(); const result=await db.batch([
         db.prepare("INSERT INTO cloud_consent_states(owner_id,category,granted,policy_version,changed_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id,category) DO UPDATE SET granted=excluded.granted,policy_version=excluded.policy_version,changed_at=excluded.changed_at").bind(s.ownerId,s.category,s.granted?1:0,s.policyVersion,s.changedAt),
         db.prepare("INSERT INTO cloud_consent_events(id,owner_id,actor_user_id,category,granted,policy_version,changed_at) VALUES(?,?,?,?,?,?,?)").bind(e.id,e.ownerId,e.actorUserId,e.category,e.granted?1:0,e.policyVersion,e.changedAt),
      ]); if(result.some(x=>!x.success)) throw new Error("Cloudflare D1 consent transaction failed");
   }
   async listEvents(ownerId: string) { return (await all<any>("SELECT * FROM cloud_consent_events WHERE owner_id=? ORDER BY changed_at",ownerId)).map(r=>({id:r.id,ownerId:r.owner_id,actorUserId:r.actor_user_id,category:r.category,granted:Boolean(r.granted),policyVersion:r.policy_version,changedAt:r.changed_at} as CloudConsentEvent)); }
}

export class D1UserPreferencesRepo implements UserPreferencesRepository {
   async get(ownerId: string) { const r=await getD1().prepare("SELECT * FROM user_preferences WHERE owner_id=?").bind(ownerId).first<any>(); if(!r)return null; let data:unknown={}; try{data=JSON.parse(r.preferences);}catch{} return {ownerId:r.owner_id,preferences:normalizeUserPreferences(data),updatedAt:r.updated_at} as UserPreferencesRecord; }
   async save(record: UserPreferencesRecord) { await upsert("INSERT INTO user_preferences(owner_id,preferences,updated_at) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET preferences=excluded.preferences,updated_at=excluded.updated_at",record.ownerId,JSON.stringify(record.preferences),record.updatedAt); }
}
