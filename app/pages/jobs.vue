<script setup lang="ts">
import type { CvDocumentSummary } from "@ruxt/shared/cv";
import { localCvStore } from "~/utils/localCvStore";
import { readLocalProfiles, profileLabel, type LocalProfile } from "~/utils/localProfiles";
import {
    buildCandidateSnapshot, emptyJobPreferences, normalizeJobPreferences, JOB_PREFERENCES_KEY, JOB_SNAPSHOT_SELECTION_KEY,
    STANDING_ANSWER_KEYS, type JobPreferences,
} from "~/utils/jobSnapshot";
import { cvLabel, sendResultMessage, splitReason } from "~/utils/jobsView";
import { onLocalChange } from "~/utils/cloudSync/localChanges";
import { STATE_LABELS, type Application, type Job, type JobEvent, type JobSource, type PlatformAccount } from "~/composables/useJobAutomation";

definePageMeta({ layout: false, path: "/jobs/:section?/:id?", editorContext: "jobs" });
useSeoMeta({ title: "Job automation" });

const SECTIONS = [
    { id: "overview", label: "Overview" },
    { id: "sources", label: "Job sources" },
    { id: "accounts", label: "Platform accounts" },
    { id: "discovery", label: "Discovery" },
    { id: "matching", label: "Matching" },
    { id: "cvs", label: "CV workspace" },
    { id: "queue", label: "Application queue" },
    { id: "applications", label: "Applications" },
    { id: "history", label: "Execution history" },
    { id: "analytics", label: "Analytics" },
    { id: "settings", label: "Settings" },
] as const;

const route = useRoute();
const section = computed(() => (SECTIONS.some(s => s.id === route.params.section) ? route.params.section : "overview") as string);
const detailId = computed(() => (typeof route.params.id === "string" && route.params.id) || null);
const { call, subscribe } = useJobAutomation();
const toast = useToast();
const runtime = useRuntimeConfig();

const unavailable = ref<string | null>(null);
const loading = ref(false);
const overview = ref<any>(null);
const sources = ref<JobSource[]>([]);
const accounts = ref<PlatformAccount[]>([]);
const jobs = ref<Job[]>([]);
const applications = ref<Application[]>([]);
const events = ref<JobEvent[]>([]);
const analytics = ref<any>(null);
const candidate = ref<any>(null);
const messages = ref<any[]>([]);
const jobQuery = ref("");

const fail = (error: any) => {
    const status = error?.statusCode ?? error?.response?.status;
    if (status === 503 || status === 404) unavailable.value = error?.data?.statusMessage ?? error?.statusMessage ?? "Job automation is not configured for this account.";
    else toast.push(error?.data?.error ?? error?.message ?? "Request failed", { tone: "error" });
};

async function load() {
    loading.value = true;
    try {
        const s = section.value;
        if (s === "overview") overview.value = await call("overview");
        if (s === "sources" || s === "discovery") sources.value = (await call<{ sources: JobSource[] }>("sources")).sources;
        if (s === "accounts") {
            accounts.value = (await call<{ accounts: PlatformAccount[] }>("accounts")).accounts;
            sources.value = (await call<{ sources: JobSource[] }>("sources")).sources;
        }
        if (s === "discovery") {
            jobs.value = (await call<{ jobs: Job[] }>("jobs", { query: { q: jobQuery.value || undefined } })).jobs;
            messages.value = (await call<{ messages: any[] }>("intake/messages")).messages;
        }
        if (["matching", "queue", "applications"].includes(s)) applications.value = (await call<{ applications: Application[] }>("applications")).applications;
        if (s === "history") events.value = (await call<{ events: JobEvent[] }>("events", { query: { after: 0, limit: 1000 } })).events.reverse();
        if (s === "analytics") analytics.value = await call("analytics");
        if (s === "cvs") candidate.value = (await call<{ snapshot: any }>("candidate")).snapshot;
        unavailable.value = null;
    } catch (error) {
        fail(error);
    } finally {
        loading.value = false;
    }
}
watch(section, load);

