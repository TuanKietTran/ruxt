<script setup lang='ts'>
import type { IconCode } from '~/utils/icons';
import type { EngineView } from '~/utils/cloudSync/contracts';
import { describeSyncStatus } from '~/utils/cloudSync/statusLabel';

const props = defineProps<{ view: EngineView | null }>();

const emit = defineEmits<{ (e: 'sync-now'): void }>();

// Frozen at render; the parent re-renders when the engine view changes.
const status = computed(() => describeSyncStatus(props.view, Date.now()));
const isSyncing = computed(() => props.view?.status === 'syncing');
const iconName = computed(() => (status.value?.icon as IconCode | undefined) ?? 'lucide:cloud');
const pillClass = computed(() => status.value ? `cloud-sync-status__pill--${status.value.tone}` : '');
const iconClass = computed(() => status.value?.tone === 'busy' ? 'cloud-sync-status__icon--spin' : '');
const accessibleName = computed(() => {
   if (!status.value) return '';
   return status.value.detail ? `${status.value.label}: ${status.value.detail}` : status.value.label;
});
const emitSync = () => emit('sync-now');
</script>

<template>
    <div v-if='status' class='cloud-sync-status'>
        <NuxtLink to='/settings/cloud-data' class='cloud-sync-status__pill' :class='pillClass' :title='status.detail || status.label' :aria-label='accessibleName'>
            <AppIcon :name='iconName' :size='16' :class='iconClass' />
            <span class='cloud-sync-status__label'>{{ status.label }}</span>
        </NuxtLink>
        <button type='button' class='cloud-sync-status__sync' aria-label='Sync now' :disabled='isSyncing' @click='emitSync'>
            <AppIcon name='lucide:refresh-cw' :size='16' />
        </button>
    </div>
</template>

<style scoped>
.cloud-sync-status { display: flex; align-items: center; gap: 4px; min-width: 0; }
.cloud-sync-status__pill {
    display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%;
    padding: 4px 8px; border: 1px solid var(--border); border-radius: var(--radius-md);
    background: var(--bg-surface0); color: var(--fg-subtext1);
    font-size: 12px; line-height: 1.4; text-decoration: none; white-space: nowrap;
}
.cloud-sync-status__pill:hover { border-color: var(--fg-subtext0); }
.cloud-sync-status__pill--ok { color: var(--success); }
.cloud-sync-status__pill--busy { color: var(--accent); }
.cloud-sync-status__pill--warning { color: var(--warning); }
.cloud-sync-status__pill--danger { color: var(--danger); }
.cloud-sync-status__label { overflow: hidden; text-overflow: ellipsis; }
.cloud-sync-status__sync {
    display: inline-flex; align-items: center; justify-content: center; flex: none;
    padding: 4px; border: 1px solid var(--border); border-radius: var(--radius-md);
    background: var(--bg-surface0); color: var(--fg-subtext1); cursor: pointer;
}
.cloud-sync-status__sync:hover { border-color: var(--fg-subtext0); }
.cloud-sync-status__sync:disabled { opacity: 0.5; cursor: not-allowed; }
.cloud-sync-status__pill:focus-visible, .cloud-sync-status__sync:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cloud-sync-status__icon--spin { animation: cloud-sync-spin 1s linear infinite; }
@keyframes cloud-sync-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .cloud-sync-status__icon--spin { animation: none; } }
@media (max-width: 479px) { .cloud-sync-status__label { display: none; } }
</style>
