<script setup lang="ts">
import { localCvStore } from "~/utils/localCvStore";
import { STATE_LABELS } from "~/composables/useJobAutomation";

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ changed: [] }>();
const { call, subscribe } = useJobAutomation();
const toast = useToast();
const data = ref<any>(null);
const error = ref<string | null>(null);
const answerDraft = reactive<Record<string, string>>({});
const attest = reactive({ evidence: "", url: "" });
const outcome = ref("");

async function load() {
    try {
        data.value = await call(`applications/${encodeURIComponent(props.id)}`);
        error.value = null;
    } catch (e: any) {
        error.value = e?.data?.error ?? e?.message ?? "Could not load the application.";
    }
}
watch(() => props.id, load);
let stop = () => {};
onMounted(() => { load(); stop = subscribe(() => load(), props.id); });
onBeforeUnmount(() => stop());

const match = computed(() => data.value?.match ?? null);
const factsById = computed(() => Object.fromEntries((match.value?.facts ?? []).map((f: any) => [f.fact_id, f])));
const evidence = (refs: string[]) => refs.map(r => factsById.value[r]).filter(Boolean);
const latestDocs = computed(() => {
    const seen = new Set<string>();
    return (data.value?.documents ?? []).filter((d: any) => !seen.has(d.kind) && seen.add(d.kind));
});
const missingAnswers = computed(() => (data.value?.answers ?? []).filter((a: any) => a.status !== "answered"));
const state = computed(() => data.value?.application.state as string | undefined);
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : "—");
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);

async function act(action: string, body?: Record<string, unknown>) {
    try {
        await call(`applications/${encodeURIComponent(props.id)}/actions/${action}`, { method: "POST", body: body ?? {} });
        await load();
        emit("changed");
    } catch (e: any) {
        toast.push(e?.data?.error ?? e?.message ?? "Action failed", { tone: "error" });
    }
}

/** Ruxt's local-first "artifact registration": the generated document becomes a NEW local CV session
 *  (the original CV is untouched), and the core records that Ruxt accepted it. */
async function openAsCv(doc: any) {
    const id = `jobs-${doc.id}`;
    const title = `${data.value.job.company} — ${data.value.job.title} (${doc.kind === "cover_letter" ? "cover letter" : "tailored CV"})`;
    const source = doc.kind === "tailored_cv" ? localCvStore.get(doc.source_cv_id) : null;
    const created = localCvStore.get(id) ?? localCvStore.create({ id, title, markdown: doc.content, css: source?.css ?? "" });
    if (!created) { toast.push("This browser refused to save the new CV.", { tone: "error" }); return; }
    try {
        await call(`applications/${encodeURIComponent(props.id)}/documents/${encodeURIComponent(doc.id)}/registration`, { method: "POST", body: { status: "registered", ruxt_cv_id: id } });
    } catch { /* the local copy exists either way; registration status is informational */ }
    await navigateTo(`/e/${encodeURIComponent(id)}`);
}

async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.push("Copied", { tone: "success" }); } catch { toast.push("Copy failed", { tone: "error" }); }
}
</script>