// Live progress: refresh the visible section when workflow events arrive (debounced).
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let unsubscribe = () => {};
let stopCloudWrites = () => {};
onMounted(() => {
    load();
    readLocal();
    // Preferences brought by cloud sync replace the form only while it holds no unsaved edits.
    stopCloudWrites = onLocalChange((change) => {
        if (change.kind !== "jobPreferences" || change.origin !== "cloud") return;
        if (formPreferencesJson() === loadedPreferencesJson) readLocal();
    });
    unsubscribe = subscribe((event) => {
        if (section.value === "history") events.value = [event, ...events.value].slice(0, 1000);
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => { if (section.value !== "history" && !detailId.value) load(); }, 800);
    });
});
onBeforeUnmount(() => { unsubscribe(); stopCloudWrites(); clearTimeout(refreshTimer); });

// ---------------------------------------------------------------- queue groupings
const byState = (states: string[]) => applications.value.filter(a => states.includes(a.state));
const queueGroups = computed(() => [
    { label: "Needs you", hint: "Missing information, blocked policy checks, or outcomes to confirm.", items: byState(["BLOCKED_EXCEPTION", "SUBMISSION_UNKNOWN"]) },
    { label: "Ready for you to apply", hint: "Prepared for platforms that do not allow automated submission. A confirmation email marks them submitted.", items: byState(["HANDOFF_PENDING"]) },
    { label: "In progress", hint: "Being matched, prepared, submitted or verified.", items: byState(["MATCHING", "MATCHED", "SELECTED", "PREPARING", "PREPARED", "POLICY_CHECK", "EXECUTING", "VERIFYING", "FAILED_RETRYABLE"]) },
]);
const matched = computed(() => [...applications.value].filter(a => a.match).sort((a, b) => (b.match!.match_score - a.match!.match_score)));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : "—");
const capability = (src: JobSource, cap: string) => {
    const grants = src.policy.capabilities.filter(g => g.capability === cap);
    const ok = grants.find(g => g.permitted);
    return ok ? ok.method.replace("_", " ") : grants.length ? "not permitted" : "—";
};

// ---------------------------------------------------------------- actions
async function toggleSource(src: JobSource) {
    try { await call(`sources/${encodeURIComponent(src.id)}`, { method: "PATCH", body: { enabled: !src.enabled } }); await load(); } catch (e) { fail(e); }
}
async function discover(src: JobSource) {
    try {
        await call(`sources/${encodeURIComponent(src.id)}/discover`, { method: "POST" });
        toast.push(`${src.name}: discovery started; new jobs appear here as they arrive.`, { tone: "success" });
    } catch (e) { fail(e); }
}
const atsForm = reactive({ kind: "greenhouse", token: "", company: "", location_filter: "" });
async function addATS() {
    try { await call("sources/ats", { method: "POST", body: { ...atsForm } }); atsForm.token = ""; atsForm.company = ""; atsForm.location_filter = ""; await load(); } catch (e) { fail(e); }
}
const credential = reactive<Record<string, string>>({});
async function saveCredential(sourceId: string) {
    try {
        await call(`accounts/${encodeURIComponent(sourceId)}/credential`, { method: "PUT", body: { credential: credential[sourceId] } });
        credential[sourceId] = "";
        toast.push("Credential stored (encrypted; it will not be shown again).", { tone: "success" });
        await load();
    } catch (e) { fail(e); }
}
const manual = reactive({ source: "linkedin", url: "", company: "", title: "", location: "", description: "" });
async function addManual() {
    try {
        await call("jobs/manual", { method: "POST", body: { ...manual } });
        Object.assign(manual, { url: "", company: "", title: "", location: "", description: "" });
        toast.push("Job added.", { tone: "success" });
        await load();
    } catch (e) { fail(e); }
}
const emailRaw = ref("");
async function intakeEmail(file?: File) {
    try {
        const body = file ? await file.text() : emailRaw.value;
        const r = await call<any>("intake/emails", { method: "POST", body, headers: { "content-type": "message/rfc822" } });
        toast.push(r.duplicate ? "Email already processed." : `Email: ${r.classification}${r.verified ? " (application verified)" : ""}`, { tone: "success" });
        emailRaw.value = "";
        await load();
    } catch (e) { fail(e); }
}

