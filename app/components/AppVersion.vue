<script setup lang="ts">
import { formatAppVersion } from "~/utils/app-version";

const config = useRuntimeConfig();
const label = computed(() => formatAppVersion(String(config.public.appVersion ?? ""), String(config.public.appCommit ?? "")));
</script>

<template>
    <span class="app-version">{{ label }}</span>
</template>

<style scoped>
.app-version {
    font-size: 12px;
    color: var(--fg-subtext0);
    user-select: text;
}
</style>