<template>
    <section class="jobs-section">
        <p><NuxtLink to="/jobs/applications">← Applications</NuxtLink></p>
        <p v-if="error" class="danger" role="alert">{{ error }}</p>
        <template v-if="data">
            <h1>{{ data.job.title }} <small class="muted">— {{ data.job.company }}</small></h1>
            <p>
                <span class="pill" :data-state="state">{{ STATE_LABELS[state!] || state }}</span>
                · {{ data.source?.name || data.job.source_id }}
                <template v-if="data.job.application_url"> · <a :href="data.job.application_url" target="_blank" rel="noopener noreferrer">Open posting</a></template>
                <template v-if="data.application.selected_cv_id"> · CV {{ data.application.selected_cv_id }} @{{ data.application.selected_cv_revision }}</template>
            </p>
            <p v-if="data.application.exception_reason" class="callout warn" role="status">{{ data.application.exception_reason }}</p>
            <p v-if="data.application.last_error && state !== 'SUBMITTED'" class="muted">Last error: {{ data.application.last_error }}</p>

            <!-- Actions available in the current state -->
            <div class="jobs-actions">
                <button v-if="state === 'NOT_SELECTED'" type="button" @click="act('select')">Prepare anyway</button>
                <button v-if="['MATCHED', 'NOT_SELECTED', 'BLOCKED_EXCEPTION'].includes(state!)" type="button" @click="act('rematch')">Re-match</button>
                <button v-if="state === 'BLOCKED_EXCEPTION'" type="button" @click="act('retry')">Retry</button>
                <button v-if="state === 'BLOCKED_EXCEPTION' && data.application.match_id" type="button" @click="act('regenerate')">Regenerate documents</button>
            </div>

            <div v-if="missingAnswers.length" class="jobs-group">
                <h2>Questions only you can answer</h2>
                <p class="muted">The system never guesses these. Your answer is used for this application only; add standing answers in Settings.</p>
                <form v-for="a in missingAnswers" :key="a.question_id" class="jobs-form" @submit.prevent="act('answer', { question_id: a.question_id, answer: answerDraft[a.question_id] })">
                    <label>{{ a.question }}<span v-if="a.required" class="warn"> (required)</span><input v-model="answerDraft[a.question_id]" required></label>
                    <button type="submit">Save answer</button>
                </form>
            </div>

            <div v-if="state === 'HANDOFF_PENDING' || state === 'BLOCKED_EXCEPTION'" class="jobs-group">
                <h2>Apply on the platform</h2>
                <p class="muted">{{ data.source?.name }} does not permit automated submission. Open the posting, apply with the documents below, and the platform's confirmation email will mark this submitted. If no email will arrive, record your evidence here.</p>
                <form class="jobs-form grid" @submit.prevent="act('attest-submitted', { evidence: attest.evidence, url: attest.url })">
                    <label>Evidence (confirmation text, number, date)<input v-model="attest.evidence" minlength="10" required></label>
                    <label>Evidence URL (optional)<input v-model="attest.url" type="url"></label>
                    <button type="submit">I submitted this application</button>
                </form>
            </div>

            <h2>Match</h2>
            <template v-if="match">
                <p><strong>{{ pct(match.match_score) }}</strong> {{ match.recommendation }} · eligibility {{ match.eligibility }} · confidence {{ pct(match.confidence) }}</p>
                <table class="jobs-table"><thead><tr><th>Dimension</th><th>Status</th><th>Score</th><th>Note</th></tr></thead>
                    <tbody><tr v-for="(d, name) in match.dimensions" :key="name"><td>{{ String(name).replace('_', ' ') }}</td><td>{{ d.status }}</td><td>{{ pct(d.score) }}</td><td class="muted">{{ d.note }}</td></tr></tbody>
                </table>
                <h3>Matched, with evidence</h3>
                <ul class="jobs-list"><li v-for="r in match.matched_requirements" :key="r.kind + r.requirement">{{ r.requirement }} <small class="muted">({{ r.kind }})</small>
                    <ul><li v-for="f in evidence(r.evidence_refs)" :key="f.fact_id" class="muted">“{{ f.value }}” — {{ f.source_document_id }} v{{ f.source_version_id }} {{ f.evidence_location }}</li></ul></li></ul>
                <h3>Missing</h3><ul class="jobs-list"><li v-for="r in match.missing_requirements" :key="r.kind + r.requirement">{{ r.requirement }} <small class="muted">{{ r.note }}</small></li></ul>
                <h3>Uncertain</h3><ul class="jobs-list"><li v-for="r in match.uncertain_requirements" :key="r.kind + r.requirement">{{ r.requirement }} <small class="muted">{{ r.note }}</small></li></ul>
            </template>
            <p v-else class="muted">Not matched yet.</p>

            <h2>Documents</h2>
            <div v-for="d in latestDocs" :key="d.id" class="jobs-group">
                <h3>{{ d.kind === "cover_letter" ? "Cover letter" : "Tailored CV" }} <small class="muted">from {{ d.source_cv_id }} @{{ d.source_cv_revision }} · {{ d.engine?.prompt_version }} · validation {{ d.validation?.passed ? "passed" : "failed" }} · Ruxt: {{ d.ruxt_registration }}</small></h3>
                <pre class="doc">{{ d.content }}</pre>
                <div class="jobs-actions"><button type="button" @click="openAsCv(d)">Open in CV editor as a new CV</button><button type="button" @click="copy(d.content)">Copy</button></div>
            </div>

            <h2>Answers</h2>
            <table class="jobs-table"><thead><tr><th>Question</th><th>Answer</th><th>Source</th></tr></thead>
                <tbody><tr v-for="a in data.answers" :key="a.question_id"><td>{{ a.question }}</td><td>{{ a.answer ?? "—" }}</td><td>{{ a.status === "answered" ? a.source : "unknown" }}</td></tr></tbody>
            </table>

            <h2>Policy decisions</h2>
            <ul class="jobs-list"><li v-for="(p, i) in data.policy_decisions" :key="i"><strong>{{ p.outcome }}</strong> <small class="muted">{{ when(p.created_at) }} · rules {{ p.rules_version }}</small><ul><li v-for="r in p.reasons" :key="r">{{ r }}</li></ul></li></ul>

            <h2>Submission receipts</h2>
            <p v-if="!data.receipts?.length" class="muted">None. An application is only shown as submitted with a receipt.</p>
            <ul class="jobs-list"><li v-for="r in data.receipts" :key="r.id">{{ r.kind }} <small class="muted">{{ r.verified ? "verified" : "candidate-attested" }} · {{ when(r.received_at) }}</small></li></ul>

            <h2>Outcome</h2>
            <form class="jobs-form" @submit.prevent="act('outcome', { outcome })"><input v-model="outcome" :placeholder="data.application.outcome || 'Interview, rejection, offer…'" aria-label="Outcome"><button type="submit" :disabled="!outcome">Record</button></form>

            <h2>Timeline</h2>
            <ol class="jobs-timeline">
                <li v-for="e in data.events" :key="e.seq"><time>{{ when(e.created_at) }}</time> <strong>{{ e.kind }}</strong> <span v-if="e.to_state">{{ e.from_state || "∅" }} → {{ e.to_state }}</span><small class="block muted">{{ JSON.stringify(e.detail) }}</small></li>
            </ol>
            <h3>Execution runs</h3>
            <ul class="jobs-list"><li v-for="r in data.runs" :key="r.id">#{{ r.attempt }} {{ r.executor }} — {{ r.state }} <small class="muted">{{ when(r.started_at) }} {{ r.error || "" }}</small></li></ul>
        </template>
    </section>
