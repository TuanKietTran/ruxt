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
