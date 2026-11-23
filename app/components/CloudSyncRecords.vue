<script setup lang='ts'>
import { computed, ref, watch } from 'vue';
import type { EngineView, RecordKey, SyncRecordView } from '~/utils/cloudSync/contracts';
import { SYNC_KIND_REGISTRY, SYNC_KINDS } from '~/utils/cloudSync/kinds';
import type { SyncKind } from '~/utils/cloudSync/types';
import { filterRecords, formatBytes, selectableActions, sortRecords, statusText, uploadPreview, type RecordFilter } from '~/utils/cloudSync/recordsView';

/**
 * Records view of the sync workspace: compare local and cloud records, select
 * records, and preview/confirm selective upload, download, unlink and removal.
 * All rules live in recordsView.ts; this component only renders EngineView.
 */
const props = defineProps<{ view: EngineView; busy: boolean }>();
const emit = defineEmits<{
    upload: [keys: RecordKey[]];
    download: [keys: RecordKey[]];
    unlink: [keys: RecordKey[]];
    remove: [keys: RecordKey[]];
    'open-conflict': [key: RecordKey];
    'open-history': [key: RecordKey];
}>();

const statusOptions: Array<{ value: RecordFilter['status']; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'local-only', label: 'Local only' },
    { value: 'cloud-only', label: 'Cloud only' },
    { value: 'synced', label: 'Synced' },
    { value: 'attention', label: 'Needs attention' },
];

const kindFilter = ref<SyncKind | 'all'>('all');
const statusFilter = ref<RecordFilter['status']>('all');
const selected = ref<RecordKey[]>([]);
const showUpload = ref(false);
const showDownload = ref(false);
const showRemove = ref(false);

const filtered = computed(() => filterRecords(sortRecords(props.view.records), { kind: kindFilter.value, status: statusFilter.value }));
const selectedRecords = computed(() => props.view.records.filter((record) => selected.value.includes(record.key)));
const actions = computed(() => selectableActions(selectedRecords.value));
const preview = computed(() => uploadPreview(props.view, actions.value.upload));
const cloudCopyCount = computed(() => props.view.records.filter((record) => record.cloudRevision !== undefined).length);
const allVisibleSelected = computed(() => filtered.value.length > 0 && filtered.value.every((record) => selected.value.includes(record.key)));
const someVisibleSelected = computed(() => filtered.value.some((record) => selected.value.includes(record.key)));
const quotaLabel = computed(() => preview.value.quotaLimit > 0 ? preview.value.quotaUsedAfter + ' / ' + preview.value.quotaLimit : String(preview.value.quotaUsedAfter) + ' (no quota reported)');
const blockedKindsLabel = computed(() => preview.value.blockedKinds.map(kindLabel).join(', '));
const nothingApplies = computed(() => actions.value.upload.length === 0 && actions.value.download.length === 0 && actions.value.unlink.length === 0 && actions.value.remove.length === 0);

watch(() => props.view.records, (records) => {
    const keys = new Set(records.map((record) => record.key));
    selected.value = selected.value.filter((key) => keys.has(key));
});

function kindLabel(kind: SyncKind): string {
    const label = SYNC_KIND_REGISTRY[kind].plural;
    return label.charAt(0).toUpperCase() + label.slice(1);
}
function selectLabel(record: SyncRecordView): string {
    return 'Select ' + record.title;
}
function badgeClass(record: SyncRecordView): string {
    return 'badge badge-' + record.status;
}
function canResolve(record: SyncRecordView): boolean {
    return record.status === 'conflict';
}
function hasCloudCopy(record: SyncRecordView): boolean {
    return record.cloudRevision !== undefined;
}
function formatTime(value?: string): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function toggleAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const visible = new Set(filtered.value.map((record) => record.key));
    if (checked) selected.value = [...new Set([...selected.value, ...visible])];
    else selected.value = selected.value.filter((key) => !visible.has(key));
}
function onToggle(record: SyncRecordView, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
        if (!selected.value.includes(record.key)) selected.value = [...selected.value, record.key];
    } else {
        selected.value = selected.value.filter((key) => key !== record.key);
    }
}
function closePanels(): void {
    showUpload.value = false;
    showDownload.value = false;
    showRemove.value = false;
}
function dropSelected(keys: RecordKey[]): void {
    selected.value = selected.value.filter((key) => !keys.includes(key));
}
function confirmUpload(): void {
    const keys = [...actions.value.upload];
    closePanels();
    dropSelected(keys);
    emit('upload', keys);
}
function confirmDownload(): void {
    const keys = [...actions.value.download];
    closePanels();
    dropSelected(keys);
    emit('download', keys);
}
function confirmUnlink(): void {
    const keys = [...actions.value.unlink];
    dropSelected(keys);
    emit('unlink', keys);
}
function confirmRemove(): void {
    const keys = [...actions.value.remove];
    closePanels();
    dropSelected(keys);
    emit('remove', keys);
}
function openConflict(record: SyncRecordView): void {
    emit('open-conflict', record.key);
}
function openHistory(record: SyncRecordView): void {
    emit('open-history', record.key);
}
</script>

