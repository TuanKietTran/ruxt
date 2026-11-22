/** Application-owned DTOs of the cloud-data sync API (browser code never imports private core). */

export type SyncKind = "session" | "template" | "profile";
export const SYNC_KINDS: readonly SyncKind[] = ["session", "template", "profile"];
export const CONSENT_CATEGORY: Record<SyncKind, "cloudSessions" | "cloudTemplates" | "cloudProfiles"> = {
   session: "cloudSessions",
   template: "cloudTemplates",
   profile: "cloudProfiles",
};
export const CLOUD_COPY_LIMIT = 10;

export interface SyncSnapshot {
   title: string;
   content: string;
}

export interface SyncMutationDto {
   mutationId: string;
   operation: "save" | "remove";
   kind: SyncKind;
   clientItemId: string;
   expectedRevision: number;
   snapshot?: SyncSnapshot;
}

export interface SyncRequestDto {
   deviceId: string;
   since: number | null;
   after?: number;
   mutations: SyncMutationDto[];
   limit?: number;
   wantConsent?: boolean;
   wantPush?: boolean;
}

export type SyncAckDto =
   | { mutationId: string; status: "applied" | "replayed"; operation: "save" | "remove"; kind: SyncKind; clientItemId: string; revision: number; unchanged: boolean; updatedAt?: string }
   | { mutationId: string; status: "conflict"; operation: "save" | "remove"; kind: SyncKind; clientItemId: string; expectedRevision: number; currentRevision: number }
   | { mutationId: string; status: "rejected"; operation: "save" | "remove"; kind: SyncKind; clientItemId: string; code: string; message: string };

export type SyncChangeDto =
   | { deleted: false; kind: SyncKind; clientItemId: string; changeSeq: number; revision: number; updatedAt: string; snapshot: SyncSnapshot; checkpointCount: number }
   | { deleted: true; kind: SyncKind; clientItemId: string; changeSeq: number; revision: number; removedAt: string; reason: "removed" | "expired" };

export interface ConsentCategoryDto { granted: boolean; changedAt: string | null }
export interface ConsentViewDto {
   policyVersion: string;
   retentionConfiguration: Record<string, string | number> | null;
   retentionConfigurationMissing: string[];
   retentionAcknowledgement: { acknowledgedVersion: string | null; acknowledgedAt: string | null };
   cloudSessions: ConsentCategoryDto;
   cloudTemplates: ConsentCategoryDto;
   cloudProfiles: ConsentCategoryDto;
}

export interface QuotaDto { limit: number; used: number; remaining: number; byKind: Record<SyncKind, number> }

export interface SyncPolicyDto {
   protocol: number;
   debounceMs: number;
   maxDelayMs: number;
   fallbackReconcileMs: number;
   staleAfterMs: number;
   maxMutations: number;
}

export interface SyncResponseDto {
   protocol: number;
   policy: SyncPolicyDto;
   owner: string;
   serverTime: string;
   acks: SyncAckDto[];
   changes: SyncChangeDto[];
   cursor: number;
   hasMore: boolean;
   reset: boolean;
   changed: boolean;
   quota: QuotaDto | null;
   consent: ConsentViewDto | null;
   retentionConfigured: boolean;
   push: { url: string; ticket: string; expiresAt: string } | null;
}

export interface CloudHistoryDto {
   kind: SyncKind;
   clientItemId: string;
   revision: number;
   updatedAt: string;
   snapshot: SyncSnapshot;
   checkpoints: Array<{ day: string; revision: number; changedAt: string; snapshot: SyncSnapshot }>;
}

/** Transport failure with the HTTP status (0 for network errors). */
export class SyncHttpError extends Error {
   constructor(readonly status: number, message: string, readonly code?: string) {
      super(message);
      this.name = "SyncHttpError";
   }
}
