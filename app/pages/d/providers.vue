<script setup lang="ts">
import type { UIPlan, PlansResponse } from "~/types/api";
import { formatMoney } from "~/utils/money";

const { data, status } = await useFetch<PlansResponse>("/api/plans", {
    query: { all: "true" },
});

const plans = computed<UIPlan[]>(() => data.value?.plans ?? []);

const search = ref("");

// Group plans by provider (plans with no provider go under "Other")
const providerGroups = computed(() => {
    const q = search.value.toLowerCase();
    const filtered = plans.value.filter(
        (p) =>
            !q ||
            p.provider.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q),
    );

    const groups: Record<string, UIPlan[]> = {};
    for (const plan of filtered) {
        const key = plan.provider || "Other";
        if (!groups[key]) groups[key] = [];
        groups[key].push(plan);
    }

    return Object.entries(groups)
        .sort(([a], [b]) => {
            if (a === "Other") return 1;
            if (b === "Other") return -1;
            return a.localeCompare(b);
        })
        .map(([name, provPlans]) => ({ name, plans: provPlans }));
});
const pageTitle = computed(() => {
    const count = providerGroups.value.length;
    return `${count} Provider${count === 1 ? "" : "s"}`;
});
useSeoMeta({
    title: () => pageTitle.value,
    ogTitle: () => pageTitle.value,
});

const loading = computed(() => status.value === "pending");
</script>

<template>
    <div class="page">
        <div class="page-header">
            <div>
                <h1 class="page-title">Providers</h1>
                <p class="page-sub">Plans grouped by service provider</p>
            </div>
        </div>

        <div v-if="loading" class="loading">Loading…</div>

        <template v-else>
            <div class="filters">
                <input
                    v-model="search"
                    type="search"
                    class="search"
                    placeholder="Search providers or plans…"
                    aria-label="Search providers"
                />
            </div>

            <div v-if="providerGroups.length === 0" class="empty">No providers found.</div>

            <div v-else class="provider-list">
                <section
                    v-for="group in providerGroups"
                    :key="group.name"
                    class="provider-section"
                >
                    <div class="provider-header">
                        <h2 class="provider-name">{{ group.name }}</h2>
                        <span class="provider-count">{{ group.plans.length }} plan{{ group.plans.length !== 1 ? "s" : "" }}</span>
                    </div>

                    <div class="plan-table-wrap">
                        <table class="plan-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Cycle</th>
                                    <th>Price</th>
                                    <th>Trial</th>
                                    <th>Features</th>
                                    <th>Visibility</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="plan in group.plans" :key="plan.id" class="plan-row">
                                    <td class="plan-name-cell">
                                        <span class="plan-name">{{ plan.name }}</span>
                                        <span v-if="plan.description" class="plan-desc">{{ plan.description }}</span>
                                    </td>
                                    <td class="muted">{{ plan.billingCycle }}</td>
                                    <td class="amount">
                                        {{ formatMoney(plan.price.amountMinor, plan.price.currency) }}
                                    </td>
                                    <td class="muted">
                                        {{ plan.trialDays ? `${plan.trialDays}d` : "—" }}
                                    </td>
                                    <td class="muted">
                                        {{ plan.features.length ? plan.features.join(", ") : "—" }}
                                    </td>
                                    <td>
                                        <span :class="plan.isPublic ? 'badge-public' : 'badge-private'">
                                            {{ plan.isPublic ? "Public" : "Private" }}
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </template>
    </div>
</template>

<style scoped>
.page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 24px;
}

.page-header { margin-bottom: 24px; }
.page-title {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: var(--fg-text);
    margin: 0 0 4px;
}
.page-sub { font-size: 14px; color: var(--fg-subtext0); margin: 0; }

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

.filters { margin-bottom: 24px; }

.search {
    background: var(--bg-surface0);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg-text);
    padding: 8px 12px;
    font-size: 13px;
    outline: none;
    width: 280px;
    transition: border-color 0.15s;
}
.search::placeholder { color: var(--bg-overlay1); }
.search:focus { border-color: var(--accent); }

.provider-list { display: flex; flex-direction: column; gap: 32px; }

.provider-section { display: flex; flex-direction: column; gap: 12px; }

.provider-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
}

.provider-name {
    font-size: 18px;
    font-weight: 700;
    color: var(--fg-text);
    margin: 0;
}

.provider-count {
    font-size: 12px;
    color: var(--fg-subtext0);
    font-weight: 500;
}

.plan-table-wrap {
    background: var(--bg-mantle);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
}

.plan-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.plan-table thead th {
    padding: 10px 20px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-subtext0);
    background: var(--bg-crust);
    border-bottom: 1px solid var(--border);
}

.plan-row td {
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
    color: var(--fg-text);
}
.plan-row:last-child td { border-bottom: none; }
.plan-row:hover td { background: var(--bg-surface0); }

.plan-name-cell { display: flex; flex-direction: column; gap: 2px; }
.plan-name { font-weight: 500; }
.plan-desc { font-size: 12px; color: var(--fg-subtext0); }

.muted { color: var(--fg-subtext0); }
.amount { font-weight: 600; font-variant-numeric: tabular-nums; }

.badge-public, .badge-private {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 600;
    border: 1px solid;
}
.badge-public {
    color: var(--green);
    border-color: var(--green);
    background: color-mix(in srgb, var(--green) 10%, transparent);
}
.badge-private {
    color: var(--yellow);
    border-color: var(--yellow);
    background: color-mix(in srgb, var(--yellow) 10%, transparent);
}
</style>
