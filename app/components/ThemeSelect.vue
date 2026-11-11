<script setup lang="ts">
import { useTheme, type ThemeId } from "~/composables/useTheme";

const { current, themes, apply } = useTheme();
const { push: pushToast } = useToast();
const themeReady = ref(false);

function onThemeChange(event: Event) {
    const id = (event.target as HTMLSelectElement).value as ThemeId;
    try {
        apply(id);
        const label = themes.find((theme) => theme.id === id)?.label ?? id;
        pushToast(`Theme changed to ${label}.`, { tone: "success" });
    } catch {
        pushToast("The theme could not be saved.", { tone: "error" });
    }
}
onMounted(() => {
    useTheme().init();
    themeReady.value = true;
});
</script>

<template>
    <select
        v-if="themeReady"
        class="theme-select"
        :value="current"
        aria-label="Select theme"
        @change="onThemeChange"
    >
        <option v-for="theme in themes" :key="theme.id" :value="theme.id">
            {{ theme.label }}
        </option>
    </select>
</template>

<style scoped>
.theme-select {
    height: 32px;
    max-width: 152px;
    padding: 0 8px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-surface0);
    color: var(--fg-subtext1);
    font-size: 12px;
    cursor: pointer;
    transition: border-color .15s ease, color .15s ease, background-color .15s ease;
}
.theme-select:hover {
    border-color: var(--fg-subtext0);
    background: var(--bg-surface1, var(--bg-surface0));
    color: var(--fg-text);
}
.theme-select:focus-visible {
    border-color: var(--accent);
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
    .theme-select {
        transition: none;
    }
}
</style>
