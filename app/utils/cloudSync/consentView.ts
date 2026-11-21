import type { ConsentViewDto } from "./types";

export type ConsentCategory = "cloudSessions" | "cloudTemplates" | "cloudProfiles";

export const CONSENT_COPY: Record<ConsentCategory, { title: string; body: string; detail: string }> = {
   cloudSessions: {
      title: "CV sessions",
      body: "Sync your CV sessions to the cloud so you can continue editing on another device.",
      detail: "Each session keeps its current copy in the cloud, plus earlier versions for recovery.",
   },
   cloudTemplates: {
      title: "CV templates",
      body: "Sync your CV templates to the cloud so they are available on every device.",
      detail: "Templates are stored as cloud copies and kept for the configured retention period.",
   },
   cloudProfiles: {
      title: "Profiles",
      body: "Sync your profiles to the cloud so your details follow you to another device.",
      detail: "Profiles are stored as cloud copies and kept for the configured retention period.",
   },
};

/** Retention notice state: unconfigured while any value is missing, acknowledged once the shown notice version is confirmed. */
export function retentionState(consent: ConsentViewDto): "unconfigured" | "needs-acknowledgement" | "acknowledged" {
   if (consent.retentionConfiguration === null || consent.retentionConfigurationMissing.length > 0) {
      return "unconfigured";
   }
   if (consent.retentionAcknowledgement.acknowledgedVersion === consent.retentionConfiguration.noticeVersion) {
      return "acknowledged";
   }
   return "needs-acknowledgement";
}

/**
 * Whether a category may be granted. Revoking is never limited (the component leaves a granted
 * checkbox enabled); only granting needs the retention notice acknowledged.
 */
export function canGrant(consent: ConsentViewDto, category: ConsentCategory): { allowed: boolean; reason: string | null } {
   const state = retentionState(consent);
   if (state === "acknowledged") {
      return { allowed: true, reason: null };
   }
   if (state === "unconfigured") {
      return {
         allowed: false,
         reason: `Cloud retention is not configured yet, so ${CONSENT_COPY[category].title} cannot be turned on.`,
      };
   }
   return {
      allowed: false,
      reason: `Read the retention notice and confirm you have read it before turning on ${CONSENT_COPY[category].title}.`,
   };
}

const RETENTION_DURATIONS: Array<{ key: string; label: string }> = [
   { key: "sessionCurrentCopyRetentionDays", label: "Current CV sessions kept" },
   { key: "templateRetentionDays", label: "CV templates kept" },
   { key: "profileRetentionDays", label: "Profiles kept" },
   { key: "checkpointRetentionDays", label: "Earlier versions kept" },
   { key: "retentionExtensionDays", label: "Retention extension" },
];

function formatDays(value: string | number | undefined): string | null {
   const days = typeof value === "number" ? value : Number(value);
   if (!Number.isFinite(days)) {
      return null;
   }
   return `${days} days`;
}

/** The five configured retention durations as "N days", plus the notice version. Empty while unconfigured. */
export function retentionFacts(consent: ConsentViewDto): Array<{ label: string; value: string }> {
   const configuration = consent.retentionConfiguration;
   if (configuration === null) {
      return [];
   }
   const facts: Array<{ label: string; value: string }> = [];
   for (const duration of RETENTION_DURATIONS) {
      const value = formatDays(configuration[duration.key]);
      if (value !== null) {
         facts.push({ label: duration.label, value });
      }
   }
   const noticeVersion = configuration.noticeVersion;
   if (typeof noticeVersion === "string" && noticeVersion.trim() !== "") {
      facts.push({ label: "Notice version", value: noticeVersion });
   } else if (typeof noticeVersion === "number") {
      facts.push({ label: "Notice version", value: String(noticeVersion) });
   }
   return facts;
}
