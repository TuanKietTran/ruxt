<script setup lang="ts">
import type {
    UIPlan,
    UISubscription,
    PlansResponse,
    SubscriptionsResponse,
} from "~/types/api";
import type { StatusCode, BillingPeriod, CurrencyCode } from "@core/domain";

const route = useRoute();
const { user } = useAppAuth();
const userId = computed(() => user.value?.id ?? "");

const {
    data: plansData,
    status: plansStatus,
    refresh: refreshPlans,
} = await useFetch<PlansResponse>("/api/plans", { query: { all: "true" } });
const {
    data: subsData,
    status: subsStatus,
    refresh: refreshSubs,
} = await useFetch<SubscriptionsResponse>("/api/subscriptions", {
    query: { include: "entitlements" },
});

const plans = computed<UIPlan[]>(() => plansData.value?.plans ?? []);
const subs = computed<UISubscription[]>(
    () => subsData.value?.subscriptions ?? [],
);
const entitlements = computed(() => subsData.value?.entitlements);
const pageTitle = computed(() => {
    const count = subs.value.length;
    return `${count} Subscription${count === 1 ? "" : "s"}`;
});
useSeoMeta({
    title: () => pageTitle.value,
    ogTitle: () => pageTitle.value,
});

const planMap = computed(() => {
    const m: Record<string, UIPlan> = {};
    for (const p of plans.value) m[p.id] = p;
    return m;
});

const MINOR_UNITS: Record<CurrencyCode, number> = {
    USD: 100, EUR: 100, GBP: 100, AUD: 100,
    CAD: 100, SGD: 100, JPY: 1,  VND: 1,
};

function formatMoney(amountMinor: number, currency: CurrencyCode): string {
    const units = MINOR_UNITS[currency] ?? 100;
    return `${(amountMinor / units).toFixed(units === 1 ? 0 : 2)} ${currency}`;
}

function formatPlanAmount(plan: UIPlan | undefined): string {
    if (!plan) return "—";
    return formatMoney(plan.price.amountMinor, plan.price.currency);
}

const activeSubs = computed(() =>
    subs.value.filter((s) => s.status === "active" || s.status === "trialing"),
);

const monthlySpendByCurrency = computed(() => {
    const totals: Record<string, number> = {};
    const annualFreq: Record<BillingPeriod, number> = {
        weekly: 52 / 12, monthly: 1, quarterly: 1 / 3,
        biannual: 1 / 6, yearly: 1 / 12,
    };
    for (const s of activeSubs.value) {
        const plan = planMap.value[s.planId];
        if (!plan) continue;
        const { currency } = plan.price;
        const units = MINOR_UNITS[currency] ?? 100;
        const monthly = (plan.price.amountMinor / units) * (annualFreq[plan.billingCycle] ?? 1);
        totals[currency] = (totals[currency] ?? 0) + monthly;
    }
    return totals;
});

const monthlySpendDisplay = computed(() => {
    const entries = Object.entries(monthlySpendByCurrency.value);
    if (entries.length === 0) return "0.00 USD";
    return entries
        .map(([cur, amt]) => {
            const units = MINOR_UNITS[cur as CurrencyCode] ?? 100;
            return `${amt.toFixed(units === 1 ? 0 : 2)} ${cur}`;
        })
        .join(" + ");
});

const nextBilling = computed(() => {
    const dates = activeSubs.value.map((s) => s.currentPeriodEnd).sort();
    return dates[0] ? dates[0].slice(0, 10) : "—";
});

const stats = computed(() => [
    {
        label: "Active subs",
        value: String(activeSubs.value.length),
        delta: `${subs.value.length} total`,
        color: "var(--green)",
    },
    {
        label: "Monthly spend",
        value: monthlySpendDisplay.value,
        delta: "across active plans",
        color: "var(--peach)",
    },
    {
        label: "Next billing",
        value: nextBilling.value,
        delta: "earliest renewal",
        color: "var(--yellow)",
    },
    {
        label: "Plans available",
        value: String(plans.value.length),
        delta: "in catalog",
        color: "var(--sapphire)",
    },
]);

const search = ref("");
const filterStatus = ref<StatusCode | "">("");

const filteredSubs = computed(() => {
    const q = search.value.toLowerCase();
    return subs.value.filter((s) => {
        const plan = planMap.value[s.planId];
        const matchesSearch = !q
            || (plan?.name ?? s.planId).toLowerCase().includes(q)
            || (plan?.provider ?? "").toLowerCase().includes(q);
        const matchesStatus = !filterStatus.value || s.status === filterStatus.value;
        return matchesSearch && matchesStatus;
    });
});

