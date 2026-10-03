<script setup lang="ts">
import type { IconCode } from "~/utils/icons";

/** Decorative icon by Iconify code; give the surrounding control its accessible name. */
withDefaults(defineProps<{ name: IconCode; size?: number }>(), { size: 18 });
</script>

<template>
    <Icon class="app-icon" :name="name" :size="size" aria-hidden="true" />
</template>

<style scoped>
.app-icon { display: block; flex: none; }
</style>
