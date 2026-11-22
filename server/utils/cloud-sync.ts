import type { H3Event } from "h3";
import { useMediator } from "@ruxt/shared/cqrs";
import {
   missingCloudRetentionConfiguration, selectRetainedCloudCheckpoints, type CloudRetentionConfiguration,
} from "@ruxt/core/domain/cloud-data/retention";
import type { CloudDataConsentView } from "@ruxt/core/domain/cloud-data/consent";
import type { CloudCopyCheckpoint, CloudCopyKind } from "@ruxt/core/domain/cloud-copy";
import type { CloudCopySyncRepository } from "@ruxt/core/repos/cloud-copy.repo";
import { getCloudDataConsentQuery } from "@ruxt/core/handlers/get-cloud-data-consent";
import { cloudCopyRepository } from "@infra/registry";
import { cloudSyncOwnerKey, mintSyncTicket, SYNC_TICKET_TTL_SECONDS } from "@infra/crypto/cloud-sync-ticket";
import { notifySyncHub, type SyncHubEnv } from "@infra/deploy/cloudflare/sync-events";

/** Consent category guarding each cloud-copy kind. */
export const CLOUD_KIND_CATEGORY = {
   session: "cloudSessions",
   template: "cloudTemplates",
   profile: "cloudProfiles",
} as const satisfies Record<CloudCopyKind, keyof CloudDataConsentView>;

/** Client batching policy, served with every sync response so deployments can tune it centrally. */
export const CLOUD_SYNC_POLICY = Object.freeze({
   protocol: 1,
   debounceMs: 10_000,
   maxDelayMs: 45_000,
   fallbackReconcileMs: 45 * 60_000,
   staleAfterMs: 30 * 60_000,
   maxMutations: 20,
});

const workerEnv = () => (globalThis as typeof globalThis & { __env__?: Record<string, unknown> & SyncHubEnv }).__env__;

const RETENTION_ENV: Record<keyof CloudRetentionConfiguration, string> = {
   noticeVersion: "NUXT_CLOUD_RETENTION_NOTICE_VERSION",
   sessionCurrentCopyRetentionDays: "NUXT_CLOUD_RETENTION_SESSION_CURRENT_COPY_RETENTION_DAYS",
   templateRetentionDays: "NUXT_CLOUD_RETENTION_TEMPLATE_RETENTION_DAYS",
   profileRetentionDays: "NUXT_CLOUD_RETENTION_PROFILE_RETENTION_DAYS",
   checkpointRetentionDays: "NUXT_CLOUD_RETENTION_CHECKPOINT_RETENTION_DAYS",
   retentionExtensionDays: "NUXT_CLOUD_RETENTION_RETENTION_EXTENSION_DAYS",
};

/**
 * The deployment's retention configuration, or null while any value is missing or invalid. Null keeps
 * consent grants, the retention notice and session copies fail-closed (core never invents durations).
 * Worker bindings are read directly as well, since they are only attached per request.
 */
export function cloudRetentionConfiguration(event?: H3Event): CloudRetentionConfiguration | null {
   const runtime = ((event ? useRuntimeConfig(event) : useRuntimeConfig()) as { cloudRetention?: Partial<CloudRetentionConfiguration> }).cloudRetention ?? {};
   const env = workerEnv() ?? {};
   const pick = (key: keyof CloudRetentionConfiguration) => {
      const bound = env[RETENTION_ENV[key]];
      return bound !== undefined && bound !== "" ? bound : runtime[key];
   };
   const configuration: CloudRetentionConfiguration = {
      noticeVersion: String(pick("noticeVersion") ?? "").trim(),
      sessionCurrentCopyRetentionDays: Number(pick("sessionCurrentCopyRetentionDays")),
      templateRetentionDays: Number(pick("templateRetentionDays")),
      profileRetentionDays: Number(pick("profileRetentionDays")),
      checkpointRetentionDays: Number(pick("checkpointRetentionDays")),
      retentionExtensionDays: Number(pick("retentionExtensionDays")),
   };
   return missingCloudRetentionConfiguration(configuration).length ? null : configuration;
}

/** The selected adapter, or a 503: never report a durable cloud save where none exists. */
export function requireCloudCopyRepository(): CloudCopySyncRepository {
   const repo = cloudCopyRepository();
   if (!repo) throw createError({ statusCode: 503, statusMessage: "Cloud sync is unavailable on this deployment", data: { code: "CLOUD_SYNC_UNAVAILABLE" } });
   return repo;
}

export async function readCloudConsent(ownerId: string): Promise<CloudDataConsentView> {
   return sendApiRequest<CloudDataConsentView>(useMediator(), getCloudDataConsentQuery({ userId: ownerId }));
}

/** Current consent for a kind, re-read from the consent store (never from the browser). */
export const consentAllows = (consent: CloudDataConsentView, kind: CloudCopyKind) => consent[CLOUD_KIND_CATEGORY[kind]].granted === true;

export function checkpointRetention(configuration: CloudRetentionConfiguration | null) {
   if (!configuration) return undefined;
   return (checkpoints: readonly CloudCopyCheckpoint[], lastWriteAt: string) =>
      selectRetainedCloudCheckpoints(checkpoints, lastWriteAt, configuration.checkpointRetentionDays);
}

function ticketSecret(event: H3Event): string {
   const config = useRuntimeConfig(event) as { cloudSync?: { ticketSecret?: string }; sessionSecret?: string };
   const env = workerEnv();
   return String(env?.NUXT_CLOUD_SYNC_TICKET_SECRET || config.cloudSync?.ticketSecret || env?.NUXT_SESSION_SECRET || config.sessionSecret || "");
}

/** Non-secret owner fingerprint so a device can detect an account switch mid-request. */
export async function cloudSyncOwnerFingerprint(ownerId: string): Promise<string> {
   const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ruxt-sync-owner:${ownerId}`));
   return [...new Uint8Array(digest)].slice(0, 16).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** True where a push hub is bound (Cloudflare with the SYNC_HUB Durable Object). */
export const pushAvailable = (event: H3Event) => Boolean(workerEnv()?.SYNC_HUB) && ticketSecret(event).length >= 32;

export async function mintPushTicket(event: H3Event, ownerId: string, deviceId: string) {
   const secret = ticketSecret(event);
   const expiresAt = Math.floor(Date.now() / 1000) + SYNC_TICKET_TTL_SECONDS;
   const ticket = await mintSyncTicket(secret, { k: await cloudSyncOwnerKey(secret, ownerId), d: deviceId, e: expiresAt });
   return { url: "/api/cloud-data/events", ticket, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

/** Wake the owner's other devices after a committed change; never delays or fails the write. */
export function notifyOwnerDevices(event: H3Event, ownerId: string, cursor: number, originDevice: string): void {
   const env = workerEnv();
   if (!env?.SYNC_HUB) return;
   const delivery = (async () => {
      const secret = ticketSecret(event);
      await notifySyncHub(env, await cloudSyncOwnerKey(secret, ownerId), cursor, originDevice);
   })().catch(error => console.warn("[cloud-sync] push notification failed", error instanceof Error ? error.message : error));
   event.waitUntil?.(delivery);
}