const statusColor: Record<StatusCode, string> = {
    active:    "var(--green)",
    trialing:  "var(--sapphire)",
    paused:    "var(--fg-subtext0)",
    past_due:  "var(--yellow)",
    cancelled: "var(--red)",
    expired:   "var(--red)",
};

const loading = computed(
    () => plansStatus.value === "pending" || subsStatus.value === "pending",
);

// ── Add subscription panel ────────────────────────────────────────────────────
const showPanel = ref(false);

// Step: 'sub' = pick existing plan | 'plan' = create new plan first
const panelStep = ref<"sub" | "plan">("sub");

const subForm = ref({
    planId: "",
    billingPeriod: "" as BillingPeriod | "",
    trialDays: "" as number | "",
});

const planForm = ref({
    name: "",
    provider: "",
    description: "",
    amountStr: "",
    currency: "USD" as CurrencyCode,
    billingCycle: "monthly" as BillingPeriod,
    trialDays: "" as number | "",
});

const panelError = ref("");
const panelLoading = ref(false);
const panelStartAt = ref("");

function nowLocalDt(): string {
    const d = new Date();
    d.setSeconds(0, 0);
    // shift to local time before slicing
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
}

function startAtISO(): string | undefined {
    if (!panelStartAt.value) return undefined;
    return new Date(panelStartAt.value).toISOString();
}

function openPanel() {
    subForm.value = { planId: "", billingPeriod: "", trialDays: "" };
    planForm.value = { name: "", provider: "", description: "", amountStr: "", currency: "USD", billingCycle: "monthly", trialDays: "" };
    panelStartAt.value = nowLocalDt();
    panelError.value = "";
    // auto-jump to plan creation if catalog is empty
    panelStep.value = plans.value.length === 0 ? "plan" : "sub";
    showPanel.value = true;
}

function closePanel() {
    showPanel.value = false;
}

function goCreatePlan() {
    planForm.value = { name: "", provider: "", description: "", amountStr: "", currency: "USD", billingCycle: "monthly", trialDays: "" };
    panelError.value = "";
    panelStep.value = "plan";
}

function goBackToSub() {
    panelError.value = "";
    panelStep.value = "sub";
}

const selectedPlan = computed(() =>
    plans.value.find((p) => p.id === subForm.value.planId),
);

async function submitSub() {
    if (!subForm.value.planId) {
        panelError.value = "Select a plan.";
        return;
    }
    panelLoading.value = true;
    panelError.value = "";
    try {
        await $fetch("/api/subscriptions", {
            method: "POST",
            body: {
                planId: subForm.value.planId,
                billingPeriod: subForm.value.billingPeriod || selectedPlan.value?.billingCycle,
                trialDays: subForm.value.trialDays !== "" ? Number(subForm.value.trialDays) : undefined,
                startAt: startAtISO(),
            },
        });
        closePanel();
        await refreshSubs();
    } catch (e: any) {
        panelError.value = e?.data?.message ?? e?.message ?? "Failed to create subscription.";
    } finally {
        panelLoading.value = false;
    }
}

async function submitPlanThenSub() {
    const f = planForm.value;
    if (!f.name.trim()) { panelError.value = "Plan name is required."; return; }
    const amount = parseFloat(f.amountStr);
    if (isNaN(amount) || amount < 0) { panelError.value = "Enter a valid price."; return; }

    panelLoading.value = true;
    panelError.value = "";
    try {
        const units = MINOR_UNITS[f.currency] ?? 100;
        const newId = crypto.randomUUID();
        await $fetch(`/api/plans/${newId}`, {
            method: "PUT",
            body: {
                name: f.name.trim(),
                provider: f.provider.trim(),
                description: f.description.trim(),
                source: "user",
                createdBy: userId.value,
                amountMinor: Math.round(amount * units),
                currency: f.currency,
                billingPeriod: f.billingCycle,
                trialDays: f.trialDays !== "" ? Number(f.trialDays) : null,
                features: [],
                isPublic: true,
            },
        });
        // refresh plans so the new plan appears in the map
        await refreshPlans();
        // create subscription with the new plan
        await $fetch("/api/subscriptions", {
            method: "POST",
            body: {
                planId: newId,
                billingPeriod: f.billingCycle,
                trialDays: f.trialDays !== "" ? Number(f.trialDays) : undefined,
                startAt: startAtISO(),
            },
        });
        closePanel();
        await refreshSubs();
    } catch (e: any) {
        panelError.value = e?.data?.message ?? e?.message ?? "Failed.";
    } finally {
        panelLoading.value = false;
    }
}

