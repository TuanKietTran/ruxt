<script setup lang="ts">
import type { CvTemplate } from "@ruxt/shared/cv";
import type { CvImportJobResponse, CvImportPreviewResponse, CvPipelineCapabilitiesResponse } from "~/types/api";
import { reuseFor } from "~/utils/fetchCache";
import { localCvStore } from "~/utils/localCvStore";
import { saveLocalProfile } from "~/utils/localProfiles";

const emit = defineEmits<{ close: []; committed: [documentId: string] }>();
const { openAuthDialog } = useAuthDialog();
const route = useRoute();
const accountFetch = useAccountFetch();
const { user } = useAppAuth();
const CLIENT_MAX_BYTES = 5 * 1024 * 1024;
const accepted = new Map([
    ["pdf", "application/pdf"], ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"],
    ["webp", "image/webp"], ["tif", "image/tiff"], ["tiff", "image/tiff"], ["bmp", "image/bmp"],
]);
const terminal = new Set(["succeeded", "failed", "cancelled"]);
const input = ref<HTMLInputElement | null>(null);
const dialogElement = ref<HTMLElement | null>(null);
const initialControl = ref<HTMLButtonElement | null>(null);
useModalBehavior({ isOpen: () => true, onClose: () => emit("close"), container: () => dialogElement.value, initialFocus: () => initialControl.value });
const file = ref<File | null>(null);
const dragging = ref(false);
const busy = ref(false);
const error = ref("");
const authRequired = ref(false);
const capabilities = ref<CvPipelineCapabilitiesResponse | null>(null);
const templates = ref<CvTemplate[]>([]);
const templateKey = ref("");
const job = ref<CvImportJobResponse | null>(null);
const preview = ref<CvImportPreviewResponse | null>(null);
let pollTimer: ReturnType<typeof setTimeout> | undefined;
const maxBytes = computed(() => Math.min(CLIENT_MAX_BYTES, capabilities.value?.maxUploadBytes ?? CLIENT_MAX_BYTES));
const readableBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const message = (reason: any) => reason?.data?.statusMessage ?? reason?.data?.message ?? reason?.message ?? String(reason);
const captureError = (reason: any) => {
    error.value = message(reason);
    authRequired.value = reason?.statusCode === 401 || reason?.data?.statusCode === 401 || error.value === "Authentication required";
};
const signIn = () => openAuthDialog("login", route.fullPath);
// Capabilities and the public catalog change only with a deployment: reopening the dialog reuses them.
const { data: setup, error: setupError } = useAsyncData("cv-import-setup", async () => {
    const [caps, catalog] = await Promise.all([
        accountFetch<CvPipelineCapabilitiesResponse>("/api/cv-capabilities"),
        $fetch<{ templates: CvTemplate[] }>("/api/public/templates"),
    ]);
    return { capabilities: caps, templates: catalog.templates };
}, { server: false, getCachedData: reuseFor(10 * 60_000) });
watch(setup, (loaded) => {
    if (!loaded) return;
    if (!loaded.capabilities) return;
    capabilities.value = loaded.capabilities;
    templates.value = loaded.templates;
    const preferred = loaded.templates[0];
    if (preferred) templateKey.value = `${preferred.id}:${preferred.version}`;
    if (!loaded.capabilities.available) error.value = loaded.capabilities.degradedReason ?? "CV extraction is unavailable.";
}, { immediate: true });
watch(setupError, (reason) => { if (reason) captureError(reason); }, { immediate: true });

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
    if (!user.value || !job.value || terminal.has(job.value.state)) return;
    try {
        job.value = await accountFetch<CvImportJobResponse>(`/api/cv-imports/${encodeURIComponent(job.value.id)}`);
        if (job.value && !terminal.has(job.value.state)) pollTimer = setTimeout(poll, 900);
    } catch (reason) { captureError(reason); }
};

const triggerPipeline = async () => {
    if (!user.value || !file.value || !templateKey.value || busy.value) return;
    busy.value = true;
    error.value = "";
    try {
        const separator = templateKey.value.lastIndexOf(":");
        const body = new FormData();
        body.append("file", file.value, file.value.name);
        body.append("templateId", templateKey.value.slice(0, separator));
        body.append("templateVersion", templateKey.value.slice(separator + 1));
        job.value = await accountFetch<CvImportJobResponse>("/api/cv-imports", {
            method: "POST",
            body,
            headers: { "Idempotency-Key": `${file.value.name}:${file.value.size}:${file.value.lastModified}` },
        });
        pollTimer = setTimeout(poll, 500);
    } catch (reason) { captureError(reason); }
    finally { busy.value = false; }
};

