import type { BrowserContext, Page } from "playwright-core";

/** Synthetic browser fixture; never writes server documents. */
export async function seedLocalCv(target: Page | BrowserContext, input: { id: string; markdown: string; css: string; title?: string; revision?: number }) {
    await target.addInitScript(input => {
        if (window.top !== window) return;
        const key = `cv-sv:session-backup:${input.id}`;
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ ...input, revision: input.revision ?? 1, pending: false, savedAt: 1_000 }));
    }, input);
}

export function readLocalCv(page: Page, id: string) {
    return page.evaluate(id => JSON.parse(localStorage.getItem(`cv-sv:session-backup:${id}`) || "null"), id);
}

export const LOCAL_PROFILES_STORAGE_KEY = "cv-sv:local-profiles:v1";

/** Synthetic browser fixture: profiles already in this browser's storage before the app loads. */
export async function seedLocalProfiles(target: Page | BrowserContext, entries: unknown[]) {
    await target.addInitScript(({ key, entries }) => {
        if (window.top !== window) return;
        if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(entries));
    }, { key: LOCAL_PROFILES_STORAGE_KEY, entries });
}

export function readLocalProfilesRaw(page: Page) {
    return page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]") as Array<Record<string, any>>, LOCAL_PROFILES_STORAGE_KEY);
}
