<script setup lang='ts'>
import { computed, nextTick, onMounted, ref, useTemplateRef } from 'vue';
import type { CloudHistoryDto, SyncSnapshot } from '~/utils/cloudSync/types';
import type { SyncRecordView } from '~/utils/cloudSync/contracts';
import { historyItems } from '~/utils/cloudSync/historyView';
import type { HistoryItem } from '~/utils/cloudSync/historyView';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
    record: SyncRecordView;
    history: CloudHistoryDto | null;
    loading: boolean;
    error: string | null;
}>();

const emit = defineEmits<{
    'restore-as-copy': [snapshot: SyncSnapshot];
    promote: [snapshot: SyncSnapshot];
    compare: [snapshot: SyncSnapshot];
    close: [];
}>();

const items = computed(() => {
    if (props.history === null) {
        return [];
    }
    return historyItems(props.history);
});
const heading = useTemplateRef('heading');
const confirmingId = ref<string | null>(null);

onMounted(() => {
    nextTick(() => {
        heading.value?.focus();
    });
});

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
}

function restoreLabel(item: HistoryItem): string {
    return `Restore ${item.label} as copy`;
}

function compareLabel(item: HistoryItem): string {
    return `Compare ${item.label} with this device`;
}

function promoteLabel(item: HistoryItem): string {
    return `Make ${item.label} current`;
}

function confirmLabel(item: HistoryItem): string {
    return `Confirm making ${item.label} current`;
}

function onClose(): void {
    emit('close');
}

function onRestore(item: HistoryItem): void {
    emit('restore-as-copy', item.snapshot);
}

function onCompare(item: HistoryItem): void {
    emit('compare', item.snapshot);
}

function onRequestPromote(item: HistoryItem): void {
    confirmingId.value = item.id;
}

function onConfirmPromote(item: HistoryItem): void {
    confirmingId.value = null;
    emit('promote', item.snapshot);
}

function onCancelPromote(): void {
    confirmingId.value = null;
}
</script>

<template>
    <div class='cloud-history' role='dialog' aria-modal='true' aria-labelledby='cloud-history-title' @keydown.escape='onClose'>
        <header class='cloud-history__header'>
            <h2 id='cloud-history-title' ref='heading' tabindex='-1'>
                <AppIcon name='lucide:history' />
                History: {{ props.record.title }}
            </h2>
            <button type='button' class='cloud-history__close' @click='onClose'>Close</button>
        </header>
        <p class='cloud-history__intro'>Restoring as a copy creates a new local record and never changes the cloud version.</p>
        <p v-if='props.loading' class='notice' role='status'>
            <AppIcon name='lucide:loader-circle' />
            Loading history…
        </p>
        <p v-else-if='props.error' class='notice error' role='alert'>{{ props.error }}</p>
        <p v-else-if='props.history === null' class='notice'>No history available yet.</p>
        <ul v-else class='history-list'>
            <li v-for='item in items' :key='item.id' class='history-item'>
                <div class='history-item__head'>
                    <h3>{{ item.label }}</h3>
                    <span>Revision {{ item.revision }}</span>
                </div>
                <p class='history-item__meta'>{{ formatDate(item.changedAt) }} · {{ formatBytes(item.bytes) }}</p>
                <p v-if='item.preview' class='history-item__preview'>{{ item.preview }}</p>
                <p v-else class='history-item__preview'>No preview available.</p>
                <div class='history-item__actions'>
                    <button type='button' :aria-label='restoreLabel(item)' @click='onRestore(item)'>Restore as copy</button>
                    <button type='button' :aria-label='compareLabel(item)' @click='onCompare(item)'>Compare with this device</button>
                    <button v-if='!item.isHead' type='button' :aria-label='promoteLabel(item)' @click='onRequestPromote(item)'>Make current</button>
                </div>
                <div v-if='confirmingId === item.id' class='confirm' role='group' :aria-label='confirmLabel(item)'>
                    <p>Making this version current switches the cloud copy and this device to it. The current version stays in history.</p>
                    <div class='history-item__actions'>
                        <button type='button' class='button--primary' :aria-label='confirmLabel(item)' @click='onConfirmPromote(item)'>Make current</button>
                        <button type='button' @click='onCancelPromote'>Cancel</button>
                    </div>
                </div>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.cloud-history { display: grid; gap: 16px; padding: 24px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-mantle); }
.cloud-history__header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.cloud-history__header h2 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 600; }
.cloud-history__header h2:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cloud-history__intro, .notice { margin: 0; color: var(--fg-subtext0); line-height: 1.55; }
.notice { padding: 12px 16px; border-radius: var(--radius-sm); background: var(--bg-surface0); }
.error { color: var(--danger); }
.history-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
.history-item { display: grid; gap: 8px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-surface0); }
.history-item__head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.history-item__head h3 { margin: 0; font-size: 15px; font-weight: 600; }
.history-item__meta, .history-item__preview { margin: 0; color: var(--fg-subtext0); line-height: 1.55; }
.history-item__preview { color: var(--fg-subtext1); }
.history-item__actions { display: flex; flex-wrap: wrap; gap: 8px; }
.history-item__actions button, .cloud-history__close { min-height: 40px; padding: 8px 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.history-item__actions button:hover, .cloud-history__close:hover { background: var(--bg-surface0); }
.history-item__actions button:focus-visible, .cloud-history__close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.button--primary { border-color: transparent; background: var(--accent); color: var(--bg-crust); }
.confirm { display: grid; gap: 12px; padding: 12px 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-mantle); }
.confirm p { margin: 0; color: var(--fg-subtext0); line-height: 1.55; }
.history-item__actions button.button--primary:hover { background: var(--accent-hover); }
@media (max-width: 640px) {
    .cloud-history { padding: 16px; }
    .history-item__head { flex-direction: column; align-items: flex-start; gap: 4px; }
    .history-item__actions button { flex: 1 1 auto; }
}
</style>