const loadPreview = async () => {
    if (!job.value) return;
    busy.value = true;
    error.value = "";
    try { preview.value = await accountFetch<CvImportPreviewResponse>(`/api/cv-imports/${encodeURIComponent(job.value.id)}/preview`); }
    catch (reason) { captureError(reason); }
    finally { busy.value = false; }
};
const cancel = async () => {
    if (!job.value) return;
    try { job.value = await accountFetch<CvImportJobResponse>(`/api/cv-imports/${encodeURIComponent(job.value.id)}/cancel`, { method: "POST" }); }
    catch (reason) { captureError(reason); }
};
const retry = async () => {
    if (!job.value) return;
    try {
        job.value = await accountFetch<CvImportJobResponse>(`/api/cv-imports/${encodeURIComponent(job.value.id)}/retry`, { method: "POST" });
        preview.value = null;
        pollTimer = setTimeout(poll, 500);
    } catch (reason) { captureError(reason); }
};
const commit = async () => {
    if (!user.value || !job.value || !preview.value || busy.value) return;
    busy.value = true;
    error.value = "";
    const documentId = crypto.randomUUID();
    try {
        // Import artifacts are owner-scoped compute output; committing a CV is a browser-only write.
        const created = localCvStore.create({ id: documentId, markdown: preview.value.markdown, css: preview.value.css });
        if (!created) throw new Error("Browser storage refused the write.");
        saveLocalProfile(preview.value.concept.profile);
        // The layout re-reads the local session list when it handles `committed`.
        emit("committed", documentId);
    } catch (reason) { captureError(reason); }
    finally { busy.value = false; }
};

watch(user, (value) => { if (!value && pollTimer) clearTimeout(pollTimer); });
onBeforeUnmount(() => {
    if (pollTimer) clearTimeout(pollTimer);
});
</script>

<template>
    <div class="import-backdrop" @click.self="emit('close')">
        <section ref="dialogElement" class="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" aria-describedby="import-description" tabindex="-1">
            <header><div><h2 id="import-title">Import CV</h2><p id="import-description">Extract a structured profile, then build editable Markdown and CSS from the selected template.</p></div><button type="button" aria-label="Close import" @click="emit('close')">×</button></header>
            <div class="import-grid">
                <div>
                    <button ref="initialControl" class="drop-zone" :class="{ dragging }" type="button" @click="input?.click()" @dragenter.prevent="dragging = true" @dragover.prevent @dragleave.prevent="dragging = false" @drop.prevent="dragging = false; selectFile($event.dataTransfer?.files[0])">
                        <AppIcon name="lucide:file-text" :size="20" /><strong>{{ file ? file.name : "Drop a CV file here" }}</strong>
                        <span>{{ file ? readableBytes(file.size) : `PDF or image · maximum ${readableBytes(maxBytes)}` }}</span>
                        <small>Choose file</small>
                    </button>
                    <input ref="input" hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp" @change="selectFile(($event.target as HTMLInputElement).files?.[0])">
                    <label>Structure template<select v-model="templateKey" :disabled="Boolean(job)"><option v-for="template in templates" :key="`${template.id}:${template.version}`" :value="`${template.id}:${template.version}`">{{ template.name }} · v{{ template.version }}</option></select></label>
                    <button class="primary" type="button" :disabled="!file || !templateKey || busy || !capabilities?.available || Boolean(job)" @click="triggerPipeline">{{ busy ? "Uploading…" : "Start import" }}</button>
                </div>
                <aside>
                    <div v-if="!job" class="empty">Select a file to start the import.</div>
                    <template v-else>
                        <h3>{{ file?.name }}</h3>
                        <dl role="status" aria-live="polite"><div><dt>State</dt><dd>{{ job.state }}</dd></div><div><dt>Stage</dt><dd>{{ job.stage.replaceAll('_', ' ') }}</dd></div><div><dt>Progress</dt><dd>{{ job.progress }}%</dd></div><div><dt>Attempt</dt><dd>{{ job.attempt }}</dd></div></dl>
                        <div class="progress"><span :style="{ width: `${Math.max(2, job.progress)}%` }" /></div>
                        <div v-if="job.warnings.length" class="warning"><strong>Warnings</strong><p v-for="warning in job.warnings" :key="warning">{{ warning }}</p></div>
                        <div v-if="job.error" class="error"><strong>{{ job.error.code }}</strong><p>{{ job.error.message }}</p></div>
                        <template v-if="preview">
                            <h4>Extracted structure</h4>
                            <pre>{{ preview.markdown.slice(0, 5000) }}</pre>
                            <button class="primary" type="button" :disabled="busy" @click="commit">Create CV from import</button>
                        </template>
                        <button v-else-if="job.state === 'succeeded'" class="primary" type="button" :disabled="busy" @click="loadPreview">Preview structure</button>
                        <button v-if="!terminal.has(job.state)" class="secondary" type="button" @click="cancel">Cancel import</button>
                        <button v-if="job.state === 'failed' || job.state === 'cancelled'" class="secondary" type="button" @click="retry">Retry import</button>
                    </template>
                    <div v-if="error" class="error" role="alert">
                        <p>{{ error }}</p>
                        <button v-if="authRequired" class="secondary error-action" type="button" @click="signIn">Sign in to continue</button>
                    </div>
                </aside>
            </div>
        </section>
    </div>