// ── Cancel subscription ───────────────────────────────────────────────────────
async function upgradeSub(id: string) {
    const requested = window.prompt(`Upgrade to which plan? Available: ${plans.value.map((plan) => plan.name).join(", ")}`);
    if (!requested) return;
    const target = plans.value.find((plan) => plan.name.toLowerCase() === requested.trim().toLowerCase());
    if (!target) { alert("Plan not found."); return; }
    try {
        const result = await $fetch<{ billing: { url: string } }>(`/api/subscriptions/${id}/plan-change`, { method: "PUT", body: { newPlanId: target.id } });
        window.open(result.billing.url, "_blank", "noopener");
        await refreshSubs();
    } catch (e: any) { alert(e?.data?.message ?? "Sign in to upgrade billing."); }
}

async function manageSub(id: string) {
    try {
        const result = await $fetch<{ billing: { url: string } }>(`/api/subscriptions/${id}?manage=true`);
        window.open(result.billing.url, "_blank", "noopener");
    } catch (e: any) { alert(e?.data?.message ?? "Sign in to manage billing."); }
}

async function cancelSub(id: string) {
    if (!confirm("Cancel this subscription?")) return;
    try {
        await $fetch(`/api/subscriptions/${id}/cancel`, { method: "POST" });
        await refreshSubs();
    } catch (e: any) {
        alert(e?.data?.message ?? "Failed to cancel.");
    }
}

// ── Terminate subscription (hard delete) ─────────────────────────────────────
const terminateTarget = ref<UISubscription | null>(null);
const terminateConfirm = ref("");
const terminateLoading = ref(false);
const terminateError = ref("");

function openTerminate(sub: UISubscription) {
    terminateTarget.value = sub;
    terminateConfirm.value = "";
    terminateError.value = "";
}

function closeTerminate() {
    terminateTarget.value = null;
}

const terminatePlanName = computed(() => {
    if (!terminateTarget.value) return "";
    return planMap.value[terminateTarget.value.planId]?.name ?? terminateTarget.value.planId;
});

const terminateReady = computed(() =>
    terminateConfirm.value === terminatePlanName.value,
);

async function submitTerminate() {
    if (!terminateTarget.value || !terminateReady.value) return;
    terminateLoading.value = true;
    terminateError.value = "";
    try {
        await $fetch(`/api/subscriptions/${terminateTarget.value.id}`, { method: "DELETE" });
        closeTerminate();
        await refreshSubs();
    } catch (e: any) {
        terminateError.value = e?.data?.message ?? e?.message ?? "Failed to terminate.";
    } finally {
        terminateLoading.value = false;
    }
}

// Escape to close
function handleEsc(e: KeyboardEvent) {
    if (e.key === "Escape") closePanel();
}
onMounted(() => document.addEventListener("keydown", handleEsc));
onUnmounted(() => document.removeEventListener("keydown", handleEsc));
</script>

