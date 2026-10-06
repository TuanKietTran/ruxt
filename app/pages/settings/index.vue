<script setup lang="ts">
import { PROFILE_SAVE_MODES, type ProfileSaveMode } from "@core/domain/preferences";

// Preferences work without an account: they stay in this browser until the user signs in.
definePageMeta({ public: true });

const { preferences, source, signedIn, load, update } = usePreferences();
const saving = ref(false);
const status = ref("");
const error = ref("");

onMounted(load);
watch(signedIn, load);

const modeCopy: Record<ProfileSaveMode, { title: string; detail: string }> = {
    auto: {
        title: "Save automatically",
        detail: "Changes save while you type and when you leave the field. Esc reverts the field.",
    },
    manual: {
        title: "Save with a button",
        detail: "Each field shows Save and Cancel. Enter (Ctrl/⌘ + Enter in long text) saves, Esc cancels.",
    },
};

async function setSaveMode(mode: ProfileSaveMode) {
    if (saving.value || preferences.value.profileSaveMode === mode) return;
    saving.value = true;
    status.value = "";
    error.value = "";
    try {
        await update({ profileSaveMode: mode });
        status.value = source.value === "account" ? "Saved to your account." : "Saved in this browser.";
    } catch (cause: any) {
        error.value = cause?.data?.statusMessage || "The setting could not be saved.";
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <div class="settings">
        <header class="page-header">
            <p class="eyebrow">Settings</p>
            <h1>Preferences</h1>
            <p>
                {{ source === "account"
                    ? "Signed in: these settings are saved to your account and follow you across devices."
                    : "These settings are saved in this browser only. Sign in to keep them with your account." }}
            </p>
        </header>

        <section class="settings-card" aria-labelledby="profile-save-title">
            <h2 id="profile-save-title">Profile editor</h2>
            <p class="detail">Fields are read-only until you click them. Choose what happens while you edit one.</p>
            <div class="choice-list" role="radiogroup" aria-labelledby="profile-save-title">
                <label v-for="mode in PROFILE_SAVE_MODES" :key="mode" class="choice" :class="{ 'choice--active': preferences.profileSaveMode === mode }">
                    <input
                        type="radio"
                        name="profile-save-mode"
                        :value="mode"
                        :checked="preferences.profileSaveMode === mode"
                        :disabled="saving"
                        @change="setSaveMode(mode)"
                    >
                    <span>
                        <strong>{{ modeCopy[mode].title }}</strong>
                        <small>{{ modeCopy[mode].detail }}</small>
                    </span>
                </label>
            </div>
        </section>

        <section v-if="signedIn" class="settings-card settings-link">
            <div>
                <h2>Cloud data</h2>
                <p class="detail">Choose which optional cloud features may store your sessions and templates.</p>
            </div>
            <NuxtLink to="/settings/cloud-data" class="btn btn-ghost btn-sm">Open</NuxtLink>
        </section>

        <p v-if="error" class="notice error" role="alert">{{ error }}</p>
        <p v-else-if="status" class="notice" role="status">{{ status }}</p>
    </div>
</template>

<style scoped>
.settings { width: min(820px, calc(100% - 32px)); margin: 48px auto; display: grid; gap: 20px; }
.page-header h1 { margin: 4px 0 10px; font-size: 32px; }
.page-header p { max-width: 680px; color: var(--fg-subtext0); line-height: 1.6; }
.eyebrow { color: var(--accent) !important; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.settings-card { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-mantle); padding: 22px; }
.settings-card h2 { margin: 0 0 8px; font-size: 18px; }
.detail { margin: 6px 0 14px; color: var(--fg-subtext0); font-size: 13px; line-height: 1.55; }
.choice-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
.choice { display: flex; gap: 10px; align-items: flex-start; padding: 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; }
.choice--active { border-color: var(--accent); background: var(--bg-surface0); }
.choice:has(input:disabled) { opacity: .7; cursor: wait; }
.choice input { margin-top: 3px; accent-color: var(--accent); }
.choice span { display: grid; gap: 4px; }
.choice small { color: var(--fg-subtext0); line-height: 1.5; }
.settings-link { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.settings-link .detail { margin-bottom: 0; }
.notice { margin: 0; padding: 12px 14px; border-radius: var(--radius-sm); background: var(--bg-surface0); }
.error { color: var(--error, #e55); }
@media (max-width: 620px) { .settings { margin-top: 28px; } }
</style>
