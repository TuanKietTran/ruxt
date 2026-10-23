<script setup lang="ts">
const route = useRoute();
const { user } = useAppAuth();
const { openAuthDialog } = useAuthDialog();

const mode = route.query.mode === "signup" ? "signup" : "login";
const redirectTo = typeof route.query.redirect === "string" ? route.query.redirect : null;

if (user.value) {
    await navigateTo(safeAuthRedirect(redirectTo) ?? "/");
} else {
    openAuthDialog(mode, redirectTo);
}

useSeoMeta({
    title: mode === "signup" ? "Create account" : "Sign in",
    ogTitle: mode === "signup" ? "Create account" : "Sign in",
});
</script>

<template>
    <main class="auth-route">
        <span class="brand-mark" aria-hidden="true">◆</span>
        <h1>{{ mode === "signup" ? "Create your account" : "Sign in to cv-sv" }}</h1>
        <p>The account dialog should open automatically.</p>
        <button type="button" @click="openAuthDialog(mode, redirectTo)">Open account dialog</button>
        <NuxtLink to="/">Return to the editor</NuxtLink>
    </main>
</template>

<style scoped>
.auth-route {
    min-height: calc(100vh - 56px);
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    padding: 32px;
    text-align: center;
}
.brand-mark { color: var(--accent); font-size: 28px; }
h1 { margin: 0; font-size: 24px; }
p { margin: 0; color: var(--fg-subtext0); }
button { margin-top: 8px; padding: 10px 16px; border: 0; border-radius: var(--radius-md); color: var(--bg-crust); background: var(--accent); font-weight: 700; cursor: pointer; }
a { color: var(--accent); font-size: 13px; }
</style>