<template>
    <!-- shell: flex row on desktop so panel pushes content -->
    <div class="page-shell" :class="{ 'panel-open': showPanel }">

        <!-- ── main content ── -->
        <div class="page-content">
            <div class="page-header">
                <div>
                    <h1 class="page-title">Dashboard</h1>
                    <p class="page-sub">
                        Subscriptions for user <code>{{ userId }}</code>
                    </p>
                </div>
                <button class="btn-add" type="button" @click="openPanel">
                    <span aria-hidden="true">+</span>
                    Add subscription
                </button>
            </div>

            <div v-if="loading" class="loading">Loading…</div>

            <template v-else>
                <div class="stats-grid">
                    <div v-for="stat in stats" :key="stat.label" class="stat-card">
                        <div class="stat-label">{{ stat.label }}</div>
                        <div class="stat-value" :style="{ color: stat.color }">
                            {{ stat.value }}
                        </div>
                        <div class="stat-delta">{{ stat.delta }}</div>
                    </div>
                </div>

                <div v-if="entitlements" class="automation-card">
                    <div>
                        <div class="stat-label">Automation allowance</div>
                        <strong>{{ entitlements.planName }} · {{ entitlements.remaining }}/{{ entitlements.monthlyQuota }} left</strong>
                        <p class="stat-delta">{{ entitlements.capabilities.join(", ") }} automation · resets monthly</p>
                    </div>
                    <span class="status-badge">{{ entitlements.status }}</span>
                </div>

                <div class="section">
                    <div class="section-head">
                        <h2 class="section-title">Subscriptions</h2>
                        <div class="section-actions">
                            <select
                                v-model="filterStatus"
                                class="filter-select"
                                aria-label="Filter by status"
                            >
                                <option value="">All statuses</option>
                                <option value="active">Active</option>
                                <option value="trialing">Trialing</option>
                                <option value="paused">Paused</option>
                                <option value="past_due">Past due</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="expired">Expired</option>
                            </select>
                            <input
                                v-model="search"
                                type="search"
                                class="search"
                                placeholder="Search…"
                                aria-label="Search subscriptions"
                            />
                        </div>
                    </div>

                    <div v-if="filteredSubs.length === 0" class="empty">
                        No subscriptions found.
                    </div>

                    <div v-else class="table-wrap">
                        <table class="table" aria-label="Subscriptions list">
                            <thead>
                                <tr>
                                    <th>Plan</th>
                                    <th>Provider</th>
                                    <th>Cycle</th>
                                    <th>Amount</th>
                                    <th>Next billing</th>
                                    <th>Status</th>
                                    <th><span class="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="sub in filteredSubs"
                                    :key="sub.id"
                                    class="sub-row"
                                >
                                    <td>
                                        <div class="sub-name">
                                            <span>{{ planMap[sub.planId]?.name ?? sub.planId }}</span>
                                        </div>
                                    </td>
                                    <td class="muted">{{ planMap[sub.planId]?.provider || "—" }}</td>
                                    <td class="muted">{{ planMap[sub.planId]?.billingCycle ?? "—" }}</td>
                                    <td class="amount">{{ formatPlanAmount(planMap[sub.planId]) }}</td>
                                    <td class="muted">{{ sub.currentPeriodEnd.slice(0, 10) }}</td>
                                    <td>
                                        <span
                                            class="status-badge"
                                            :style="{ color: statusColor[sub.status], borderColor: statusColor[sub.status] }"
                                        >
                                            {{ sub.status }}
                                        </span>
                                    </td>
                                    <td>
                                        <div class="row-actions">
                                            <button
                                                class="action-btn"
                                                type="button"
                                                title="Upgrade plan"
                                                aria-label="Upgrade plan"
                                                @click="upgradeSub(sub.id)"
                                            >↑</button>
                                            <button
                                                class="action-btn"
                                                type="button"
                                                title="Manage billing"
                                                aria-label="Manage billing"
                                                @click="manageSub(sub.id)"
                                            >↗</button>
                                            <button
                                                class="action-btn danger"
                                                type="button"
                                                title="Cancel"
                                                aria-label="Cancel subscription"
                                                @click="cancelSub(sub.id)"
                                            >✕</button>
                                            <button
                                                class="action-btn terminate"
                                                type="button"
                                                title="Terminate record"
                                                aria-label="Terminate subscription record"
                                                @click="openTerminate(sub)"
                                            >⌫</button>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </template>
        </div>

        <!-- ── right panel ── -->
        <aside
            class="add-panel"
            :class="{ visible: showPanel }"
            role="complementary"
            aria-label="Add subscription"
        >
            <div class="panel-inner">
                <div class="panel-header">
                    <div class="panel-header-left">
                        <button
                            v-if="panelStep === 'plan' && plans.length > 0"
                            class="back-btn"
                            type="button"
                            aria-label="Back"
                            @click="goBackToSub"
                        >←</button>
                        <h2 class="panel-title">
                            {{ panelStep === 'plan' ? 'Create plan' : 'Add subscription' }}
                        </h2>
                    </div>
                    <button
                        class="panel-close"
                        type="button"
                        aria-label="Close panel"
                        @click="closePanel"
                    >✕</button>
                </div>

                <!-- ── Step: pick existing plan ── -->
                <form v-if="panelStep === 'sub'" class="panel-body" @submit.prevent="submitSub">
                    <div v-if="plans.length === 0" class="no-plans-notice">
                        No plans in catalog yet.
                        <button type="button" class="inline-link" @click="goCreatePlan">Create one →</button>
                    </div>

                    <template v-else>
                        <div class="field">
                            <label class="label" for="sub-plan">Plan</label>
                            <select id="sub-plan" v-model="subForm.planId" class="input" required>
                                <option value="" disabled>Select a plan…</option>
                                <option v-for="p in plans" :key="p.id" :value="p.id">
                                    {{ p.provider ? `${p.provider} — ` : "" }}{{ p.name }}
                                    ({{ formatMoney(p.price.amountMinor, p.price.currency) }} / {{ p.billingCycle }})
                                </option>
                            </select>
                            <button type="button" class="inline-link" @click="goCreatePlan">
                                + Create a new plan
                            </button>
                        </div>

                        <div v-if="selectedPlan" class="field">
                            <label class="label" for="sub-cycle">Billing period</label>
                            <select id="sub-cycle" v-model="subForm.billingPeriod" class="input">
                                <option value="">Default ({{ selectedPlan.billingCycle }})</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="quarterly">Quarterly</option>
                                <option value="biannual">Biannual</option>
                                <option value="yearly">Yearly</option>
                            </select>
                        </div>

                        <div class="field">
                            <label class="label" for="sub-trial">
                                Trial days <span class="label-hint">(optional)</span>
                            </label>
                            <input
                                id="sub-trial"
                                v-model.number="subForm.trialDays"
                                type="number"
                                class="input"
                                min="0"
                                placeholder="e.g. 14"
                            />
                        </div>
                    </template>

                    <div class="field">
                        <label class="label" for="sub-start">Start date</label>
                        <input
                            id="sub-start"
                            v-model="panelStartAt"
                            type="datetime-local"
                            class="input"
                        />
                        <span class="field-hint">Leave as-is to start now</span>
                    </div>

                    <p v-if="panelError" class="form-error">{{ panelError }}</p>

                    <div class="panel-footer">
                        <button type="button" class="btn-secondary" @click="closePanel">Cancel</button>
                        <button
                            v-if="plans.length > 0"
                            type="submit"
                            class="btn-primary"
                            :disabled="panelLoading"
                        >
                            {{ panelLoading ? "Adding…" : "Add subscription" }}
                        </button>
                    </div>
                </form>

                <!-- ── Step: create new plan (then subscribe) ── -->
                <form v-else class="panel-body" @submit.prevent="submitPlanThenSub">
                    <p class="step-hint">
                        Fill in the plan details. A subscription will be created automatically after.
                    </p>

                    <div class="field">
                        <label class="label" for="plan-name">Name <span class="label-req">*</span></label>
                        <input id="plan-name" v-model="planForm.name" type="text" class="input" placeholder="e.g. Pro" required />
                    </div>

                    <div class="field">
                        <label class="label" for="plan-provider">Provider <span class="label-hint">(optional)</span></label>
                        <input id="plan-provider" v-model="planForm.provider" type="text" class="input" placeholder="e.g. Netflix" />
                    </div>

                    <div class="field">
                        <label class="label" for="plan-desc">Description <span class="label-hint">(optional)</span></label>
                        <input id="plan-desc" v-model="planForm.description" type="text" class="input" placeholder="Short description" />
                    </div>

                    <div class="field-row">
                        <div class="field">
                            <label class="label" for="plan-amount">Price <span class="label-req">*</span></label>
                            <input
                                id="plan-amount"
                                v-model="planForm.amountStr"
                                type="number"
                                class="input"
                                min="0"
                                step="0.01"
                                placeholder="9.99"
                                required
                            />
                        </div>
                        <div class="field field-currency">
                            <label class="label" for="plan-currency">Currency</label>
                            <select id="plan-currency" v-model="planForm.currency" class="input">
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="GBP">GBP</option>
                                <option value="AUD">AUD</option>
                                <option value="CAD">CAD</option>
                                <option value="SGD">SGD</option>
                                <option value="JPY">JPY</option>
                                <option value="VND">VND</option>
                            </select>
                        </div>
                    </div>

                    <div class="field">
                        <label class="label" for="plan-cycle">Billing cycle <span class="label-req">*</span></label>
                        <select id="plan-cycle" v-model="planForm.billingCycle" class="input">
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="biannual">Biannual</option>
                            <option value="yearly">Yearly</option>
                        </select>
                    </div>

                    <div class="field">
                        <label class="label" for="plan-trial">Trial days <span class="label-hint">(optional)</span></label>
                        <input
                            id="plan-trial"
                            v-model.number="planForm.trialDays"
                            type="number"
                            class="input"
                            min="0"
                            placeholder="e.g. 14"
                        />
                    </div>

                    <div class="field">
                        <label class="label" for="plan-start">Start date</label>
                        <input
                            id="plan-start"
                            v-model="panelStartAt"
                            type="datetime-local"
                            class="input"
                        />
                        <span class="field-hint">Leave as-is to start now</span>
                    </div>

                    <p v-if="panelError" class="form-error">{{ panelError }}</p>

                    <div class="panel-footer">
                        <button type="button" class="btn-secondary" @click="plans.length > 0 ? goBackToSub() : closePanel()">
                            {{ plans.length > 0 ? "Back" : "Cancel" }}
                        </button>
                        <button type="submit" class="btn-primary" :disabled="panelLoading">
                            {{ panelLoading ? "Creating…" : "Create & subscribe" }}
                        </button>
                    </div>
                </form>
            </div>
        </aside>
    </div>

    <!-- backdrop: tablet only (mobile panel is full screen, desktop has no overlay) -->
    <Teleport to="body">
        <div v-if="showPanel" class="panel-backdrop" @click="closePanel" />
    </Teleport>

    <!-- Terminate confirmation dialog -->
    <Teleport to="body">
        <div v-if="terminateTarget" class="tm-backdrop" @click.self="closeTerminate">
            <div class="tm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="tm-title">
                <div class="tm-icon" aria-hidden="true">⚠</div>

                <h2 id="tm-title" class="tm-title">Terminate subscription record</h2>

                <p class="tm-body">
                    This will <strong>permanently delete</strong> this subscription record from the database.
                    It cannot be recovered.
                </p>

                <ul class="tm-consequences">
                    <li>All billing history for this subscription will be erased</li>
                    <li>The plan <strong>{{ terminatePlanName }}</strong> is not affected</li>
                    <li>This action is irreversible</li>
                </ul>

                <div class="tm-confirm-field">
                    <label class="tm-confirm-label" for="tm-input">
                        To confirm, type <code class="tm-name">{{ terminatePlanName }}</code> below
                    </label>
                    <input
                        id="tm-input"
                        v-model="terminateConfirm"
                        type="text"
                        class="tm-input"
                        :placeholder="terminatePlanName"
                        autocomplete="off"
                        spellcheck="false"
                    />
                </div>

                <p v-if="terminateError" class="tm-error">{{ terminateError }}</p>

                <div class="tm-footer">
                    <button type="button" class="tm-btn-cancel" @click="closeTerminate">
                        Cancel
                    </button>
                    <button
                        type="button"
                        class="tm-btn-terminate"
                        :disabled="!terminateReady || terminateLoading"
                        @click="submitTerminate"
                    >
                        {{ terminateLoading ? "Terminating…" : "I understand, terminate this record" }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/* ── Shell: flex row so panel is in flow ─────────────────────────────────── */
.page-shell {
    display: flex;
    align-items: flex-start;
    min-height: calc(100vh - 56px);
}

.page-content {
    flex: 1;
    min-width: 0;
    padding: 40px 24px;
    max-width: 1200px;
    /* center when panel is closed */
    margin-left: auto;
    margin-right: auto;
    transition: margin-right 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

/* when panel open, shift content left so it stays visually balanced */
.page-shell.panel-open .page-content {
    margin-right: 0;
}

/* ── Right panel: in-flow push on desktop ────────────────────────────────── */
.add-panel {
    width: 0;
    overflow: hidden;
    flex-shrink: 0;
    position: sticky;
    top: 56px; /* header height */
    align-self: flex-start;
    height: calc(100vh - 56px);
    transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.add-panel.visible {
    width: 420px;
}

.panel-inner {
    width: 420px;
    height: 100%;
    overflow-y: auto;
    border-left: 1px solid var(--border);
    background: var(--bg-mantle);
    display: flex;
    flex-direction: column;
}

/* backdrop hidden on desktop */
.panel-backdrop {
    display: none;
}

/* ── Tablet 600–899px: centered dialog ───────────────────────────────────── */
@media (min-width: 600px) and (max-width: 899px) {
    .page-shell {
        display: block;
        min-height: unset;
    }
    .page-content {
        margin: 0 auto;
        transition: none;
    }

    .add-panel {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: auto;
        height: auto;
        overflow: visible;
        z-index: 200;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
    }
    .add-panel.visible {
        pointer-events: auto;
        opacity: 1;
    }

    .panel-inner {
        width: 480px;
        max-width: calc(100vw - 48px);
        max-height: calc(100vh - 80px);
        height: auto;
        border-left: none;
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-strong);
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
        transform: scale(0.95) translateY(-8px);
        transition: transform 0.2s ease;
    }
    .add-panel.visible .panel-inner {
        transform: scale(1) translateY(0);
    }

    .panel-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.55);
        z-index: 199;
    }
}

