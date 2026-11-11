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
        <h1>{{ mode === "signup" ? "Create your account" : "Sign in to Ruxt" }}</h1>
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
h1 { margin: 0; font-size: 24px; font-weight: 700; line-height: 1.25; }
p { margin: 0; color: var(--fg-subtext0); }
button { margin-top: 8px; padding: 12px 16px; border: 0; border-radius: var(--radius-md); color: var(--bg-crust); background: var(--accent); font-weight: 600; cursor: pointer; transition: background 0.15s ease; }
button:hover { background: var(--accent-hover); }
button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
a { color: var(--accent); font-size: 13px; }
</style>
