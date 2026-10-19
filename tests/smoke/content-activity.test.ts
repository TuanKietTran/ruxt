import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright-core";

const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
const executablePath = process.env.CHROMIUM_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const ui = base && existsSync(executablePath) ? describe : describe.skip;
let browser: Browser;
vi.setConfig({ testTimeout: 45_000, hookTimeout: 30_000 });
beforeAll(async () => {
    if (base && existsSync(executablePath)) browser = await chromium.launch({ executablePath, headless: true });
});
afterAll(async () => { await browser?.close(); });

ui("local editor content activity", () => {
    it("does not autosave merely on open, waits for acknowledged writes, and preserves rename activity", async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const id = randomUUID();
        const response = await context.request.post(`${base}/api/cvs`, { data: {
            id, title: "Activity regression", markdown: ":::resume\n\n# Activity {.cv-name}\n\nOriginal text.\n\n:::", css: ".resume { font: 12px serif; padding: 20px; }",
        } });
        expect(response.status()).toBe(201);
        const initial = await response.json();
        let puts = 0;
        page.on("request", request => { if (request.method() === "PUT" && request.url().endsWith(`/api/cvs/${id}`)) puts++; });
        await page.goto(`${base}/?s=${id}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.locator(".cm-content").first().waitFor();
        await page.locator(".save-state--saved").waitFor();
        // Let the autosave debounce and EventSource ready reconciliation pass.
        await page.waitForTimeout(900);
        const opened = await (await context.request.get(`${base}/api/cvs/${id}`)).json();
        expect(puts).toBe(0);
        expect(opened.revision).toBe(initial.revision);
        expect(opened.updatedAt).toBe(initial.updatedAt);
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        await page.route(`**/api/cvs/${id}`, async route => {
            if (route.request().method() === "PUT") await gate;
            await route.continue();
        });
        const content = page.locator(".cm-content").first();
        await content.click();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.type("\n\nAcknowledged content regression");
        await page.locator(".save-state--saving").waitFor();
        await page.waitForTimeout(700);
        expect(await page.locator(".save-state").textContent()).toBe("saving");
        expect((await (await context.request.get(`${base}/api/cvs/${id}`)).json()).revision).toBe(initial.revision);
        release();
        await page.locator(".save-state--saved").waitFor();
        const saved = await (await context.request.get(`${base}/api/cvs/${id}`)).json();
        expect(saved.markdown).toContain("Acknowledged content regression");
        expect(saved.revision).toBeGreaterThan(initial.revision);
        const renamed = await (await context.request.patch(`${base}/api/cvs/${id}`, { data: { title: "Metadata-only rename" } })).json();
        expect(renamed.updatedAt).toBe(saved.updatedAt);
        expect(renamed.revision).toBe(saved.revision);
        await context.close();
    });
});
