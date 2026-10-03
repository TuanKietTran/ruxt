<script setup lang="ts">
import { useTheme, type ThemeId } from "~/composables/useTheme";

const { current, themes, apply } = useTheme();
const route = useRoute();

const nav = [
    { label: "Dashboard", to: "/d", exact: true },
];

const { user, logout } = useAppAuth();
const { authenticated } = useFeatureFlags();
const { openAuthDialog } = useAuthDialog();
const handleLogout = async () => {
    await logout();
    await navigateTo("/");
};
</script>

<template>
    <div class="layout">
        <header class="header">
            <div class="header-inner">
                <NuxtLink to="/" class="logo">
                    <span class="logo-mark">◆</span>
                    <span class="logo-text">ruxt</span>
                </NuxtLink>

                <nav class="nav" aria-label="Main navigation">
                    <NuxtLink
                        v-for="item in nav"
                        :key="item.to"
                        :to="item.to"
                        class="nav-link"
                        :class="{ active: item.exact ? route.path === item.to : route.path.startsWith(item.to) }"
                    >
                        {{ item.label }}
                    </NuxtLink>
                </nav>

                <div class="header-actions">
                    <select
                        class="theme-select"
                        :value="current"
                        aria-label="Select theme"
                        @change="
                            apply(
                                ($event.target as HTMLSelectElement)
                                    .value as ThemeId,
                            )
                        "
                    >
                        <option v-for="t in themes" :key="t.id" :value="t.id">
                            {{ t.label }}
                        </option>
                    </select>
                    <NuxtLink to="/settings" class="btn btn-ghost btn-sm">Settings</NuxtLink>
                    <template v-if="authenticated">
                        <template v-if="user">
                            <NuxtLink to="/settings/cloud-data" class="btn btn-ghost btn-sm">Cloud data</NuxtLink>
                            <span class="user-email">{{ user.email }}</span>
                            <button
                                class="btn btn-ghost btn-sm"
                                type="button"
                                @click="handleLogout"
                            >
                                Logout
                            </button>
                        </template>
                        <template v-else>
                            <button class="btn btn-ghost btn-sm" type="button" @click="openAuthDialog('login')">Sign in</button>
                            <button class="btn btn-primary btn-sm" type="button" @click="openAuthDialog('signup')">Create account</button>
                        </template>
                    </template>
                </div>
            </div>
        </header>

        <main id="main-content" class="main">
            <slot />
        </main>
    </div>
</template>

<style scoped>
.layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

/* Header */
.header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: var(--bg-mantle);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px);
}
.header-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 24px;
    height: 56px;
    display: flex;
    align-items: center;
    gap: 32px;
}

/* Logo */
.logo {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--fg-text);
    font-weight: 700;
    font-size: 18px;
    text-decoration: none;
}
.logo-mark {
    color: var(--accent);
    font-size: 14px;
}
.logo-text {
    letter-spacing: -0.02em;
}

/* Nav */
.nav {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
}
.nav-link {
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    color: var(--fg-subtext0);
    font-size: 14px;
    font-weight: 500;
    transition:
        color 0.15s,
        background 0.15s;
}
.nav-link:hover {
    color: var(--fg-text);
    background: var(--bg-surface0);
}
.nav-link.active {
    color: var(--fg-text);
    background: var(--bg-surface0);
}

/* Header actions */
.header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
}

.theme-select {
    background: var(--bg-surface0);
    color: var(--fg-subtext1);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
    outline: none;
}
.theme-select:focus-visible {
    border-color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}

/* Buttons */
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border-radius: var(--radius-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
        background 0.15s,
        color 0.15s,
        border-color 0.15s;
    border: 1px solid transparent;
    text-decoration: none;
    white-space: nowrap;
}
.btn-sm {
    padding: 5px 14px;
    font-size: 13px;
}
.btn-ghost {
    background: transparent;
    color: var(--fg-subtext1);
    border-color: var(--border);
}
.btn-ghost:hover {
    background: var(--bg-surface0);
    color: var(--fg-text);
}
.btn-primary {
    color: var(--bg-crust);
    background: var(--accent);
}
.btn-primary:hover { background: var(--accent-hover); }

.main {
    flex: 1;
}

.user-email {
    font-size: 13px;
    color: var(--fg-subtext0);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