<template>
    <section class='cloud-sync-records' aria-label='Records'>
        <div class='filters'>
            <label for='kind-filter'>Kind</label>
            <select id='kind-filter' v-model='kindFilter' :disabled='busy'>
                <option value='all'>All kinds</option>
                <option v-for='kind in SYNC_KINDS' :key='kind' :value='kind'>{{ kindLabel(kind) }}</option>
            </select>
            <div class='status-filter' role='group' aria-label='Filter by status'>
                <button v-for='option in statusOptions' :key='option.value' type='button' :aria-pressed='statusFilter === option.value' :disabled='busy' @click='statusFilter = option.value'>{{ option.label }}</button>
            </div>
        </div>

        <p v-if='view.records.length === 0' class='empty'>No records yet. Records you create here, or sync from another device, will appear here.</p>
        <p v-else-if='cloudCopyCount === 0' class='note'>No cloud copies yet. Records of kinds set to sync automatically upload by themselves; otherwise select a record and upload it.</p>
        <p v-else-if='filtered.length === 0' class='empty'>No records match these filters.</p>

        <div v-if='selected.length > 0' class='toolbar' aria-label='Selection actions'>
            <span>{{ selected.length }} selected</span>
            <button type='button' :disabled='busy || actions.upload.length === 0' @click='showUpload = true; showDownload = false; showRemove = false'>Upload ({{ actions.upload.length }})</button>
            <button type='button' :disabled='busy || actions.download.length === 0' @click='showDownload = true; showUpload = false; showRemove = false'>Download ({{ actions.download.length }})</button>
            <button type='button' :disabled='busy || actions.unlink.length === 0' @click='confirmUnlink'>Unlink ({{ actions.unlink.length }})</button>
            <button type='button' :disabled='busy || actions.remove.length === 0' @click='showRemove = true; showUpload = false; showDownload = false'>Remove from cloud ({{ actions.remove.length }})</button>
        </div>
        <p v-if='selected.length > 0 && nothingApplies' class='note'>Nothing applies to this selection. Resolve conflicts first, or pick records that are local-only, cloud-only, or linked.</p>

        <div v-if='showUpload' class='panel' role='dialog' aria-label='Confirm upload'>
            <h3>Upload {{ preview.count }} record(s)?</h3>
            <dl class='preview'>
                <div><dt>Records</dt><dd>{{ preview.count }}</dd></div>
                <div><dt>New cloud copies</dt><dd>{{ preview.newCopies }}</dd></div>
                <div><dt>Size</dt><dd>{{ formatBytes(preview.bytes) }}</dd></div>
                <div><dt>Cloud copies after upload</dt><dd>{{ quotaLabel }}</dd></div>
            </dl>
            <p v-for='entry in preview.overKinds' :key='entry.kind' class='warning' role='alert'>Over the limit for {{ entry.label }}: this upload would use {{ entry.usedAfter }} of {{ entry.limit }} cloud copies.</p>
            <p v-if='preview.overQuota && preview.overKinds.length === 0' class='warning' role='alert'>Over quota: this upload would use {{ preview.quotaUsedAfter }} of {{ preview.quotaLimit }} cloud copies.</p>
            <p v-if='preview.blockedKinds.length > 0' class='warning' role='alert'>Consent is not granted for: {{ blockedKindsLabel }}. Grant it on the <a href='#consent'>Consent tab</a> first.</p>
            <div class='panel-actions'>
                <button type='button' :disabled='busy || preview.overQuota || preview.blockedKinds.length > 0 || preview.count === 0' @click='confirmUpload'>Confirm upload</button>
                <button type='button' @click='showUpload = false'>Cancel</button>
            </div>
        </div>

        <div v-if='showDownload' class='panel' role='dialog' aria-label='Confirm download'>
            <h3>Download {{ actions.download.length }} record(s)?</h3>
            <p>Local records are never overwritten. If a downloaded record conflicts with a local one, you will be offered a choice instead.</p>
            <div class='panel-actions'>
                <button type='button' :disabled='busy || actions.download.length === 0' @click='confirmDownload'>Confirm download</button>
                <button type='button' @click='showDownload = false'>Cancel</button>
            </div>
        </div>

        <div v-if='showRemove' class='panel' role='dialog' aria-label='Confirm remove from cloud'>
            <h3>Remove {{ actions.remove.length }} cloud copy(ies)?</h3>
            <p>This removes the cloud copies only. Local data on this device is not touched.</p>
            <div class='panel-actions'>
                <button type='button' :disabled='busy || actions.remove.length === 0' @click='confirmRemove'>Remove from cloud</button>
                <button type='button' @click='showRemove = false'>Cancel</button>
            </div>
        </div>

        <table v-if='filtered.length > 0' class='records-table'>
            <thead>
                <tr>
                    <th><input type='checkbox' :checked='allVisibleSelected' :indeterminate='someVisibleSelected && !allVisibleSelected' aria-label='Select all records' :disabled='busy' @change='toggleAll'></th>
                    <th>Title</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Updated on this device</th>
                    <th>Updated in cloud</th>
                    <th>Size</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for='record in filtered' :key='record.key'>
                    <td><input type='checkbox' :checked='selected.includes(record.key)' :aria-label='selectLabel(record)' :disabled='busy' @change='onToggle(record, $event)'></td>
                    <td>{{ record.title }}<span v-if='record.message' class='record-message'> {{ record.message }}</span></td>
                    <td>{{ kindLabel(record.kind) }}</td>
                    <td><span :class='badgeClass(record)'>{{ statusText(record.status) }}</span></td>
                    <td>{{ formatTime(record.localUpdatedAt) }}</td>
                    <td>{{ formatTime(record.cloudUpdatedAt) }}</td>
                    <td>{{ formatBytes(record.bytes ?? 0) }}</td>
                    <td>
                        <button v-if='canResolve(record)' type='button' :disabled='busy' @click='openConflict(record)'>Resolve</button>
                        <button v-if='hasCloudCopy(record)' type='button' :disabled='busy' @click='openHistory(record)'>History</button>
                    </td>
                </tr>
            </tbody>
        </table>

        <ul v-if='filtered.length > 0' class='records-cards'>
            <li v-for='record in filtered' :key='record.key' class='record-card'>
                <label class='card-select'>
                    <input type='checkbox' :checked='selected.includes(record.key)' :aria-label='selectLabel(record)' :disabled='busy' @change='onToggle(record, $event)'>
                    <span>{{ record.title }}</span>
                </label>
                <span :class='badgeClass(record)'>{{ statusText(record.status) }}</span>
                <dl class='card-details'>
                    <div><dt>Kind</dt><dd>{{ kindLabel(record.kind) }}</dd></div>
                    <div><dt>Updated on this device</dt><dd>{{ formatTime(record.localUpdatedAt) }}</dd></div>
                    <div><dt>Updated in cloud</dt><dd>{{ formatTime(record.cloudUpdatedAt) }}</dd></div>
                    <div><dt>Size</dt><dd>{{ formatBytes(record.bytes ?? 0) }}</dd></div>
                </dl>
                <p v-if='record.message' class='record-message'>{{ record.message }}</p>
                <div class='card-actions'>
                    <button v-if='canResolve(record)' type='button' :disabled='busy' @click='openConflict(record)'>Resolve</button>
                    <button v-if='hasCloudCopy(record)' type='button' :disabled='busy' @click='openHistory(record)'>History</button>
                </div>
            </li>
        </ul>
    </section>