// ---------------------------------------------------------------- CV workspace (local Ruxt data)
const localProfiles = ref<LocalProfile[]>([]);
const localCvs = ref<CvDocumentSummary[]>([]);
const cvTitles = computed(() => Object.fromEntries(localCvs.value.map(c => [c.id, c.title])));
/** Preferences were saved here but not yet sent to job automation (they only take effect on the next send). */
const prefsUnsent = ref(false);
const selection = reactive<{ profileId: string; cvIds: string[] }>({ profileId: "", cvIds: [] });
const preferences = ref<JobPreferences>(emptyJobPreferences());
const prefsText = reactive({ locations: "", target_roles: "", excluded_keywords: "" });
/** The preferences as stored when last read or saved, to tell whether the form holds unsaved edits. */
let loadedPreferencesJson = "";
const formPreferencesJson = () => JSON.stringify(normalizeJobPreferences({
    ...preferences.value, locations: splitList(prefsText.locations), target_roles: splitList(prefsText.target_roles), excluded_keywords: splitList(prefsText.excluded_keywords),
}));
function readLocal() {
    localProfiles.value = readLocalProfiles();
    localCvs.value = localCvStore.list();
    try {
        const saved = JSON.parse(localStorage.getItem(JOB_SNAPSHOT_SELECTION_KEY) || "{}");
        selection.profileId = typeof saved.profileId === "string" ? saved.profileId : localProfiles.value[0]?.id ?? "";
        selection.cvIds = Array.isArray(saved.cvIds) ? saved.cvIds.filter((id: unknown) => typeof id === "string") : [];
        preferences.value = normalizeJobPreferences(JSON.parse(localStorage.getItem(JOB_PREFERENCES_KEY) || "{}"));
    } catch { preferences.value = emptyJobPreferences(); }
    prefsText.locations = preferences.value.locations.join(", ");
    prefsText.target_roles = preferences.value.target_roles.join(", ");
    prefsText.excluded_keywords = preferences.value.excluded_keywords.join(", ");
    loadedPreferencesJson = formPreferencesJson();
}
const splitList = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);
function savePreferences() {
    preferences.value = normalizeJobPreferences({ ...preferences.value, locations: splitList(prefsText.locations), target_roles: splitList(prefsText.target_roles), excluded_keywords: splitList(prefsText.excluded_keywords) });
    // `savedAt` records when this device last wrote them (cloud sync uses it); the Jobs page ignores it.
    try { localStorage.setItem(JOB_PREFERENCES_KEY, JSON.stringify({ ...preferences.value, savedAt: Date.now() })); loadedPreferencesJson = formPreferencesJson(); prefsUnsent.value = true; toast.push("Preferences saved in this browser.", { tone: "success" }); } catch { toast.push("This browser refused to save preferences.", { tone: "error" }); }
}
const toggleMode = (mode: "onsite" | "hybrid" | "remote") => {
    const modes = new Set(preferences.value.work_modes);
    if (modes.has(mode)) modes.delete(mode); else modes.add(mode);
    preferences.value.work_modes = [...modes];
};
const sending = ref(false);
async function sendSnapshot() {
    const profile = localProfiles.value.find(p => p.id === selection.profileId);
    if (!profile) { toast.push("Choose a profile.", { tone: "error" }); return; }
    const cvs = selection.cvIds.map(id => localCvStore.get(id)).filter((cv): cv is NonNullable<typeof cv> => Boolean(cv));
    sending.value = true;
    try {
        const { id, createdAt: _c, updatedAt, label: _l, ...data } = profile as LocalProfile & Record<string, unknown>;
        const snapshot = buildCandidateSnapshot({ profileId: id, profileLabel: profileLabel(profile), profileUpdatedAt: updatedAt, profile: data as any, cvs, preferences: preferences.value, appVersion: String(runtime.public.appVersion ?? "") });
        try { localStorage.setItem(JOB_SNAPSHOT_SELECTION_KEY, JSON.stringify(selection)); } catch { /* selection memory is a convenience */ }
        const r = await call<any>("candidate/snapshots", { method: "POST", body: snapshot });
        prefsUnsent.value = false;
        toast.push(sendResultMessage(r, cvs.length), { tone: "success" });
        await load();
    } catch (e: any) {
        if (e instanceof Error && !("statusCode" in e)) toast.push(e.message, { tone: "error" }); else fail(e);
    } finally { sending.value = false; }
}
const toggleCv = (id: string) => { selection.cvIds = selection.cvIds.includes(id) ? selection.cvIds.filter(x => x !== id) : [...selection.cvIds, id]; };
</script>

