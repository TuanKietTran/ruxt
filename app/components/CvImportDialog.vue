<script setup lang="ts">
import type { CvImportJobProps, CvImportPreview, CvPipelineCapabilities, CvTemplate } from "@core/domain/cv";

const emit = defineEmits<{ close: []; committed: [documentId: string] }>();
const CLIENT_MAX_BYTES = 5 * 1024 * 1024;
const accepted = new Map([
    ["pdf", "application/pdf"], ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"],
    ["webp", "image/webp"], ["tif", "image/tiff"], ["tiff", "image/tiff"], ["bmp", "image/bmp"],
]);
const terminal = new Set(["succeeded", "failed", "cancelled"]);
const input = ref<HTMLInputElement | null>(null);
const file = ref<File | null>(null);
const dragging = ref(false);
const busy = ref(false);
const error = ref("");
const capabilities = ref<CvPipelineCapabilities | null>(null);
const templates = ref<CvTemplate[]>([]);
const templateKey = ref("");
const job = ref<CvImportJobProps | null>(null);
const preview = ref<CvImportPreview | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | undefined;
const maxBytes = computed(() => Math.min(CLIENT_MAX_BYTES, capabilities.value?.maxUploadBytes ?? CLIENT_MAX_BYTES));
const readableBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const message = (reason: any) => reason?.data?.statusMessage ?? reason?.data?.message ?? reason?.message ?? String(reason);
const loadSetup = async () => {
    try {
        const [caps, catalog] = await Promise.all([
            $fetch<CvPipelineCapabilities>("/api/cv-capabilities"),
            $fetch<{ templates: CvTemplate[] }>("/api/public/templates"),
        ]);
        capabilities.value = caps;
        templates.value = catalog.templates;
        const preferred = catalog.templates[0];
        if (preferred) templateKey.value = `${preferred.id}:${preferred.version}`;
        if (!caps.available) error.value = caps.degradedReason ?? "CV extraction is unavailable.";
    } catch (reason) { error.value = message(reason); }
};

const selectFile = (candidate?: File) => {
    if (!candidate) return;
    error.value = "";
    const extension = candidate.name.split(".").pop()?.toLowerCase() ?? "";
    const expectedType = accepted.get(extension);
    if (!expectedType || (candidate.type && candidate.type !== expectedType)) { error.value = "Use PDF, PNG, JPEG, WebP, TIFF, or BMP."; return; }
    if (!candidate.size) { error.value = "The selected file is empty."; return; }
    if (candidate.size > maxBytes.value) { error.value = `${candidate.name} exceeds the ${readableBytes(maxBytes.value)} limit.`; return; }
    file.value = candidate.type === expectedType ? candidate : new File([candidate], candidate.name, { type: expectedType, lastModified: candidate.lastModified });
    job.value = null;
    preview.value = null;
};

const poll = async () => {
    if (!job.value || terminal.has(job.value.state)) return;
    try {
        job.value = await $fetch<CvImportJobProps>(`/api/cv-imports/${encodeURIComponent(job.value.id)}`);
        if (!terminal.has(job.value.state)) pollTimer = setTimeout(poll, 900);
    } catch (reason) { error.value = message(reason); }
};

const triggerPipeline = async () => {
    if (!file.value || !templateKey.value || busy.value) return;
    busy.value = true;
    error.value = "";
    try {
        const separator = templateKey.value.lastIndexOf(":");
        const body = new FormData();
        body.append("file", file.value, file.value.name);
        body.append("templateId", templateKey.value.slice(0, separator));
        body.append("templateVersion", templateKey.value.slice(separator + 1));
        job.value = await $fetch<CvImportJobProps>("/api/cv-imports", {
            method: "POST",
            body,
            headers: { "Idempotency-Key": `${file.value.name}:${file.value.size}:${file.value.lastModified}` },
        });
        pollTimer = setTimeout(poll, 500);
    } catch (reason) { error.value = message(reason); }
    finally { busy.value = false; }
};

