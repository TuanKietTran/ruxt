<script setup lang="ts">
import type { CloudHistoryDto, ConsentViewDto, SyncSnapshot } from "~/utils/cloudSync/types";
import type { RecordKey, SyncRecordView } from "~/utils/cloudSync/contracts";
import type { ConsentCategory } from "~/utils/cloudSync/consentView";
import { summarizeMetrics } from "~/utils/cloudSync/state";
import { relativeTime } from "~/utils/cloudSync/statusLabel";
import { formatBytes } from "~/utils/cloudSync/recordsView";

type Tab = "overview" | "records" | "conflicts" | "history" | "consent";
const tabs: Array<{ id: Tab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "records", label: "Records" },
    { id: "conflicts", label: "Conflicts" },
    { id: "history", label: "History and recovery" },
    { id: "consent", label: "Consent and privacy" },
];

const { user } = useAppAuth();
const sync = useCloudSync();
const view = sync.view;
const accountFetch = useAccountFetch();
const route = useRoute();
const tab = ref<Tab>((tabs.some(item => item.id === route.hash.slice(1)) ? route.hash.slice(1) : "overview") as Tab);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
onMounted(() => { clock = setInterval(() => { now.value = Date.now(); }, 30_000); });
onBeforeUnmount(() => clearInterval(clock));

// Consent: shown from the engine when it has it, otherwise loaded once for this page.
const consentOverride = ref<ConsentViewDto | null>(null);
const consent = computed(() => consentOverride.value ?? view.value?.consent ?? null);
const consentSaving = ref<string | null>(null);
const consentError = ref<string | null>(null);
onMounted(async () => {
    if (!view.value?.consent && user.value) {
        try { consentOverride.value = await accountFetch<ConsentViewDto>("/api/cloud-data/consent"); } catch { consentError.value = "Consent settings could not be loaded."; }
    }
});
async function acknowledge() {
    consentSaving.value = "notice";
    consentError.value = null;
    try {
        consentOverride.value = await accountFetch<ConsentViewDto>("/api/cloud-data/retention-acknowledgement", { method: "POST" });
    } catch (error: any) {
        consentError.value = error?.data?.statusMessage || "The acknowledgement could not be saved.";
    } finally { consentSaving.value = null; }
}
async function setConsent(category: ConsentCategory, granted: boolean) {
    consentSaving.value = category;
    consentError.value = null;
    try {
        consentOverride.value = await accountFetch<ConsentViewDto>("/api/cloud-data/consent", { method: "PUT", body: { category, granted } });
        await sync.syncNow(); // the engine re-reads consent with this exchange and retries blocked records
    } catch (error: any) {
        consentError.value = error?.data?.statusMessage || "The consent change could not be saved.";
    } finally { consentSaving.value = null; }
}

// Conflicts
const conflicts = computed(() => view.value?.records.filter(record => record.status === "conflict") ?? []);
const activeConflict = ref<SyncRecordView | null>(null);
const conflictSides = ref<{ local: SyncSnapshot | null; cloud: SyncSnapshot | null; base: SyncSnapshot | null } | null>(null);
async function openConflict(key: RecordKey) {
    tab.value = "conflicts";
    activeConflict.value = view.value?.records.find(record => record.key === key) ?? null;
    conflictSides.value = activeConflict.value ? await sync.compare(key) : null;
}
async function resolveConflict(choice: "local" | "cloud" | "both") {
    if (!activeConflict.value) return;
    await sync.resolve(activeConflict.value.key, choice);
    activeConflict.value = null;
    conflictSides.value = null;
}
async function resolveMerged(snapshot: SyncSnapshot) {
    if (!activeConflict.value) return;
    await sync.resolveMerged(activeConflict.value.key, snapshot);
    activeConflict.value = null;
    conflictSides.value = null;
}