</template>

<style scoped>
.jobs-section { max-width: 1100px; }
.jobs-section h1 { margin: 0 0 8px; font-size: 18px; }
.jobs-section h2 { margin: 24px 0 8px; font-size: 14px; color: var(--fg-subtext1); }
.jobs-section h3 { margin: 16px 0 6px; font-size: 13px; }
.muted { color: var(--fg-subtext0); }
.block { display: block; }
.warn { color: var(--warning); }
.danger { color: var(--danger); }
.callout { padding: 8px 12px; border: 1px solid var(--warning); border-radius: 4px; }
.jobs-table { width: 100%; border-collapse: collapse; }
.jobs-table th, .jobs-table td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
.jobs-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.jobs-timeline { display: grid; gap: 8px; padding-left: 18px; }
.jobs-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; margin: 8px 0; }
.jobs-form.grid { display: grid; max-width: 640px; }
.jobs-form label { display: grid; gap: 4px; }
.jobs-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.jobs-group { margin: 12px 0; }
.doc { max-height: 360px; overflow: auto; padding: 12px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg-mantle); white-space: pre-wrap; }
input { min-height: 32px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 3px; background: var(--bg-mantle); color: var(--fg-text); font: inherit; }
button { padding: 6px 10px; border: 1px solid var(--border); border-radius: 3px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
button:hover { border-color: var(--accent); }
button:disabled { opacity: .5; cursor: not-allowed; }
a { color: var(--accent); }
.pill { display: inline-block; padding: 1px 6px; border: 1px solid var(--border); border-radius: 999px; font-size: 11px; }
.pill[data-state="SUBMITTED"] { border-color: var(--success); color: var(--success); }
.pill[data-state="BLOCKED_EXCEPTION"], .pill[data-state="SUBMISSION_UNKNOWN"] { border-color: var(--warning); color: var(--warning); }
.pill[data-state="HANDOFF_PENDING"] { border-color: var(--info); color: var(--info); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
