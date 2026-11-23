import type { EngineView, SyncRecordView } from "../../app/utils/cloudSync/contracts";
import { SYNC_KINDS } from "../../app/utils/cloudSync/kinds";
import type { ConsentViewDto, SyncKind } from "../../app/utils/cloudSync/types";

/** Hand-built EngineView fixtures for the pure view logic (no engine, no simulated browser). */
export const CONSENT: ConsentViewDto = {
   policyVersion: "2026-09-20",
   retentionConfiguration: { noticeVersion: "n1" },
   retentionConfigurationMissing: [],
   retentionAcknowledgement: { acknowledgedVersion: "n1", acknowledgedAt: "2026-11-01T00:00:00.000Z" },
   cloudSessions: { granted: true, changedAt: null }, cloudTemplates: { granted: true, changedAt: null },
   cloudProfiles: { granted: true, changedAt: null }, cloudJobPreferences: { granted: true, changedAt: null },
};

export const row = (kind: SyncKind, id: string, status: SyncRecordView["status"], extra: Partial<SyncRecordView> = {}): SyncRecordView =>
   ({ key: `${kind}:${id}` as SyncRecordView["key"], kind, id, title: id, status, linked: false, ...extra });

/**
 * A view where every kind in `automatic` syncs by itself and the others are consented to but set to "Only records
 * I select". Pass `overrides` to change the role (leader, leaderTab), network (status) or anything else.
 */
export function makeView(records: SyncRecordView[], overrides: Partial<EngineView> = {}, automatic: readonly SyncKind[] = SYNC_KINDS): EngineView {
   return {
      status: "idle", leader: true, leaderTab: "this", activity: "scheduled", retryAt: null, push: "connected",
      lastSyncAt: "2026-11-23T10:00:00.000Z", lastError: null, pendingCount: 0, conflictCount: 0,
      quota: null, consent: CONSENT, retentionConfigured: true, records, recovery: [], metrics: {},
      kinds: Object.fromEntries(SYNC_KINDS.map(kind => [kind, { mode: automatic.includes(kind) ? "auto" : "selected", consented: true, automatic: automatic.includes(kind) }])) as EngineView["kinds"],
      ...overrides,
   };
}