</template>

<style scoped>
.cloud-sync-records { display: grid; gap: 12px; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.status-filter { display: flex; flex-wrap: wrap; gap: 4px; }
.status-filter button[aria-pressed='true'] { font-weight: 700; text-decoration: underline; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.panel { border: 1px solid var(--border, rgba(128, 128, 128, 0.4)); border-radius: 8px; padding: 12px; }
.panel-actions { display: flex; gap: 8px; margin-top: 8px; }
.preview, .card-details { display: grid; gap: 4px; margin: 8px 0; }
.preview div, .card-details div { display: flex; gap: 8px; }
.preview dt, .card-details dt { color: var(--fg-subtext0); }
.preview dd, .card-details dd { margin: 0; }
.warning { color: var(--danger, #b91c1c); font-weight: 600; }
.empty, .note { color: var(--fg-subtext0); }
.record-message { display: block; color: var(--fg-subtext0); font-size: 12px; }
.badge { display: inline-block; padding: 2px 8px; border: 1px solid var(--border, rgba(128, 128, 128, 0.4)); border-radius: 999px; white-space: nowrap; }
.badge-conflict, .badge-error, .badge-blocked, .badge-over-limit { color: var(--danger, #b91c1c); border-color: var(--danger, #b91c1c); font-weight: 600; }
.badge-synced { color: var(--success, #15803d); border-color: var(--success, #15803d); }
.records-table { width: 100%; border-collapse: collapse; }
.records-table th, .records-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border, rgba(128, 128, 128, 0.25)); vertical-align: top; }
.records-cards { display: none; list-style: none; margin: 0; padding: 0; }
.record-card { display: grid; gap: 8px; border: 1px solid var(--border, rgba(128, 128, 128, 0.4)); border-radius: 8px; padding: 12px; margin-bottom: 8px; }
.card-select { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.card-actions { display: flex; gap: 8px; }
button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--accent, #2563eb); outline-offset: 2px; }
button:disabled, input:disabled, select:disabled { opacity: 0.55; }
@media (max-width: 640px) {
    .records-table { display: none; }
    .records-cards { display: block; }
}
</style>
