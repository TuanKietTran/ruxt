<script setup lang='ts'>
import type { RecordKey } from '~/utils/cloudSync/contracts';
import type { BannerModel } from '~/utils/cloudSync/syncSummary';

/** One line saying what cloud sync is doing for a list, with a Download action when records wait in the cloud. */
defineProps<{ banner: BannerModel; busy?: boolean }>();
const emit = defineEmits<{ download: [keys: RecordKey[]]; 'sync-now': [] }>();
</script>

<template>
    <div class='cloud-banner' :class='`cloud-banner--${banner.tone}`' role='status' data-testid='cloud-sync-banner'>
        <AppIcon v-if='banner.tone === "busy"' name='lucide:cloud-download' :size='14' class='cloud-banner__icon cloud-banner__icon--busy' />
        <AppIcon v-else-if='banner.tone === "warning" || banner.tone === "danger"' name='lucide:triangle-alert' :size='14' class='cloud-banner__icon' />
        <AppIcon v-else name='lucide:cloud' :size='14' class='cloud-banner__icon' />
        <span class='cloud-banner__text'>{{ banner.text }}</span>
        <button v-if='banner.download' type='button' class='cloud-banner__action' :disabled='busy' @click='emit("download", banner.download.keys)'>{{ banner.download.label }}</button>
        <button v-if='banner.syncNow' type='button' class='cloud-banner__action' :disabled='busy' @click='emit("sync-now")'>Sync now</button>
        <NuxtLink v-if='banner.href' :to='banner.href' class='cloud-banner__link'>Details</NuxtLink>
    </div>
</template>

<style scoped>
.cloud-banner { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 6px 0; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-surface0); color: var(--fg-subtext1); font-size: 12px; line-height: 1.4; }
.cloud-banner--busy { color: var(--accent); }
.cloud-banner--warning { color: var(--warning); }
.cloud-banner--danger { color: var(--danger); }
.cloud-banner__icon { flex: none; }
.cloud-banner__icon--busy { animation: cloud-banner-pulse 1.4s ease-in-out infinite; }
.cloud-banner__text { flex: 1 1 140px; min-width: 0; }
.cloud-banner__action { padding: 2px 8px; border: 1px solid var(--accent); border-radius: var(--radius-sm); background: var(--accent); color: var(--bg-base, #fff); cursor: pointer; font-size: 12px; }
.cloud-banner__action:disabled { opacity: 0.6; cursor: not-allowed; }
.cloud-banner__link { color: inherit; text-decoration: underline; }
.cloud-banner__action:focus-visible, .cloud-banner__link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@keyframes cloud-banner-pulse { 50% { opacity: 0.4; } }
@media (prefers-reduced-motion: reduce) { .cloud-banner__icon--busy { animation: none; } }
</style>