/* ── Mobile <600px: full-screen page ─────────────────────────────────────── */
@media (max-width: 599px) {
    .page-shell {
        display: block;
        min-height: unset;
    }
    .page-content {
        margin: 0 auto;
        transition: none;
    }

    .add-panel {
        position: fixed;
        top: 56px;
        left: 0;
        right: 0;
        bottom: 0;
        width: auto;
        height: auto;
        overflow: visible;
        z-index: 200;
        pointer-events: none;
        opacity: 0;
        transform: translateY(20px);
        transition: opacity 0.22s ease, transform 0.22s ease;
    }
    .add-panel.visible {
        pointer-events: auto;
        opacity: 1;
        transform: translateY(0);
    }

    .panel-inner {
        width: 100%;
        height: 100%;
        max-height: 100%;
        border-left: none;
        border-radius: 0;
        border-top: 1px solid var(--border);
        box-shadow: none;
    }

    .panel-backdrop {
        display: none;
    }
}

/* ── Panel internals ─────────────────────────────────────────────────────── */
.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 8px;
}
.panel-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}
.panel-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--fg-text);
    margin: 0;
    white-space: nowrap;
}
.back-btn {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--fg-subtext0);
    cursor: pointer;
    font-size: 14px;
    transition: all 0.15s;
}
.back-btn:hover {
    background: var(--bg-surface0);
    color: var(--fg-text);
}
.panel-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--fg-subtext0);
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
}
.panel-close:hover {
    background: var(--bg-surface0);
    color: var(--fg-text);
}