<template>
    <NuxtLayout name="editor" title="Job automation" app-label="JOBS">
        <template #sidebar>
            <nav class="jobs-nav" aria-label="Job automation sections">
                <header class="jobs-nav__header"><span>Job automation</span></header>
                <NuxtLink v-for="s in SECTIONS" :key="s.id" class="jobs-nav__link" :class="{ active: section === s.id }" :to="`/jobs/${s.id}`" :aria-current="section === s.id ? 'page' : undefined">{{ s.label }}</NuxtLink>
            </nav>
        </template>

        <template #workspace>
            <main class="jobs-page" :aria-busy="loading">
                <div v-if="unavailable" class="jobs-empty" role="status"><h2>Job automation is unavailable</h2><p>{{ unavailable }}</p></div>

                <JobsApplicationDetail v-else-if="detailId && section === 'applications'" :id="detailId" @changed="load" />

                <!-- Overview -->
                <section v-else-if="section === 'overview' && overview" class="jobs-section">
                    <h1>Overview</h1>
                    <div class="jobs-stats">
                        <div><strong>{{ overview.jobs.discovered }}</strong><span>Discovered jobs</span></div>
                        <div><strong>{{ overview.jobs.new_24h }}</strong><span>New (24h)</span></div>
                        <div><strong>{{ overview.jobs.matched }}</strong><span>Matched</span></div>
                        <div><strong>{{ overview.applications.selected }}</strong><span>Selected</span></div>
                        <div><strong>{{ overview.applications.prepared }}</strong><span>Prepared</span></div>
                        <div><strong>{{ overview.applications.submitted }}</strong><span>Submitted</span></div>
                        <div><strong>{{ overview.applications.failed }}</strong><span>Failed</span></div>
                        <div :class="{ warn: overview.applications.exceptions }"><strong>{{ overview.applications.exceptions }}</strong><span>Pending exceptions</span></div>
                    </div>
                    <h2>Source health</h2>
                    <table class="jobs-table"><thead><tr><th>Source</th><th>Health</th><th>Last success</th><th>Error</th></tr></thead>
                        <tbody><tr v-for="s in overview.sources" :key="s.id"><td>{{ s.name }}</td><td><span class="pill" :data-tone="s.health">{{ s.health }}</span></td><td>{{ when(s.last_success_at) }}</td><td class="muted">{{ s.last_error || "" }}</td></tr></tbody>
                    </table>
                    <h2>Accounts</h2>
                    <p v-if="!overview.accounts?.length" class="muted">No platform accounts connected. Platforms without an authorized API need none: you apply there yourself and confirmation emails verify it.</p>
                    <ul v-else><li v-for="a in overview.accounts" :key="a.id">{{ a.source_id }}: {{ a.status }}</li></ul>
                </section>

                <!-- Sources -->
                <section v-else-if="section === 'sources'" class="jobs-section">
                    <h1>Job sources</h1>
                    <p class="muted">Discovery and submission are separate capabilities, each with its legal basis. Policy changes are code-reviewed; here you can only enable or disable a source.</p>
                    <table class="jobs-table"><thead><tr><th>Platform</th><th>Discovery</th><th>Application</th><th>Tracking</th><th>Terms</th><th>Rate limit</th><th>Health</th><th></th></tr></thead>
                        <tbody>
                            <tr v-for="s in sources" :key="s.id">
                                <td><strong>{{ s.name }}</strong><small v-if="s.policy.notes" class="muted block">{{ s.policy.notes }}</small></td>
                                <td>{{ capability(s, "discoverJobs") }}</td>
                                <td>{{ capability(s, "submitApplication") }}</td>
                                <td>{{ capability(s, "trackApplication") }}</td>
                                <td><a :href="s.policy.terms_url" target="_blank" rel="noopener noreferrer">{{ s.policy.terms_verified ? "verified" : "unverified" }}</a></td>
                                <td>{{ s.policy.rate_limit_per_minute ? `${s.policy.rate_limit_per_minute}/min` : "—" }}</td>
                                <td><span class="pill" :data-tone="s.health">{{ s.health }}</span><small v-if="s.last_error" class="block danger">{{ s.last_error }}</small></td>
                                <td><button type="button" @click="toggleSource(s)">{{ s.enabled ? "Disable" : "Enable" }}</button></td>
                            </tr>
                        </tbody>
                    </table>
                    <h2>Add an employer ATS board</h2>
                    <form class="jobs-form" @submit.prevent="addATS">
                        <select v-model="atsForm.kind" aria-label="ATS"><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option></select>
                        <input v-model="atsForm.token" required placeholder="Board token / site name" aria-label="Board token">
                        <input v-model="atsForm.company" required placeholder="Company" aria-label="Company">
                        <input v-model="atsForm.location_filter" placeholder="Locations to keep (regex, e.g. Vietnam|Singapore)" aria-label="Location filter">
                        <button type="submit">Add</button>
                    </form>
                </section>

                <!-- Accounts -->
                <section v-else-if="section === 'accounts'" class="jobs-section">
                    <h1>Platform accounts</h1>
                    <p class="muted">One account per platform. Credentials are write-only and encrypted at rest; this screen never shows them. Platforms whose terms do not permit automation take no credentials at all.</p>
                    <table class="jobs-table"><thead><tr><th>Platform</th><th>Account</th><th>Connection</th><th>Session</th><th>Last authentication</th><th>Credential</th></tr></thead>
                        <tbody>
                            <tr v-for="s in sources" :key="s.id">
                                <td>{{ s.name }}</td>
                                <td>{{ accounts.find(a => a.source_id === s.id)?.label || "—" }}</td>
                                <td>{{ accounts.find(a => a.source_id === s.id)?.status || "not connected" }}</td>
                                <td>{{ accounts.find(a => a.source_id === s.id)?.session?.status || "—" }}<small v-if="accounts.find(a => a.source_id === s.id)?.status === 'reauth_required'" class="block warn">Re-authentication required</small></td>
                                <td>{{ when(accounts.find(a => a.source_id === s.id)?.last_auth_at) }}</td>
                                <td>
                                    <form v-if="capability(s, 'submitApplication') === 'authorized api'" class="jobs-form inline" @submit.prevent="saveCredential(s.id)">
                                        <input v-model="credential[s.id]" type="password" autocomplete="off" required placeholder="API key" :aria-label="`API key for ${s.name}`"><button type="submit">Save</button>
                                    </form>
                                    <span v-else class="muted">not used</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </section>

                <!-- Discovery -->
                <section v-else-if="section === 'discovery'" class="jobs-section">
                    <h1>Discovery</h1>
                    <div class="jobs-actions"><button v-for="s in sources.filter(x => x.enabled && capability(x, 'discoverJobs') === 'public api')" :key="s.id" type="button" @click="discover(s)">Discover {{ s.name }}</button></div>
                    <h2>Add a job you found</h2>
                    <form class="jobs-form grid" @submit.prevent="addManual">
                        <select v-model="manual.source" aria-label="Platform"><option value="linkedin">LinkedIn</option><option value="itviec">ITviec</option><option value="careerviet">CareerViet</option><option value="vietnamworks">VietnamWorks</option><option value="manual">Other</option></select>
                        <input v-model="manual.url" placeholder="Job URL" aria-label="Job URL">
                        <input v-model="manual.company" required placeholder="Company" aria-label="Company">
                        <input v-model="manual.title" required placeholder="Title" aria-label="Title">
                        <input v-model="manual.location" placeholder="Location" aria-label="Location">
                        <textarea v-model="manual.description" rows="4" placeholder="Paste the job description (optional; improves matching)" aria-label="Description" />
                        <button type="submit">Add job</button>
                    </form>
                    <h2>Job-alert and confirmation emails</h2>
                    <p class="muted">LinkedIn and ITviec alerts add jobs; their "application sent" emails verify submissions. Upload .eml files exported from your mail client, or paste the raw message.</p>
                    <div class="jobs-form"><input type="file" accept=".eml,message/rfc822" aria-label="Email file" @change="(e: any) => e.target.files?.[0] && intakeEmail(e.target.files[0])"></div>
                    <form class="jobs-form grid" @submit.prevent="intakeEmail()"><textarea v-model="emailRaw" rows="3" placeholder="Raw email (with headers)" aria-label="Raw email" /><button type="submit" :disabled="!emailRaw">Process email</button></form>
                    <h2>Jobs</h2>
                    <form class="jobs-form" @submit.prevent="load"><input v-model="jobQuery" placeholder="Search title or company" aria-label="Search jobs"><button type="submit">Search</button></form>
                    <table class="jobs-table"><thead><tr><th>Title</th><th>Company</th><th>Source</th><th>Location</th><th>Skills</th><th>Data</th><th>Last seen</th></tr></thead>
                        <tbody><tr v-for="j in jobs" :key="j.job_id"><td><a v-if="j.application_url" :href="j.application_url" target="_blank" rel="noopener noreferrer">{{ j.title }}</a><span v-else>{{ j.title }}</span></td><td>{{ j.company }}</td><td>{{ j.source_id }}</td><td>{{ j.location }} <small class="muted">{{ j.work_mode }}</small></td><td>{{ j.required_skills.join(", ") }}</td><td>{{ j.completeness }}</td><td>{{ when(j.last_seen_at) }}</td></tr></tbody>
                    </table>
                    <h2>Processed emails</h2>
                    <ul class="jobs-list"><li v-for="m in messages.slice(0, 30)" :key="m.message_id"><span class="pill">{{ m.classification }}</span> {{ m.subject }} <small class="muted">{{ when(m.received_at) }}</small></li></ul>
                </section>

                <!-- Matching -->
                <section v-else-if="section === 'matching'" class="jobs-section">
                    <h1>Matching</h1>
                    <p class="muted">Scores count only dimensions with known data; partial jobs (email alerts) lower confidence instead of guessing.</p>
                    <table class="jobs-table"><thead><tr><th>Job</th><th>Score</th><th>Eligibility</th><th>Confidence</th><th>Skills</th><th>Experience</th><th>Location / mode</th><th>Salary</th><th>Missing</th><th>Uncertain</th></tr></thead>
                        <tbody><tr v-for="a in matched" :key="a.id">
                            <td><NuxtLink :to="`/jobs/applications/${a.id}`">{{ a.job.title }}</NuxtLink><small class="block muted">{{ a.job.company }}</small></td>
                            <td><strong>{{ pct(a.match!.match_score) }}</strong><small class="block muted">{{ a.match!.recommendation }}</small></td>
                            <td><span class="pill" :data-tone="a.match!.eligibility">{{ a.match!.eligibility }}</span></td>
                            <td>{{ pct(a.match!.confidence) }}</td>
                            <td>{{ a.match!.dimensions.required_skills?.status }} <small class="muted">{{ a.match!.dimensions.required_skills?.note }}</small></td>
                            <td>{{ a.match!.dimensions.experience?.status }}</td>
                            <td>{{ a.match!.dimensions.location?.status }} / {{ a.match!.dimensions.work_mode?.status }}</td>
                            <td>{{ a.match!.dimensions.compensation?.status }}</td>
                            <td>{{ a.match!.missing_requirements.map(r => r.requirement).join(", ") }}</td>
                            <td>{{ a.match!.uncertain_requirements.map(r => r.requirement).join(", ") }}</td>
                        </tr></tbody>
                    </table>
                </section>

                <!-- CV workspace -->
                <section v-else-if="section === 'cvs'" class="jobs-section">
                    <h1>CV workspace</h1>
                    <p class="muted">Your profiles and CVs stay in this browser. Choose which ones job automation may use; only those are sent, as a read-only copy that records each CV's revision. Send again after editing a CV.</p>
                    <h2>Profile</h2>
                    <select v-model="selection.profileId" aria-label="Profile"><option v-for="p in localProfiles" :key="p.id" :value="p.id">{{ profileLabel(p) }}</option></select>
                    <p v-if="!localProfiles.length" class="muted">No local profiles. Create one in the Profile editor first.</p>
                    <h2>CVs</h2>
                    <ul class="jobs-list">
                        <li v-for="cv in localCvs" :key="cv.id"><label class="jobs-check"><input type="checkbox" :checked="selection.cvIds.includes(cv.id)" @change="toggleCv(cv.id)"><span>{{ cv.title || "Untitled CV" }} <small class="muted">rev {{ cv.revision }} · {{ when(cv.updatedAt) }}</small></span></label></li>
                    </ul>
                    <button type="button" class="primary" :disabled="sending || !selection.cvIds.length || !selection.profileId" @click="sendSnapshot">Send selected to job automation</button>
                    <h2>Last sent</h2>
                    <p v-if="!candidate" class="muted">Nothing sent yet.</p>
                    <ul v-else class="jobs-list"><li>Received {{ when(candidate.received_at) }}</li><li v-for="cv in candidate.cvs" :key="cv.cv_id">{{ cvLabel(cv.cv_id, cv.revision, cvTitles) }}</li></ul>
                    <p class="muted">Generated CVs and cover letters are listed on each application, where you can open them in the CV editor as new CVs. Originals are never changed.</p>
                </section>

                <!-- Queue -->
                <section v-else-if="section === 'queue'" class="jobs-section">
                    <h1>Application queue</h1>
                    <div v-for="g in queueGroups" :key="g.label" class="jobs-group">
                        <h2>{{ g.label }} <small class="muted">({{ g.items.length }})</small></h2><p class="muted">{{ g.hint }}</p>
                        <ul class="jobs-list"><li v-for="a in g.items" :key="a.id"><NuxtLink :to="`/jobs/applications/${a.id}`">{{ a.job.title }} — {{ a.job.company }}</NuxtLink> <span class="pill" :data-state="a.state">{{ STATE_LABELS[a.state] || a.state }}</span><div v-if="a.exception_reason" class="warn"><small class="block">{{ splitReason(a.exception_reason).lead }}</small><ul v-if="splitReason(a.exception_reason).items.length" class="jobs-reasons"><li v-for="q in splitReason(a.exception_reason).items" :key="q"><small>{{ q }}</small></li></ul></div></li></ul>
                    </div>
                </section>

                <!-- Applications -->
                <section v-else-if="section === 'applications'" class="jobs-section">
                    <h1>Applications</h1>
                    <table class="jobs-table"><thead><tr><th>Company</th><th>Job title</th><th>Source</th><th>CV</th><th>Status</th><th>Submitted</th><th>Outcome</th></tr></thead>
                        <tbody><tr v-for="a in applications" :key="a.id">
                            <td>{{ a.job.company }}</td><td><NuxtLink :to="`/jobs/applications/${a.id}`">{{ a.job.title }}</NuxtLink></td><td>{{ a.job.source_id }}</td>
                            <td>{{ cvLabel(a.selected_cv_id, a.selected_cv_revision, cvTitles) }}</td>
                            <td><span class="pill" :data-state="a.state">{{ STATE_LABELS[a.state] || a.state }}</span></td><td>{{ when(a.submitted_at) }}</td><td>{{ a.outcome || "" }}</td>
                        </tr></tbody>
                    </table>
                </section>

                <!-- History -->
                <section v-else-if="section === 'history'" class="jobs-section">
                    <h1>Execution history</h1>
                    <ol class="jobs-timeline"><li v-for="e in events" :key="e.seq"><time>{{ when(e.created_at) }}</time> <strong>{{ e.kind }}</strong> <span v-if="e.to_state">{{ e.from_state }} → {{ e.to_state }}</span> <NuxtLink v-if="e.application_id" :to="`/jobs/applications/${e.application_id}`">application</NuxtLink><small class="block muted">{{ JSON.stringify(e.detail) }}</small></li></ol>
                </section>

                <!-- Analytics -->
                <section v-else-if="section === 'analytics' && analytics" class="jobs-section">
                    <h1>Analytics</h1>
                    <p>Average match score: <strong>{{ pct(analytics.average_match_score) }}</strong></p>
                    <table class="jobs-table"><thead><tr><th>Source</th><th>Jobs</th><th>Matched</th><th>Submitted</th><th>Waiting for you to apply</th><th>Blocked</th></tr></thead>
                        <tbody><tr v-for="r in analytics.by_source" :key="r.source"><td>{{ r.source }}</td><td>{{ r.jobs }}</td><td>{{ r.matched }}</td><td>{{ r.submitted }}</td><td>{{ r.handoff_pending }}</td><td>{{ r.blocked }}</td></tr></tbody>
                    </table>
                </section>

                <!-- Settings -->
                <section v-else-if="section === 'settings'" class="jobs-section">
                    <h1>Settings</h1>
                    <p class="muted">Job preferences and standing answers are yours: stored in this browser and sent with your next CV send. The system answers application questions only from these and your CV; anything else becomes a question for you.</p>
                    <form class="jobs-form grid" @submit.prevent="savePreferences">
                        <label>Preferred locations <input v-model="prefsText.locations" placeholder="Ho Chi Minh City, Remote"></label>
                        <fieldset><legend>Work modes</legend><label v-for="m in (['onsite', 'hybrid', 'remote'] as const)" :key="m"><input type="checkbox" :checked="preferences.work_modes.includes(m)" @change="toggleMode(m)"> {{ m }}</label></fieldset>
                        <label>Target roles <input v-model="prefsText.target_roles" placeholder="Backend Engineer, Platform Engineer"></label>
                        <label>Exclude titles containing <input v-model="prefsText.excluded_keywords" placeholder="QA, Intern"></label>
                        <label>Minimum salary <input v-model.number="preferences.salary_min" type="number" min="0"></label>
                        <label>Currency <input v-model="preferences.salary_currency" placeholder="USD"></label>
                        <h2>Standing answers</h2>
                        <label v-for="k in STANDING_ANSWER_KEYS" :key="k.key">{{ k.label }} <input v-model="preferences.answers[k.key]" :placeholder="k.key === 'work_authorization' ? 'Leave empty to be asked each time' : ''"></label>
                        <button type="submit" class="primary">Save preferences</button>
                        <p v-if="prefsUnsent" class="callout warn" role="status">Saved in this browser. Your applications keep using the data you last sent until you <NuxtLink to="/jobs/cvs">send your CV again</NuxtLink>.</p>
                    </form>
                </section>
            </main>
        </template>
    </NuxtLayout>
