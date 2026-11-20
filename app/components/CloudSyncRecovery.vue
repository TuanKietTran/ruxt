<script setup lang='ts'>
import { computed } from 'vue';
import type { RecoveryEntry } from '~/utils/cloudSync/contracts';
import { recoveryGroups, reasonText } from '~/utils/cloudSync/historyView';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
    entries: RecoveryEntry[];
}>();

const emit = defineEmits<{
    restore: [entry: RecoveryEntry];
}>();

const groups = computed(() => recoveryGroups(props.entries));

function kindLabel(kind: RecoveryEntry['kind']): string {
    return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function formatDay(day: string): string {
    const date = new Date(`${day}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
        return day;
    }
    return date.toLocaleDateString();
}

function formatTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleTimeString();
}

function restoreLabel(entry: RecoveryEntry): string {
    return `Restore ${entry.title} as copy`;
}

function onRestore(entry: RecoveryEntry): void {
    emit('restore', entry);
}
</script>

<template>
    <section class='cloud-recovery' aria-labelledby='cloud-recovery-title'>
        <h2 id='cloud-recovery-title'>
            <AppIcon name='lucide:archive-restore' />
            Local recovery copies
        </h2>
        <p class='cloud-recovery__intro'>These are local versions saved before sync replaced them. Restoring one creates a new local record and never changes the cloud version.</p>
        <p v-if='props.entries.length === 0' class='notice'>No local recovery copies saved yet.</p>
        <div v-else class='recovery-groups'>
            <section v-for='group in groups' :key='group.day' class='recovery-group'>
                <h3>{{ formatDay(group.day) }}</h3>
                <ul class='recovery-list'>
                    <li v-for='entry in group.entries' :key='entry.blobKey' class='recovery-item'>
                        <div class='recovery-item__head'>
                            <h4>{{ entry.title }}</h4>
                            <span>{{ kindLabel(entry.kind) }}</span>
                        </div>
                        <p class='recovery-item__meta'>{{ reasonText(entry.reason) }} · {{ formatTime(entry.savedAt) }}</p>
                        <button type='button' :aria-label='restoreLabel(entry)' @click='onRestore(entry)'>Restore as copy</button>
                    </li>
                </ul>
            </section>
        </div>
    </section>
</template>

<style scoped>
.cloud-recovery { display: grid; gap: 16px; padding: 24px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-mantle); }
.cloud-recovery h2 { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 600; }
.cloud-recovery__intro, .notice { margin: 0; color: var(--fg-subtext0); line-height: 1.55; }
.notice { padding: 12px 16px; border-radius: var(--radius-sm); background: var(--bg-surface0); }
.recovery-groups { display: grid; gap: 20px; }
.recovery-group h3 { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
.recovery-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.recovery-item { display: grid; gap: 8px; padding: 16px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-surface0); }
.recovery-item__head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.recovery-item__head h4 { margin: 0; font-size: 15px; font-weight: 600; }
.recovery-item__meta { margin: 0; color: var(--fg-subtext0); line-height: 1.55; }
.recovery-item button { justify-self: start; min-height: 40px; padding: 8px 16px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.recovery-item button:hover { background: var(--bg-surface0); }
.recovery-item button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 640px) {
    .cloud-recovery { padding: 16px; }
    .recovery-item__head { flex-direction: column; align-items: flex-start; gap: 4px; }
    .recovery-item button { justify-self: stretch; }
}
</style>