.panel-body {
    padding: 20px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: 1;
}

.panel-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: auto;
    padding-top: 8px;
}

/* ── Page layout ─────────────────────────────────────────────────────────── */
.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 32px;
    gap: 16px;
}
.page-title {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--fg-text);
    margin: 0 0 4px;
}
.page-sub {
    font-size: 14px;
    color: var(--fg-subtext0);
    margin: 0;
}
.page-sub code {
    font-family: monospace;
    background: var(--bg-surface0);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-size: 12px;
}

.btn-add {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 18px;
    background: var(--accent);
    color: var(--bg-crust);
    border: none;
    border-radius: var(--radius-md);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
}
.btn-add:hover { background: var(--accent-hover); }

.loading {
    color: var(--fg-subtext0);
    font-size: 14px;
    padding: 40px 0;
    text-align: center;
}
.empty {
    color: var(--fg-subtext0);
    font-size: 14px;
    padding: 40px;
    text-align: center;
    background: var(--bg-mantle);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 40px;
}
.stat-card {
    background: var(--bg-mantle);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 20px 24px;
    transition: border-color 0.15s;
}
.stat-card:hover { border-color: var(--border-strong); }
.stat-label {
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-subtext0);
    margin-bottom: 12px;
}
.stat-value {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    margin-bottom: 8px;
    word-break: break-all;
}
.stat-delta { font-size: 12px; color: var(--fg-subtext0); }

