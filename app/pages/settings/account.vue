<script setup lang="ts">
/**
 * Account management. It reuses Clerk's own profile component, so there is one authentication
 * implementation: profile details, email addresses, password, two-step verification, connected
 * accounts, active sessions and (where the Clerk instance allows it) account deletion.
 */
const { user, signedIn } = useAppAuth();
const { openAuthDialog } = useAuthDialog();

useSeoMeta({ title: "Account", ogTitle: "Account" });

const appearance = {
    elements: {
        rootBox: { width: "100%" },
        cardBox: { width: "100%", maxWidth: "100%", boxShadow: "none", border: "1px solid var(--border)" },
    },
};
</script>

<template>
    <div class="account-page">
        <header class="page-header">
            <p class="eyebrow">Settings</p>
            <h1>Account</h1>
            <p v-if="user">Signed in as <strong>{{ user.email }}</strong>. Your CVs, profiles and templates stay in this browser; this page only manages the account you sign in with.</p>
            <p v-else>Sign in to manage your account.</p>
        </header>

        <p v-if="!signedIn" class="notice" role="status">
            You are not signed in.
            <button type="button" class="btn btn-ghost btn-sm" @click="openAuthDialog('login', '/settings/account')">Sign in</button>
        </p>

        <template v-else>
            <ClerkLoading>
                <p class="notice" role="status">Loading your account…</p>
            </ClerkLoading>
            <ClerkLoaded>
                <UserProfile routing="hash" :appearance="appearance" />
            </ClerkLoaded>

            <section class="settings-card" aria-labelledby="account-data-title">
                <h2 id="account-data-title">Your data and deleting your account</h2>
                <p class="detail">Deleting your account ends your sign-in. Everything stored only in this browser (CV sessions, drafts, templates, profiles) stays here. Copies you chose to keep in the cloud are managed separately, so export or remove them first if you want them gone.</p>
                <NuxtLink to="/settings/cloud-data" class="btn btn-ghost btn-sm">Manage cloud data</NuxtLink>
            </section>
        </template>
    </div>
</template>

<style scoped>
.account-page { display: grid; gap: 24px; max-width: 880px; margin: 0 auto; padding: 32px 24px 64px; }
.page-header h1 { margin: 4px 0 10px; font-size: 32px; }
.page-header p { max-width: 720px; color: var(--fg-subtext0); line-height: 1.6; }
.page-header .eyebrow { color: var(--accent); font-size: 12px; font-weight: 600; }
.notice { margin: 0; padding: 12px 16px; border-radius: var(--radius-sm); background: var(--bg-surface0); }
.settings-card { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-mantle); padding: 24px; }
.settings-card h2 { margin: 0 0 8px; font-size: 16px; font-weight: 600; }
.settings-card .detail { margin: 0 0 16px; color: var(--fg-subtext0); line-height: 1.6; }
@media (max-width: 640px) { .account-page { padding: 24px 16px 48px; } .page-header h1 { font-size: 26px; } }
</style>
