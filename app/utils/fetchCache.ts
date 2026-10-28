import type { NuxtApp } from "#app";

// When each keyed copy was last requested in this tab. Server-rendered data counts from hydration.
const fetchedAt = new Map<string, number>();

/**
 * `getCachedData` for keyed useFetch/useAsyncData: remounts and navigations reuse the loaded copy for
 * `ttlMs`, while refresh(), refreshNuxtData() and a changed URL always go to the network.
 */
export function reuseFor(ttlMs: number) {
    return (key: string, nuxtApp: NuxtApp, context: { cause: string }) => {
        const data = nuxtApp.payload.data[key] ?? nuxtApp.static.data[key];
        const now = Date.now();
        if (data !== undefined && nuxtApp.isHydrating) {
            if (import.meta.client) fetchedAt.set(key, now);
            return data;
        }
        if (data !== undefined && context.cause === "initial" && now - (fetchedAt.get(key) ?? 0) < ttlMs) return data;
        if (import.meta.client) fetchedAt.set(key, now);
        return undefined;
    };
}