.section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    gap: 16px;
    flex-wrap: wrap;
}
.section-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--fg-text);
    margin: 0;
}
.section-actions { display: flex; gap: 8px; align-items: center; }

.filter-select {
    background: var(--bg-surface0);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg-text);
    padding: 8px 12px;
    font-size: 13px;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
}
.filter-select:focus { border-color: var(--accent); }

.search {
    background: var(--bg-surface0);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg-text);
    padding: 8px 12px;
    font-size: 13px;
    outline: none;
    width: 200px;
    transition: border-color 0.15s;
}
.search::placeholder { color: var(--bg-overlay1); }
.search:focus { border-color: var(--accent); }

.table-wrap {
    background: var(--bg-mantle);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
}
.table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}
.table thead th {
    padding: 12px 20px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-subtext0);
    background: var(--bg-crust);
    border-bottom: 1px solid var(--border);
}
.sub-row td {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
    color: var(--fg-text);
}
.sub-row:last-child td { border-bottom: none; }
.sub-row:hover td { background: var(--bg-surface0); }
.sub-name { display: flex; align-items: center; gap: 10px; font-weight: 500; }
.muted { color: var(--fg-subtext0); }
.amount { font-weight: 600; font-variant-numeric: tabular-nums; }

.status-badge {
    display: inline-block;
    padding: 3px 10px;
    border: 1px solid;
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
    background: color-mix(in srgb, currentColor 10%, transparent);
}