</template>

<style scoped>
.import-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: rgb(0 0 0 / 72%); }
.import-dialog { width: min(920px, 100%); max-height: 88vh; overflow: hidden; border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--bg-mantle); color: var(--fg-text); box-shadow: 0 24px 64px rgb(0 0 0 / 40%); }
.import-dialog > header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 16px 20px; border-bottom: 1px solid var(--border); }
h2, h3, h4, p { margin: 0; }
h2 { font-size: 16px; line-height: 1.3; }
h3 { font-size: 14px; line-height: 1.4; overflow-wrap: anywhere; }
h4 { margin-top: 16px; font-size: 13px; line-height: 1.4; }
header p { margin-top: 4px; color: var(--fg-subtext0); font-size: 12px; line-height: 1.5; }
header button { display: grid; place-items: center; width: 32px; height: 32px; flex: none; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--fg-subtext0); font-size: 20px; line-height: 1; cursor: pointer; }
header button:hover { background: var(--bg-surface0); color: var(--fg-text); }
.import-grid { display: grid; grid-template-columns: minmax(260px, .8fr) minmax(0, 1.2fr); min-height: 432px; max-height: calc(88vh - 76px); }
.import-grid > div, aside { padding: 20px; overflow: auto; }
aside { border-left: 1px solid var(--border); background: var(--bg-base); }
.drop-zone { width: 100%; min-height: 192px; display: grid; place-content: center; justify-items: center; gap: 8px; padding: 20px; border: 1px dashed var(--border-strong); border-radius: var(--radius-sm); background: var(--bg-base); color: var(--fg-text); font: inherit; text-align: center; cursor: pointer; transition: border-color .15s ease, background-color .15s ease; }
.drop-zone:hover { border-color: var(--fg-subtext0); }
.drop-zone.dragging { border-color: var(--accent); background: var(--bg-surface0); }
.drop-zone .app-icon { color: var(--fg-subtext0); }
.drop-zone span, .drop-zone small { color: var(--fg-subtext0); font-size: 11px; line-height: 1.5; }
label { display: grid; gap: 8px; margin-top: 16px; color: var(--fg-subtext1); font-size: 12px; }
select { min-height: 36px; padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-base); color: var(--fg-text); font: inherit; }
select:hover { border-color: var(--border-strong); }
.primary, .secondary { width: 100%; min-height: 36px; margin-top: 12px; padding: 8px 12px; border: 1px solid var(--accent); border-radius: var(--radius-sm); background: var(--accent); color: var(--bg-crust); font: inherit; cursor: pointer; transition: background-color .15s ease, border-color .15s ease; }
.primary:hover { background: var(--accent-hover, var(--accent)); }
.secondary { border-color: var(--border-strong); background: transparent; color: var(--fg-subtext1); }
.secondary:hover { background: var(--bg-surface0); color: var(--fg-text); }
button:disabled { opacity: .5; cursor: not-allowed; }
.import-dialog :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.empty { display: grid; min-height: 320px; place-items: center; color: var(--fg-subtext0); font-size: 12px; text-align: center; }
dl { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 0; }
dl div { padding: 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
dt { color: var(--fg-subtext0); font-size: 11px; }
dd { margin: 4px 0 0; font-size: 12px; }
.progress { height: 4px; margin: 12px 0; border-radius: var(--radius-full); background: var(--bg-surface0); overflow: hidden; }
.progress span { display: block; height: 100%; background: var(--accent); transition: width .2s; }
pre { max-height: 260px; overflow: auto; margin-top: 12px; padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-crust); color: var(--fg-subtext1); font-size: 11px; line-height: 1.5; white-space: pre-wrap; }
.warning, .error { margin-top: 12px; padding: 12px; border: 1px solid var(--warning, #f9e2af); border-radius: var(--radius-sm); color: var(--warning, #f9e2af); font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
.error { border-color: var(--danger); color: var(--danger); }
.error p { margin: 0; }
.error-action { margin-top: 8px; }
@media (max-width: 720px) { .import-grid { grid-template-columns: 1fr; overflow: auto; } aside { border-left: 0; border-top: 1px solid var(--border); } }
</style>