</template>

<style scoped>
.jobs-nav { box-sizing: border-box; display: grid; align-content: start; gap: 2px; height: 100%; padding: 16px 12px; overflow: auto; background: var(--bg-mantle); font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
.jobs-nav__header { margin: 0 4px 12px; color: var(--fg-subtext1); font-weight: 600; }
.jobs-nav__link { padding: 8px; border-radius: 4px; color: var(--fg-text); text-decoration: none; }
.jobs-nav__link:hover { background: var(--bg-surface0); }
.jobs-nav__link.active { background: var(--bg-base); box-shadow: inset 3px 0 0 var(--accent); }
.jobs-page { height: 100%; overflow: auto; padding: 24px 32px; background: var(--bg-base); color: var(--fg-text); font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
.jobs-section { max-width: 1200px; }
.jobs-page h1 { margin: 0 0 12px; font-size: 18px; }
.jobs-page h2 { margin: 24px 0 8px; font-size: 14px; color: var(--fg-subtext1); }
.muted { color: var(--fg-subtext0); }
.block { display: block; }
.warn { color: var(--warning); }
.danger { color: var(--danger); }
.jobs-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.jobs-stats > div { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--border); border-radius: 4px; }
.jobs-stats > div.warn { border-color: var(--warning); }
.jobs-stats strong { font-size: 20px; }
.jobs-table { width: 100%; border-collapse: collapse; }
.jobs-table th, .jobs-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
.jobs-table th { color: var(--fg-subtext1); font-weight: 600; }
.jobs-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.jobs-timeline { display: grid; gap: 8px; padding-left: 18px; }
.jobs-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
.jobs-form.grid { display: grid; max-width: 640px; }
.jobs-form.inline { margin: 0; }
.jobs-page input, .jobs-page select, .jobs-page textarea { min-height: 32px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 3px; background: var(--bg-mantle); color: var(--fg-text); font: inherit; }
.jobs-page input[type="checkbox"] { min-height: 0; width: 16px; height: 16px; padding: 0; accent-color: var(--accent); }
.jobs-check { display: flex; align-items: flex-start; gap: 8px; }
.jobs-check input { margin-top: 2px; flex: none; }
.jobs-reasons { margin: 4px 0 8px; padding-left: 18px; display: grid; gap: 2px; }
.jobs-page button { padding: 6px 10px; border: 1px solid var(--border); border-radius: 3px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.jobs-page button:hover { border-color: var(--accent); }
.jobs-page button.primary { border-color: var(--accent); background: var(--accent); color: var(--on-accent); }
.jobs-page button:disabled { opacity: .5; cursor: not-allowed; }
.jobs-page :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.jobs-page a { color: var(--accent); }
.jobs-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.pill { display: inline-block; padding: 1px 6px; border: 1px solid var(--border); border-radius: 999px; font-size: 11px; }
.pill[data-tone="ok"], .pill[data-tone="eligible"], .pill[data-state="SUBMITTED"] { border-color: var(--success); color: var(--success); }
.pill[data-tone="failing"], .pill[data-tone="ineligible"], .pill[data-state="FAILED_FINAL"] { border-color: var(--danger); color: var(--danger); }
.pill[data-state="BLOCKED_EXCEPTION"], .pill[data-state="SUBMISSION_UNKNOWN"], .pill[data-tone="uncertain"] { border-color: var(--warning); color: var(--warning); }
.pill[data-state="HANDOFF_PENDING"] { border-color: var(--info); color: var(--info); }
.jobs-empty { max-width: 560px; margin: 48px auto; text-align: center; }
fieldset { border: 1px solid var(--border); border-radius: 4px; }
label { display: grid; gap: 4px; }
fieldset label { display: inline-flex; gap: 4px; margin-right: 12px; }
</style>