.row-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.15s;
}
.sub-row:hover .row-actions { opacity: 1; }

.action-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: var(--bg-surface1);
    color: var(--fg-subtext1);
    cursor: pointer;
    font-size: 13px;
    transition: all 0.15s;
}
.action-btn:hover { background: var(--bg-surface2); color: var(--fg-text); }
.action-btn.danger:hover {
    background: color-mix(in srgb, var(--red) 15%, transparent);
    color: var(--red);
    border-color: var(--red);
}
.action-btn.terminate:hover {
    background: color-mix(in srgb, var(--mauve) 15%, transparent);
    color: var(--mauve);
    border-color: var(--mauve);
}

/* ── Terminate dialog ──────────────────────────────────────────────────────── */
.tm-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    padding: 24px;
}

.tm-dialog {
    background: var(--bg-base);
    border: 1px solid var(--red);
    border-radius: var(--radius-lg);
    width: 100%;
    max-width: 480px;
    padding: 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--red) 20%, transparent),
                0 24px 64px rgba(0, 0, 0, 0.5);
}

.tm-icon {
    font-size: 28px;
    color: var(--red);
    line-height: 1;
}

.tm-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--fg-text);
    margin: 0;
}

.tm-body {
    font-size: 14px;
    color: var(--fg-subtext1);
    margin: 0;
    line-height: 1.6;
}

.tm-consequences {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}
.tm-consequences li {
    font-size: 13px;
    color: var(--fg-subtext0);
}

.tm-confirm-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--bg-mantle);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 16px;
}

.tm-confirm-label {
    font-size: 13px;
    color: var(--fg-subtext1);
    line-height: 1.5;
}

.tm-name {
    font-family: monospace;
    font-size: 12px;
    background: color-mix(in srgb, var(--red) 12%, transparent);
    color: var(--red);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid color-mix(in srgb, var(--red) 30%, transparent);
}

.tm-input {
    background: var(--bg-surface0);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg-text);
    padding: 9px 12px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
    font-family: monospace;
}
.tm-input:focus { border-color: var(--red); }

.tm-error {
    margin: 0;
    font-size: 13px;
    color: var(--red);
}

.tm-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    flex-wrap: wrap;
}

.tm-btn-cancel {
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--fg-subtext1);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
}
.tm-btn-cancel:hover { background: var(--bg-surface0); color: var(--fg-text); }

.tm-btn-terminate {
    padding: 8px 18px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--red);
    background: color-mix(in srgb, var(--red) 15%, transparent);
    color: var(--red);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
}
.tm-btn-terminate:hover:not(:disabled) {
    background: var(--red);
    color: var(--bg-crust);
}
.tm-btn-terminate:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

/* ── Form shared styles ───────────────────────────────────────────────────── */
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: 13px; font-weight: 500; color: var(--fg-subtext1); }
.label-hint { font-weight: 400; color: var(--fg-subtext0); }
.input {
    background: var(--bg-surface0);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg-text);
    padding: 9px 12px;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
}
.input:focus { border-color: var(--accent); }
.form-error { margin: 0; font-size: 13px; color: var(--red); }

.step-hint {
    font-size: 13px;
    color: var(--fg-subtext0);
    margin: 0;
    line-height: 1.5;
}

.no-plans-notice {
    font-size: 13px;
    color: var(--fg-subtext0);
    background: var(--bg-surface0);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.inline-link {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    color: var(--accent);
    cursor: pointer;
    font-weight: 500;
    text-decoration: none;
    transition: color 0.15s;
}
.inline-link:hover { color: var(--accent-hover); }

.label-req { color: var(--red); font-weight: 600; }

.field-row {
    display: flex;
    gap: 10px;
}
.field-row .field { flex: 1; }
.field-currency { max-width: 100px; }

.field-hint {
    font-size: 11px;
    color: var(--fg-subtext0);
    margin-top: 2px;
}

input[type="datetime-local"].input {
    color-scheme: dark;
}

.btn-secondary {
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    background: transparent;
    color: var(--fg-subtext1);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
}
.btn-secondary:hover { background: var(--bg-surface0); color: var(--fg-text); }

.btn-primary {
    padding: 8px 18px;
    border-radius: var(--radius-sm);
    border: none;
    background: var(--accent);
    color: var(--bg-crust);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
}
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