const loadPreview = async () => {
    if (!job.value) return;
    busy.value = true;
    error.value = "";
    try { preview.value = await $fetch<CvImportPreview>(`/api/cv-imports/${encodeURIComponent(job.value.id)}/preview`); }
    catch (reason) { error.value = message(reason); }
    finally { busy.value = false; }
};
const cancel = async () => {
    if (!job.value) return;
    try { job.value = await $fetch<CvImportJobProps>(`/api/cv-imports/${encodeURIComponent(job.value.id)}/cancel`, { method: "POST" }); }
    catch (reason) { error.value = message(reason); }
};
const retry = async () => {
    if (!job.value) return;
    try {
        job.value = await $fetch<CvImportJobProps>(`/api/cv-imports/${encodeURIComponent(job.value.id)}/retry`, { method: "POST" });
        preview.value = null;
        pollTimer = setTimeout(poll, 500);
    } catch (reason) { error.value = message(reason); }
};
const commit = async () => {
    if (!job.value || !preview.value || busy.value) return;
    busy.value = true;
    error.value = "";
    const documentId = crypto.randomUUID();
    try {
        await $fetch(`/api/cv-imports/${encodeURIComponent(job.value.id)}/commit`, { method: "POST", body: { documentId } });
        await refreshNuxtData("editor-document-list");
        emit("committed", documentId);
    } catch (reason) { error.value = message(reason); }
    finally { busy.value = false; }
};

onMounted(loadSetup);
onBeforeUnmount(() => { if (pollTimer) clearTimeout(pollTimer); });
</script>

<template>
    <div class="import-backdrop" @click.self="emit('close')">
        <section class="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" @keydown.esc="emit('close')">
            <header><div><h2 id="import-title">Import CV blob</h2><p>Extract a structured profile, then build editable Markdown and CSS from the selected template.</p></div><button type="button" aria-label="Close import" @click="emit('close')">×</button></header>
            <div class="import-grid">
                <div>
                    <button class="drop-zone" :class="{ dragging }" type="button" @click="input?.click()" @dragenter.prevent="dragging = true" @dragover.prevent @dragleave.prevent="dragging = false" @drop.prevent="dragging = false; selectFile($event.dataTransfer?.files[0])">
                        <strong>{{ file ? file.name : "Drop CV media here" }}</strong>
                        <span>{{ file ? readableBytes(file.size) : `PDF or image · maximum ${readableBytes(maxBytes)}` }}</span>
                        <small>Choose file</small>
                    </button>
                    <input ref="input" hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp" @change="selectFile(($event.target as HTMLInputElement).files?.[0])">
                    <label>Structure template<select v-model="templateKey" :disabled="Boolean(job)"><option v-for="template in templates" :key="`${template.id}:${template.version}`" :value="`${template.id}:${template.version}`">{{ template.name }} · v{{ template.version }}</option></select></label>
                    <button class="primary" type="button" :disabled="!file || !templateKey || busy || !capabilities?.available || Boolean(job)" @click="triggerPipeline">{{ busy ? "Uploading…" : "Import and run pipeline" }}</button>
                </div>
                <aside>
                    <div v-if="!job" class="empty">Select one blob to start the CV pipeline.</div>
                    <template v-else>
                        <h3>{{ file?.name }}</h3>
                        <dl><div><dt>State</dt><dd>{{ job.state }}</dd></div><div><dt>Stage</dt><dd>{{ job.stage.replaceAll('_', ' ') }}</dd></div><div><dt>Progress</dt><dd>{{ job.progress }}%</dd></div><div><dt>Attempt</dt><dd>{{ job.attempt }}</dd></div></dl>
                        <div class="progress"><span :style="{ width: `${Math.max(2, job.progress)}%` }" /></div>
                        <div v-if="job.warnings.length" class="warning"><strong>Warnings</strong><p v-for="warning in job.warnings" :key="warning">{{ warning }}</p></div>
                        <div v-if="job.error" class="error"><strong>{{ job.error.code }}</strong><p>{{ job.error.message }}</p></div>
                        <template v-if="preview">
                            <h4>Extracted template structure</h4>
                            <pre>{{ preview.markdown.slice(0, 5000) }}</pre>
                            <button class="primary" type="button" :disabled="busy" @click="commit">Create CV and imported profile</button>
                        </template>
                        <button v-else-if="job.state === 'succeeded'" class="primary" type="button" :disabled="busy" @click="loadPreview">Preview structure</button>
                        <button v-if="!terminal.has(job.state)" class="secondary" type="button" @click="cancel">Cancel pipeline</button>
                        <button v-if="job.state === 'failed' || job.state === 'cancelled'" class="secondary" type="button" @click="retry">Retry pipeline</button>
                    </template>
                    <div v-if="error" class="error" role="alert">{{ error }}</div>
                </aside>
            </div>
        </section>
    </div>
