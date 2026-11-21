<script setup lang='ts'>
import { computed } from 'vue';
import type { ConsentViewDto } from '~/utils/cloudSync/types';
import { canGrant, CONSENT_COPY, retentionFacts, retentionState, type ConsentCategory } from '~/utils/cloudSync/consentView';

/**
 * Consent panel: retention notice, per-category sync toggles and cloud export.
 * All rules live in consentView.ts; this component only renders ConsentViewDto.
 */
const props = defineProps<{ consent: ConsentViewDto | null; saving: string | null; error: string | null }>();
const emit = defineEmits<{
    acknowledge: [];
    'set-consent': [category: ConsentCategory, granted: boolean];
}>();

const categories: ConsentCategory[] = ['cloudSessions', 'cloudTemplates', 'cloudProfiles'];
const state = computed(() => props.consent ? retentionState(props.consent) : null);
const facts = computed(() => props.consent ? retentionFacts(props.consent) : []);
const busy = computed(() => props.saving !== null);
const unconfigured = computed(() => state.value === 'unconfigured');
const needsNotice = computed(() => state.value === 'needs-acknowledgement');
const acknowledged = computed(() => state.value === 'acknowledged');
const acknowledgedVersion = computed(() => props.consent?.retentionAcknowledgement.acknowledgedVersion ?? null);

function isChecked(category: ConsentCategory): boolean {
    return props.consent ? props.consent[category].granted : false;
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
                <div v-for='category in categories' :key='category' class='toggle'>
                    <label>
                        <input type='checkbox' :checked='isChecked(category)' :disabled='isDisabled(category)' @change='onToggle(category, $event)'>
                        {{ CONSENT_COPY[category].title }}
                    </label>
                    <p>{{ CONSENT_COPY[category].body }}</p>
                    <p class='detail'>{{ CONSENT_COPY[category].detail }}</p>
                    <p v-if='!isChecked(category) && grantInfo(category).reason' class='hint'>{{ grantInfo(category).reason }}</p>
                </div>
            </div>
            <div class='turn-off'>
                <h3>Turning a feature off</h3>
                <p>Turning a feature off stops that feature syncing to the cloud. Your local data is never deleted.</p>
            </div>
            <div class='export'>
                <h3>Export your cloud data</h3>
                <p>Download a copy of the data stored for you in the cloud.</p>
                <a href='/api/cloud-data/export' download>Download your cloud data</a>
            </div>
        </template>
    </section>
</template>
