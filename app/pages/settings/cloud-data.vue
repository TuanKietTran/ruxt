<script setup lang="ts">
type ConsentCategory = "cloudSessions" | "cloudTemplates";
type ConsentView = {
    policyVersion: string;
    cloudSessions: { granted: boolean; changedAt: string | null };
    cloudTemplates: { granted: boolean; changedAt: string | null };
};

const { user } = useAppAuth();
const accountFetch = useAccountFetch();
const { data: consent, status, error: loadError } = await useAsyncData("cloud-consent", () => accountFetch<ConsentView>("/api/cloud-data/consent"), { watch: [user] });
const saving = ref<ConsentCategory | null>(null);
const mutationError = ref("");

async function setConsent(category: ConsentCategory, input: HTMLInputElement) {
    if (saving.value) return;
    const granted = input.checked;
    saving.value = category;
    mutationError.value = "";
    try {
        consent.value = await accountFetch<ConsentView>("/api/cloud-data/consent", {
            method: "PUT",
            body: { category, granted },
        });
    } catch (error: any) {
        input.checked = consent.value?.[category].granted ?? false;
        mutationError.value = error?.data?.statusMessage || "The consent change could not be saved.";
    } finally {
        saving.value = null;
    }
}
</script>

<template>
    <div class="cloud-settings">
        <header class="page-header">
            <p class="eyebrow">Privacy controls</p>
            <h1>Cloud data</h1>
            <p>
                Signing in does not upload your CV data. Choose each optional cloud feature separately.
                Both are off until you enable them.
            </p>
        </header>

        <p v-if="status === 'pending'" class="notice">Loading your consent settings…</p>
        <p v-else-if="loadError" class="notice error" role="alert">Consent settings could not be loaded.</p>

        <template v-else-if="consent && user">
            <label class="consent-card">
                <div>
                    <h2 id="session-consent-title">Cloud session recovery</h2>
                    <p>
                        Store selected editor sessions for cross-device continuity. A current cloud copy is
                        retained, with no more than seven daily recovery checkpoints from the last seven days.
                    </p>
                    <p class="detail">Each session remains local-first and starts with cloud saving off.</p>
                </div>
                <span class="toggle-row">
                    <input
                        type="checkbox"
                        :aria-labelledby="'session-consent-title'"
                        :checked="consent.cloudSessions.granted"
                        :disabled="saving !== null"
                        @change="setConsent('cloudSessions', $event.target as HTMLInputElement)"
                    >
                    <span>{{ consent.cloudSessions.granted ? "Allowed" : "Not allowed" }}</span>
                </span>
            </label>

            <label class="consent-card">
                <div>
                    <h2 id="template-consent-title">Cloud templates</h2>
                    <p>
                        Allow up to three selected user-owned templates to be available across devices.
                        Every template starts with cloud saving off and must be selected separately.
                    </p>
                    <p class="detail">Built-in templates and browser-local profiles are never uploaded by this setting.</p>
                </div>
                <span class="toggle-row">
                    <input
                        type="checkbox"
                        :aria-labelledby="'template-consent-title'"
                        :checked="consent.cloudTemplates.granted"
                        :disabled="saving !== null"
                        @change="setConsent('cloudTemplates', $event.target as HTMLInputElement)"
                    >
                    <span>{{ consent.cloudTemplates.granted ? "Allowed" : "Not allowed" }}</span>
                </span>
            </label>

            <section class="retention-note">
                <h2>What happens when you turn a feature off?</h2>
                <p>
                    New cloud uploads stop immediately. Existing cloud copies are retained until you use a
                    separate cloud-delete control. Turning a feature off, cloud expiry, or a network failure
                    never deletes browser-local sessions, templates, profiles, or drafts.
                </p>
                <p>
                    These settings do not send CV content to AI or model providers. Policy version:
                    <code>{{ consent.policyVersion }}</code>.
                </p>
            </section>

            <p v-if="mutationError" class="notice error" role="alert">{{ mutationError }}</p>
            <p v-else-if="saving" class="notice" aria-live="polite">Saving consent…</p>
        </template>
    </div>
</template>

<style scoped>
.cloud-settings {
    width: min(820px, calc(100% - 32px));
    margin: 48px auto;
    display: grid;
    gap: 20px;
}
.page-header h1 { margin: 4px 0 10px; font-size: 32px; }
.page-header p { max-width: 680px; color: var(--fg-subtext0); line-height: 1.6; }
.eyebrow { color: var(--accent) !important; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.consent-card, .retention-note {
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-mantle);
    padding: 22px;
}
.consent-card { cursor: pointer; display: flex; justify-content: space-between; gap: 28px; align-items: center; }
.consent-card h2, .retention-note h2 { margin: 0 0 8px; font-size: 18px; }
.consent-card p, .retention-note p { margin: 6px 0; color: var(--fg-subtext0); line-height: 1.55; }
.detail { font-size: 13px; }
.toggle-row { min-width: 118px; display: flex; align-items: center; gap: 9px; font-weight: 600; }
.toggle-row input { width: 20px; height: 20px; accent-color: var(--accent); }
.consent-card:has(input:disabled) { cursor: wait; }
.toggle-row:has(input:disabled) { opacity: .6; }
.notice { margin: 0; padding: 12px 14px; border-radius: var(--radius-sm); background: var(--bg-surface0); }
.error { color: var(--error, #e55); }
code { color: var(--fg-subtext1); }
@media (max-width: 620px) {
    .cloud-settings { margin-top: 28px; }
    .consent-card { align-items: flex-start; flex-direction: column; }
}
</style>