</template>

<style scoped>
.import-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgb(0 0 0 / 72%); }
.import-dialog { width: min(920px, 100%); max-height: 88vh; overflow: hidden; border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--bg-mantle); color: var(--fg-text); box-shadow: 0 22px 70px rgb(0 0 0 / 45%); }
.import-dialog > header { display: flex; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--border); }
h2, h3, h4, p { margin: 0; } h2 { font-size: 16px; } header p { margin-top: 5px; color: var(--fg-subtext0); font-size: 11px; }
header button { border: 0; background: transparent; color: var(--fg-subtext0); font-size: 20px; cursor: pointer; }
.import-grid { display: grid; grid-template-columns: minmax(260px, .8fr) minmax(0, 1.2fr); min-height: 430px; max-height: calc(88vh - 76px); }
.import-grid > div, aside { padding: 18px; overflow: auto; } aside { border-left: 1px solid var(--border); background: var(--bg-base); }
.drop-zone { width: 100%; min-height: 190px; display: grid; place-content: center; gap: 9px; border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); background: var(--bg-base); color: var(--fg-text); font: inherit; text-align: center; cursor: pointer; }
.drop-zone.dragging { border-color: var(--accent); background: var(--bg-surface0); } .drop-zone span, .drop-zone small { color: var(--fg-subtext0); font-size: 10px; }
label { display: grid; gap: 6px; margin-top: 16px; color: var(--fg-subtext0); font-size: 10px; } select { padding: 8px; border: 1px solid var(--border); background: var(--bg-base); color: var(--fg-text); font: inherit; }
.primary, .secondary { width: 100%; margin-top: 12px; padding: 9px; border: 1px solid var(--accent); border-radius: var(--radius-sm); background: var(--accent); color: var(--bg-crust); font: inherit; cursor: pointer; } .secondary { border-color: var(--border-strong); background: transparent; color: var(--fg-subtext1); } button:disabled { opacity: .5; cursor: not-allowed; }
.empty { display: grid; min-height: 320px; place-items: center; color: var(--fg-subtext0); font-size: 11px; } dl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } dl div { padding: 8px; border: 1px solid var(--border); } dt { color: var(--fg-subtext0); font-size: 9px; text-transform: uppercase; } dd { margin: 3px 0 0; font-size: 11px; }
.progress { height: 3px; margin: 12px 0; background: var(--bg-surface0); } .progress span { display: block; height: 100%; background: var(--accent); transition: width .2s; }
pre { max-height: 260px; overflow: auto; padding: 12px; border: 1px solid var(--border); background: var(--bg-crust); color: var(--fg-subtext1); font-size: 10px; white-space: pre-wrap; }
.warning, .error { margin-top: 12px; padding: 10px; border: 1px solid var(--warning, #f9e2af); color: var(--warning, #f9e2af); font-size: 10px; white-space: pre-wrap; } .error { border-color: var(--danger); color: var(--danger); }
@media (max-width: 720px) { .import-grid { grid-template-columns: 1fr; overflow: auto; } aside { border-left: 0; border-top: 1px solid var(--border); } }
</style>
