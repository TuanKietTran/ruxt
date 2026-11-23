import type { RecordAdapter } from "./contracts";
import { createJobPreferencesAdapter, createProfileAdapter, createSessionAdapter, createTemplateAdapter, type StorageGetter } from "./records";
import type { ConsentCategoryName, ConsentViewDto, SyncKind } from "./types";

/**
 * The one registry of synchronizable kinds on the client: its consent category, the schema tag of its snapshot
 * content, how the UI names it, the cap assumed before the server has reported one, and the adapter over the
 * browser storage the app already uses. Adding a kind is one entry here plus its server-side entry in core's
 * registry (a test keeps the two in step). Browser code never imports private core.
 */
export interface SyncKindDefinition {
   readonly label: string;
   readonly plural: string;
   readonly consentCategory: ConsentCategoryName;
   readonly schema: string;
   /** Cap used until the server reports one (core's default). */
   readonly fallbackLimit: number;
   /** One record under a fixed identity (settings-like data). */
   readonly singleton?: boolean;
   readonly createAdapter: (storage?: StorageGetter) => RecordAdapter;
}

export const SYNC_KIND_REGISTRY: Record<SyncKind, SyncKindDefinition> = {
   session: { label: "CV session", plural: "CV sessions", consentCategory: "cloudSessions", schema: "ruxt.session/1", fallbackLimit: 20, createAdapter: createSessionAdapter },
   template: { label: "CV template", plural: "CV templates", consentCategory: "cloudTemplates", schema: "ruxt.template/1", fallbackLimit: 20, createAdapter: createTemplateAdapter },
   profile: { label: "profile", plural: "profiles", consentCategory: "cloudProfiles", schema: "ruxt.profile/1", fallbackLimit: 20, createAdapter: createProfileAdapter },
   jobPreferences: { label: "job preferences", plural: "job preferences", consentCategory: "cloudJobPreferences", schema: "ruxt.job-preferences/1", fallbackLimit: 1, singleton: true, createAdapter: createJobPreferencesAdapter },
};

export const SYNC_KINDS = Object.keys(SYNC_KIND_REGISTRY) as readonly SyncKind[];

export const CONSENT_CATEGORY = Object.fromEntries(
   SYNC_KINDS.map(kind => [kind, SYNC_KIND_REGISTRY[kind].consentCategory]),
) as Record<SyncKind, ConsentCategoryName>;

export const isSyncKind = (value: unknown): value is SyncKind =>
   typeof value === "string" && Object.prototype.hasOwnProperty.call(SYNC_KIND_REGISTRY, value);

/** Whether the account granted the consent category guarding `kind`; a category the server does not know is not granted. */
export const kindConsentGranted = (consent: ConsentViewDto | null | undefined, kind: SyncKind): boolean =>
   consent?.[CONSENT_CATEGORY[kind]]?.granted === true;

export function createRecordAdapters(storage?: StorageGetter): Record<SyncKind, RecordAdapter> {
   return Object.fromEntries(SYNC_KINDS.map(kind => [kind, SYNC_KIND_REGISTRY[kind].createAdapter(storage)])) as Record<SyncKind, RecordAdapter>;
}
