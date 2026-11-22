<script setup lang="ts">
/**
 * The account action for a layout: Sign out while a session exists, Sign in otherwise (icon variant).
 * Both layouts render this, so no editor route or screen size can lose its way out. "Signed in" comes
 * from the app account or Clerk's own session, so the control stays when `/api/auth/me` is late or failed.
 */
defineProps<{ variant: "text" | "icon" }>();

const { user, signedIn } = useAppAuth();
const { authenticated } = useFeatureFlags();
const { openAuthDialog } = useAuthDialog();
const { signOut, signingOut } = useSignOut();

const signOutLabel = computed(() => (user.value?.email ? `Sign out ${user.value.email}` : "Sign out"));
</script>

<template>
    <button
        v-if="authenticated && signedIn"
        type="button"
        data-account-action="sign-out"
        :disabled="signingOut"
        :aria-label="signOutLabel"
        :title="signOutLabel"
        @click="signOut"
    >
        <AppIcon v-if="variant === 'icon'" name="lucide:circle-user-round" />
        <template v-else>{{ signingOut ? "Signing out…" : "Sign out" }}</template>
    </button>
    <button
        v-else-if="authenticated && variant === 'icon'"
        type="button"
        data-account-action="sign-in"
        aria-label="Sign in or create account"
        title="Sign in or create account"
        @click="openAuthDialog('login')"
    >
        <AppIcon name="lucide:log-in" />
    </button>
</template>