// History
const historyRecord = ref<SyncRecordView | null>(null);
const historyData = ref<CloudHistoryDto | null>(null);
const historyLoading = ref(false);
const historyError = ref<string | null>(null);
const historyNotice = ref("");
async function openHistory(key: RecordKey) {
    tab.value = "history";
    historyRecord.value = view.value?.records.find(record => record.key === key) ?? null;
    historyData.value = null;
    historyError.value = null;
    historyLoading.value = true;
    historyData.value = await sync.history(key);
    if (!historyData.value) historyError.value = sync.error.value || "History could not be loaded.";
    historyLoading.value = false;
}
async function restoreAsCopy(snapshot: SyncSnapshot) {
    if (!historyRecord.value) return;
    const id = await sync.restoreAsCopy(historyRecord.value.key, snapshot);
    historyNotice.value = id ? "Restored as a new local copy. The cloud copy did not change." : "The copy could not be created.";
}
async function promote(snapshot: SyncSnapshot) {
    if (!historyRecord.value) return;
    await sync.promote(historyRecord.value.key, snapshot);
    historyNotice.value = "This version is now current on this device and in the cloud. The previous version stays in history.";
    await openHistory(historyRecord.value.key);
}
async function compareWith(snapshot: SyncSnapshot) {
    if (!historyRecord.value) return;
    activeConflict.value = historyRecord.value;
    const sides = await sync.compare(historyRecord.value.key);
    conflictSides.value = sides ? { ...sides, cloud: snapshot } : null;
    tab.value = "conflicts";
}
async function restoreRecovery(entry: Parameters<typeof sync.restoreRecovery>[0]) {
    const id = await sync.restoreRecovery(entry);
    historyNotice.value = id ? "Recovered as a new local copy." : "That recovery copy is no longer available.";
}

// Overview numbers (this device)
const lastHour = computed(() => view.value ? summarizeMetrics({ metrics: view.value.metrics } as any, now.value - 3_600_000, now.value) : null);
const lastDay = computed(() => view.value ? summarizeMetrics({ metrics: view.value.metrics } as any, now.value - 86_400_000, now.value) : null);
const pushText = computed(() => ({
    connected: "Live updates on", connecting: "Connecting", down: "Reconnecting", unavailable: "Live updates unavailable; checking periodically", idle: "Not connected",
}[view.value?.push ?? "idle"]));
</script>

<template>
    <div class="cloud-workspace">
        <header class="page-header">
            <p class="eyebrow">Your data</p>
            <h1>Cloud sync</h1>
            <p>
                Everything you create stays in this browser first. Choose which sessions, templates and profiles
                also live in your account, so they follow you to other devices. Nothing uploads until you select it.
            </p>
        </header>

        <p v-if="!user" class="notice" role="status">Sign in to use cloud sync. Your local data is unaffected.</p>

        <template v-else>
            <nav class="tabs" aria-label="Cloud sync sections">
                <button
                    v-for="item in tabs" :key="item.id" type="button" class="tab" :aria-current="tab === item.id ? 'page' : undefined"
                    @click="tab = item.id"
                >
                    {{ item.label }}
                    <span v-if="item.id === 'conflicts' && conflicts.length" class="count">{{ conflicts.length }}</span>
                </button>
            </nav>

            <p v-if="sync.error.value" class="notice error" role="alert">{{ sync.error.value }}</p>
            <p v-if="!view" class="notice" role="status">Starting cloud sync…</p>

            <section v-else-if="tab === 'overview'" class="panel" aria-labelledby="overview-title">
                <h2 id="overview-title">Overview</h2>
                <dl class="facts">
                    <div><dt>Last synced</dt><dd>{{ view.lastSyncAt ? relativeTime(view.lastSyncAt, now) : "Not yet" }}</dd></div>
                    <div><dt>Connection</dt><dd>{{ pushText }}</dd></div>
                    <div><dt>Waiting to upload</dt><dd>{{ view.pendingCount }}</dd></div>
                    <div><dt>Conflicts</dt><dd>{{ view.conflictCount }}</dd></div>
                    <div><dt>Cloud copies</dt><dd>{{ view.quota ? `${view.quota.used} of ${view.quota.limit}` : "Unknown until the first sync" }}</dd></div>
                    <div><dt>Selected on this device</dt><dd>{{ view.records.filter(record => record.linked).length }}</dd></div>
                </dl>
                <p v-if="view.lastError" class="notice error" role="status">Last problem: {{ view.lastError.message }}</p>
                <p v-if="view.retentionConfigured === false" class="notice">Cloud saving is not configured on this service yet; nothing can be uploaded.</p>
                <div class="actions">
                    <button type="button" class="primary" :disabled="sync.busy.value || view.status === 'syncing'" @click="sync.syncNow()">
                        <AppIcon name="lucide:refresh-cw" /> Sync now
                    </button>
                    <button type="button" @click="tab = 'records'">Choose what to sync</button>
                </div>
                <h3>Network use on this device</h3>
                <dl v-if="lastHour && lastDay" class="facts small">
                    <div><dt>Requests, last hour</dt><dd>{{ lastHour.requests }}</dd></div>
                    <div><dt>Requests, last 24 h</dt><dd>{{ lastDay.requests }}</dd></div>
                    <div><dt>Data, last 24 h</dt><dd>{{ formatBytes(lastDay.bytesUp) }} up, {{ formatBytes(lastDay.bytesDown) }} down</dd></div>
                    <div><dt>Live update messages, 24 h</dt><dd>{{ lastDay.pushMessages }}</dd></div>
                </dl>
            </section>

            <CloudSyncRecords
                v-else-if="tab === 'records'" :view="view" :busy="sync.busy.value"
                @upload="sync.upload" @download="sync.download" @unlink="sync.unlink" @remove="sync.removeFromCloud"
                @open-conflict="openConflict" @open-history="openHistory"
            />

            <section v-else-if="tab === 'conflicts'" class="panel" aria-labelledby="conflicts-title">
                <h2 id="conflicts-title">Conflicts</h2>
                <CloudSyncConflict
                    v-if="activeConflict && conflictSides" :record="activeConflict" :sides="conflictSides" :busy="sync.busy.value"
                    @resolve="resolveConflict" @merged="resolveMerged" @close="activeConflict = null"
                />
                <template v-else>
                    <p v-if="!conflicts.length" class="empty">No conflicts. When this device and the cloud both change the same record, it appears here and both versions are kept until you choose.</p>
                    <ul v-else class="conflict-list">
                        <li v-for="record in conflicts" :key="record.key">
                            <span><strong>{{ record.title }}</strong> <small>{{ record.kind }}</small></span>
                            <button type="button" @click="openConflict(record.key)"><AppIcon name="lucide:git-compare" /> Review</button>
                        </li>
                    </ul>
                </template>
            </section>

            <section v-else-if="tab === 'history'" class="panel" aria-labelledby="history-title">
                <h2 id="history-title">History and recovery</h2>
                <p v-if="historyNotice" class="notice" role="status">{{ historyNotice }}</p>
                <CloudSyncHistory
                    v-if="historyRecord" :record="historyRecord" :history="historyData" :loading="historyLoading" :error="historyError"
                    @restore-as-copy="restoreAsCopy" @promote="promote" @compare="compareWith" @close="historyRecord = null"
                />
                <p v-else class="empty">Open History on a record in the Records tab to see its saved cloud versions.</p>
                <CloudSyncRecovery :entries="view.recovery" @restore="restoreRecovery" />
            </section>

            <CloudSyncConsent
                v-else-if="tab === 'consent'" :consent="consent" :saving="consentSaving" :error="consentError"
                @acknowledge="acknowledge" @set-consent="setConsent"
            />
        </template>
    </div>
