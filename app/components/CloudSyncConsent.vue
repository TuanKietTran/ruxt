<script setup lang='ts'>
import { computed } from 'vue';
import type { ConsentViewDto, SyncKind, SyncMode } from '~/utils/cloudSync/types';
import type { KindSyncView } from '~/utils/cloudSync/contracts';
import { CONSENT_CATEGORY, SYNC_KINDS } from '~/utils/cloudSync/kinds';
import { canGrant, CONSENT_COPY, MODE_COPY, retentionFacts, retentionState, type ConsentCategory } from '~/utils/cloudSync/consentView';

/**
 * Consent panel: retention notice, per-category sync toggles and cloud export.
 * All rules live in consentView.ts; this component only renders ConsentViewDto.
 */
const props = defineProps<{ consent: ConsentViewDto | null; saving: string | null; error: string | null; kinds?: Record<SyncKind, KindSyncView> | null }>();
const emit = defineEmits<{
    acknowledge: [];
    'set-consent': [category: ConsentCategory, granted: boolean];
    'set-mode': [kind: SyncKind, mode: SyncMode];
}>();

const entries = SYNC_KINDS.map((kind) => ({ kind, category: CONSENT_CATEGORY[kind] as ConsentCategory }));
const modes: SyncMode[] = ['auto', 'selected'];
function modeOf(kind: SyncKind): SyncMode {
    return props.kinds?.[kind]?.mode ?? 'auto';
}
function onMode(kind: SyncKind, mode: SyncMode): void {
    if (mode !== modeOf(kind)) emit('set-mode', kind, mode);
}
const state = computed(() => props.consent ? retentionState(props.consent) : null);
const facts = computed(() => props.consent ? retentionFacts(props.consent) : []);
const busy = computed(() => props.saving !== null);
const unconfigured = computed(() => state.value === 'unconfigured');
const needsNotice = computed(() => state.value === 'needs-acknowledgement');
const acknowledged = computed(() => state.value === 'acknowledged');
const acknowledgedVersion = computed(() => props.consent?.retentionAcknowledgement.acknowledgedVersion ?? null);

function isChecked(category: ConsentCategory): boolean {
    return props.consent ? props.consent[category]?.granted === true : false;
}
function grantInfo(category: ConsentCategory): { allowed: boolean; reason: string | null } {
    return props.consent ? canGrant(props.consent, category) : { allowed: false, reason: null };
}
function isDisabled(category: ConsentCategory): boolean {
    // A granted toggle stays enabled so it can always be turned off; only
    // granting is gated on the retention notice, and everything waits while saving.
    if (busy.value) return true;
    if (isChecked(category)) return false;
    return !grantInfo(category).allowed;
}
function onToggle(category: ConsentCategory, event: Event): void {
    emit('set-consent', category, (event.target as HTMLInputElement).checked);
}
function acknowledge(): void {
    emit('acknowledge');
}
</script>

<template>
    <section id='consent' class='consent panel' aria-labelledby='consent-title'>
        <h2 id='consent-title'>Consent and privacy</h2>
        <p v-if='error' class='error' role='alert'>{{ error }}</p>
        <p v-if='!consent' class='loading' role='status'>Loading consent settings...</p>
        <template v-else>
            <div class='notice-block'>
                <h3>How long your cloud data is kept</h3>
                <p v-if='unconfigured'>Cloud retention is not configured yet, so cloud sync cannot be turned on. Check back once the retention settings are in place.</p>
                <ul v-if='facts.length > 0' class='facts'>
                    <li v-for='fact in facts' :key='fact.label'>{{ fact.label }}: {{ fact.value }}</li>
                </ul>
                <p v-if='needsNotice'>Before turning cloud sync on, read how long each kind of cloud data is kept. Confirming applies to all three features.</p>
                <button v-if='needsNotice' type='button' :disabled='busy' @click='acknowledge'>I have read this</button>
                <p v-if='acknowledged' role='status'>You have read the retention notice<span v-if='acknowledgedVersion'> (version {{ acknowledgedVersion }})</span>.</p>
            </div>
            <div class='toggles'>
                <h3>What syncs to the cloud</h3>
                <div v-for='entry in entries' :key='entry.category' class='toggle'>
                    <label>
                        <input type='checkbox' :checked='isChecked(entry.category)' :disabled='isDisabled(entry.category)' @change='onToggle(entry.category, $event)'>
                        {{ CONSENT_COPY[entry.category].title }}
                    </label>
                    <p>{{ CONSENT_COPY[entry.category].body }}</p>
                    <p class='detail'>{{ CONSENT_COPY[entry.category].detail }}</p>
                    <p v-if='!isChecked(entry.category) && grantInfo(entry.category).reason' class='hint'>{{ grantInfo(entry.category).reason }}</p>
                    <fieldset v-if='isChecked(entry.category) && kinds' class='mode' :disabled='busy'>
                        <legend>How {{ CONSENT_COPY[entry.category].title.toLowerCase() }} sync on this device</legend>
                        <label v-for='mode in modes' :key='mode' class='mode-option'>
                            <input type='radio' :name='`mode-${entry.kind}`' :value='mode' :checked='modeOf(entry.kind) === mode' @change='onMode(entry.kind, mode)'>
                            <span>{{ MODE_COPY[mode].label }}</span>
                            <small>{{ MODE_COPY[mode].detail }}</small>
                        </label>
                    </fieldset>
                </div>
            </div>
            <div class='turn-off'>
                <h3>Turning a feature off</h3>
                <p>Turning a feature off stops that feature syncing to the cloud. Your local data is never deleted, and neither is anything already in the cloud until you remove it.</p>
            </div>
            <div class='export'>
                <h3>Export your cloud data</h3>
                <p>Download a copy of the data stored for you in the cloud.</p>
                <a href='/api/cloud-data/export' download>Download your cloud data</a>
            </div>
        </template>
    </section>
</template>

<style scoped>
.mode { margin: 8px 0 0; padding: 8px 12px; border: 1px solid var(--border, rgba(128, 128, 128, 0.4)); border-radius: 8px; display: grid; gap: 8px; }
.mode legend { padding: 0 6px; font-size: 13px; color: var(--fg-subtext0); }
.mode-option { display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: start; }
.mode-option small { grid-column: 2; color: var(--fg-subtext0); }
</style>