</template>

<style scoped>
.cloud-workspace { width: min(1040px, calc(100% - 32px)); margin: 40px auto; display: grid; gap: 20px; }
.page-header h1 { margin: 4px 0 10px; font-size: 32px; }
.page-header p { max-width: 720px; color: var(--fg-subtext0); line-height: 1.6; }
.page-header .eyebrow { color: var(--accent); font-size: 12px; font-weight: 600; }
.tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
.tab { border: 0; background: none; padding: 10px 14px; color: var(--fg-subtext0); border-bottom: 2px solid transparent; cursor: pointer; display: inline-flex; gap: 6px; align-items: center; }
.tab[aria-current="page"] { color: var(--fg-text, inherit); border-bottom-color: var(--accent); font-weight: 600; }
.tab:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.count { background: var(--danger); color: var(--bg-base, #fff); border-radius: 999px; padding: 0 7px; font-size: 12px; }
.panel { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-mantle); padding: 24px; display: grid; gap: 16px; }
.panel h2 { margin: 0; font-size: 18px; }
.panel h3 { margin: 8px 0 0; font-size: 14px; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 0; }
.facts div { background: var(--bg-surface0); border-radius: var(--radius-sm); padding: 12px; }
.facts dt { font-size: 12px; color: var(--fg-subtext0); }
.facts dd { margin: 4px 0 0; font-weight: 600; }
.facts.small dd { font-weight: 500; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
.actions button, .conflict-list button { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-surface0); cursor: pointer; }
.actions .primary { background: var(--accent); color: var(--bg-base, #fff); border-color: var(--accent); }
button:disabled { opacity: .6; cursor: not-allowed; }
.notice { margin: 0; padding: 12px 16px; border-radius: var(--radius-sm); background: var(--bg-surface0); }
.error { color: var(--danger); }
.empty { color: var(--fg-subtext0); margin: 0; }
.conflict-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.conflict-list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px; background: var(--bg-surface0); border-radius: var(--radius-sm); }
.conflict-list small { color: var(--fg-subtext0); margin-left: 6px; }
@media (max-width: 640px) {
    .cloud-workspace { margin-top: 24px; }
    .panel { padding: 16px; }
    .page-header h1 { font-size: 26px; }
}
</style>
