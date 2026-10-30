import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";

const baseUrl = process.env.UI_REGRESSION_BASE_URL ?? "http://127.0.0.1:43823";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname)) {
    throw new Error("UI regression browser tests are restricted to localhost");
}
const artifacts = process.env.UI_REGRESSION_ARTIFACTS ?? "artifacts/ui-regression";
const executablePath = process.env.CHROMIUM_PATH ?? chromium.executablePath();
if (process.env.UI_REGRESSION_BASE_URL && !existsSync(executablePath)) {
    throw new Error(`Required Chromium binary is missing at ${executablePath}; run pnpm exec playwright-core install chromium first`);
}
const suite = process.env.UI_REGRESSION_BASE_URL && existsSync(executablePath) ? describe : describe.skip;
let browser: Browser;

async function localPage(viewport: { width: number; height: number }) {
    const context = await browser.newContext({ viewport });
    const blockedExternal: string[] = [];
    // Use a fresh context, disallow external requests, and intercept every native dialog/print API.
    await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return route.continue();
        blockedExternal.push(`${url.origin}${url.pathname}`);
        return route.abort();
    });
    const page = await context.newPage();
    const dialogEvents: string[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") pageErrors.push(message.text()); });
    await page.addInitScript(() => {
        const calls: string[] = [];
        Object.defineProperty(window, "__uiRegressionNativeCalls", { value: calls });
        window.alert = () => { calls.push("alert"); };
        window.confirm = () => { calls.push("confirm"); return false; };
        window.prompt = () => { calls.push("prompt"); return null; };
        window.print = () => { calls.push("print"); };
    });
    page.on("dialog", dialog => { dialogEvents.push(dialog.type()); void dialog.dismiss(); });
    page.setDefaultTimeout(8_000);
    return { context, page, dialogEvents, blockedExternal, pageErrors };
}

async function interceptedNativeCalls(page: Page, dialogEvents: string[]) {
    const calls = await page.evaluate(() => (window as Window & { __uiRegressionNativeCalls?: string[] }).__uiRegressionNativeCalls ?? []);
    return [...dialogEvents, ...calls];
}

async function hydration(page: Page, interactiveSelector?: string) {
    // Root mount can precede async page-subtree hydration and its event handlers.
    await page.waitForFunction(() => {
        const app = (document.querySelector("#__nuxt") as (HTMLElement & { __vue_app__?: { _instance?: { isMounted?: boolean; subTree?: unknown } } }) | null)?.__vue_app__;
        return Boolean(app?._instance?.isMounted && app._instance.subTree);
    }, null, { timeout: 10_000 });
    await page.evaluate(async () => {
        await document.fonts.ready;
        // Wait for media-query state and document geometry to settle across animation frames.
        let prior = "";
        let stableFrames = 0;
        while (stableFrames < 2) {
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            const state = [window.innerWidth, window.matchMedia("(max-width: 900px)").matches,
                document.documentElement.scrollWidth, document.body.scrollWidth,
                document.documentElement.scrollHeight].join(":");
            stableFrames = state === prior ? stableFrames + 1 : 0;
            prior = state;
        }
    });
    if (interactiveSelector) {
        await page.waitForFunction(selector => {
            const element = document.querySelector(selector) as (HTMLElement & { __vnode?: { props?: { onClick?: unknown } } }) | null;
            return typeof element?.__vnode?.props?.onClick === "function";
        }, interactiveSelector, { timeout: 10_000 });
    }
}

async function dimensions(page: Page) {
    return page.evaluate(() => ({
        viewport: window.innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        root: (document.querySelector("#__nuxt") as HTMLElement | null)?.scrollWidth ?? 0,
    }));
}

async function writeResult(name: string, result: unknown) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(artifacts, name), JSON.stringify(result, null, 2));
}

beforeAll(async () => {
    mkdirSync(artifacts, { recursive: true });
    if (existsSync(executablePath)) browser = await chromium.launch({ executablePath, headless: true });
});
afterAll(async () => { await browser?.close(); });

suite("anonymous local UI baseline (localhost, isolated browser contexts)", { timeout: 30_000 }, () => {
    it("measures Preferences overflow before and after Nuxt hydration at 390px", async () => {
        const { context, page, dialogEvents, blockedExternal, pageErrors } = await localPage({ width: 390, height: 844 });
        await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
        const beforeHydration = await dimensions(page);
        await page.screenshot({ path: join(artifacts, "after-mobile-settings-pre-hydration.png"), fullPage: true });
        await hydration(page);
        await page.getByRole("heading", { name: "Preferences" }).waitFor();
        await page.getByText("These settings are saved in this browser only. Sign in to keep them with your account.").waitFor();
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const afterHydration = await dimensions(page);
        await page.screenshot({ path: join(artifacts, "after-mobile-settings-post-hydration.png"), fullPage: true });
        const nativeCalls = await interceptedNativeCalls(page, dialogEvents);
        const result = { url: page.url(), beforeHydration, afterHydration, nativeCalls, blockedExternal, pageErrors };
        await writeResult("after-mobile-settings-measurements.json", result);
        expect(afterHydration.viewport).toBe(390);
        // Intentional acceptance assertion: expected to fail when the baseline overflows.
        expect(afterHydration.document).toBeLessThanOrEqual(390);
        expect(nativeCalls).toEqual([]);
        await context.close();
    });

    it("opens the main empty-state New profile form and focuses blank Full name after hydration", async () => {
        const { context, page, dialogEvents, blockedExternal, pageErrors } = await localPage({ width: 390, height: 844 });
        await page.goto(`${baseUrl}/p`, { waitUntil: "domcontentloaded" });
        await hydration(page, ".profile-placeholder .profile-save");
        await page.locator(".profile-placeholder").waitFor({ state: "visible" });
        await page.screenshot({ path: join(artifacts, "after-mobile-profiles-empty.png"), fullPage: true });
        await page.locator(".profile-placeholder .profile-save").click();
        await page.locator(".profile-sheet").waitFor({ state: "visible", timeout: 10_000 });
        await page.locator('textarea[placeholder="Your name"]').waitFor({ state: "visible", timeout: 10_000 });
        const afterClick = await page.evaluate(() => ({
            activeTag: document.activeElement?.tagName ?? "",
            activeLabel: (document.activeElement as HTMLInputElement | null)?.getAttribute("aria-label") ?? "",
            activePlaceholder: (document.activeElement as HTMLInputElement | null)?.placeholder ?? "",
            activeValue: (document.activeElement as HTMLInputElement | null)?.value ?? "",
            headings: [...document.querySelectorAll("h1,h2,h3")].map(node => node.textContent?.trim()),
        }));
        await page.screenshot({ path: join(artifacts, "after-mobile-profiles-new-form.png"), fullPage: true });
        const nativeCalls = await interceptedNativeCalls(page, dialogEvents);
        await writeResult("after-mobile-profile-focus.json", { url: page.url(), afterClick, nativeCalls, blockedExternal, pageErrors });
        expect(afterClick.activeTag).toBe("TEXTAREA");
        expect(afterClick.activeValue).toBe("");
        expect(afterClick.activePlaceholder).toBe("Your name");
        expect(afterClick.headings).toContain("Profile identity");
        expect(nativeCalls).toEqual([]);
        await context.close();
    });

    it("opens the sidebar New profile action after deterministic hydration waits", async () => {
        const { context, page, dialogEvents, blockedExternal, pageErrors } = await localPage({ width: 390, height: 844 });
        await page.goto(`${baseUrl}/p`, { waitUntil: "domcontentloaded" });
        await hydration(page, '[aria-label="Toggle sidebar"]');
        const toggle = page.getByRole("button", { name: "Toggle sidebar" });
        const initialSidebar = await page.locator(".editor-layout").getAttribute("class");
        for (let attempt = 0; attempt < 2 && !(await page.locator(".editor-layout--drawer-open").count()); attempt++) {
            await toggle.click();
        }
        await page.locator(".editor-layout--drawer-open").waitFor({ state: "visible" });
        await page.locator(".profiles-new").waitFor({ state: "visible" });
        await page.waitForFunction(() => {
            const element = document.querySelector(".profiles-new") as (HTMLElement & { __vnode?: { props?: { onClick?: unknown } } }) | null;
            return typeof element?.__vnode?.props?.onClick === "function";
        }, null, { timeout: 10_000 });
        await page.locator(".profiles-new").click();
        await page.locator(".profile-sheet").waitFor({ state: "visible", timeout: 10_000 });
        await page.locator('textarea[placeholder="Your name"]').waitFor({ state: "visible", timeout: 10_000 });
        const afterClick = await page.evaluate(() => ({
            activeTag: document.activeElement?.tagName ?? "",
            activePlaceholder: (document.activeElement as HTMLInputElement | null)?.placeholder ?? "",
            text: document.body.innerText.slice(0, 500),
        }));
        const nativeCalls = await interceptedNativeCalls(page, dialogEvents);
        await writeResult("after-mobile-profile-sidebar.json", { url: page.url(), initialSidebar, afterClick, nativeCalls, blockedExternal, pageErrors });
        expect(afterClick.activeTag).toBe("TEXTAREA");
        expect(afterClick.activePlaceholder).toBe("Your name");
        expect(nativeCalls).toEqual([]);
        await context.close();
    });

    it("creates a local session from the public Harvard template and reloads its source", async () => {
        const { context, page, dialogEvents, blockedExternal, pageErrors } = await localPage({ width: 1280, height: 900 });
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await hydration(page, ".template-picker__grid .template-card:not(.template-card--blank)");
        await page.locator(".template-picker").waitFor({ state: "visible" });
        await page.locator(".template-picker__grid .template-card:not(.template-card--blank)").click();
        await page.waitForURL(url => Boolean(url.searchParams.get("s")), { timeout: 10_000 });
        await page.locator(".cm-content").first().waitFor({ state: "visible" });
        const id = new URL(page.url()).searchParams.get("s")!;
        await page.waitForFunction(id => Boolean(localStorage.getItem(`cv-sv:session-backup:${id}`)), id);
        const beforeReload = await page.evaluate(id => JSON.parse(localStorage.getItem(`cv-sv:session-backup:${id}`) || "null"), id);
        await page.screenshot({ path: join(artifacts, "after-desktop-template-session.png"), fullPage: true });
        await page.reload();
        await hydration(page);
        await page.locator(".cm-content").first().waitFor({ state: "visible" });
        const afterReload = await page.evaluate(id => JSON.parse(localStorage.getItem(`cv-sv:session-backup:${id}`) || "null"), id);
        const nativeCalls = await interceptedNativeCalls(page, dialogEvents);
        await writeResult("after-template-session.json", { url: page.url(), id, beforeReload, afterReload, nativeCalls, blockedExternal, pageErrors });
        expect(beforeReload.markdown).toContain("YOUR NAME");
        expect(afterReload.markdown).toBe(beforeReload.markdown);
        expect(nativeCalls).toEqual([]);
        await context.close();
    });

    it("creates a blank local CV on first edit and reloads the saved source", async () => {
        const { context, page, dialogEvents, blockedExternal, pageErrors } = await localPage({ width: 1280, height: 900 });
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await hydration(page);
        await page.locator(".template-picker").waitFor({ state: "visible" });
        await page.getByRole("button", { name: /Blank CV/ }).click();
        await page.locator(".cm-content").first().waitFor({ state: "visible" });
        const editor = page.locator(".cm-content").first();
        await editor.click();
        await editor.press("ControlOrMeta+A");
        await page.keyboard.insertText("# Local blank fixture\n\nEdited only in this browser.");
        await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith("cv-sv:session-backup:")), null, { timeout: 10_000 });
        const saved = await page.evaluate(() => {
            const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).find(key => key?.startsWith("cv-sv:session-backup:"));
            return key ? [key, localStorage.getItem(key)] : null;
        });
        const key = saved![0];
        const id = key.slice("cv-sv:session-backup:".length);
        await page.waitForFunction(id => {
            const doc = JSON.parse(localStorage.getItem(`cv-sv:session-backup:${id}`) || "null");
            return doc?.markdown?.includes("Edited only in this browser.");
        }, id, { timeout: 10_000 });
        const beforeReload = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), key);
        await page.screenshot({ path: join(artifacts, "after-desktop-blank-edit.png"), fullPage: true });
        await page.reload();
        await hydration(page);
        await page.locator(".cm-content").first().waitFor({ state: "visible" });
        const afterReload = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), key);
        const nativeCalls = await interceptedNativeCalls(page, dialogEvents);
        await writeResult("after-blank-session-reload.json", { url: page.url(), id, beforeReload, afterReload, nativeCalls, blockedExternal, pageErrors });
        expect(beforeReload.markdown).toContain("Edited only in this browser.");
        expect(afterReload.markdown).toBe(beforeReload.markdown);
        expect(nativeCalls).toEqual([]);
        await context.close();
    });

    it("persists manual profile-save preference and theme in this browser only", async () => {
        const { context, page, dialogEvents, blockedExternal, pageErrors } = await localPage({ width: 1280, height: 900 });
        await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
        await hydration(page);
        await page.getByText("These settings are saved in this browser only. Sign in to keep them with your account.").waitFor();
        const manual = page.locator('input[name="profile-save-mode"][value="manual"]');
        await manual.focus();
        await page.keyboard.press("Space");
        await page.getByRole("status").getByText("Saved in this browser.").waitFor();
        await page.reload();
        await hydration(page);
        expect(await manual.isChecked()).toBe(true);
        await page.goto(`${baseUrl}/p`);
        await hydration(page);
        await page.getByRole("combobox", { name: "Select theme" }).selectOption("latte");
        await page.waitForFunction(() => localStorage.getItem("theme") === "latte", null, { timeout: 5_000 });
        await page.reload();
        await hydration(page);
        const theme = await page.getByRole("combobox", { name: "Select theme" }).inputValue();
        const localValues = await page.evaluate(() => ({
            preferences: localStorage.getItem("cv-sv:preferences:v1"),
            theme: localStorage.getItem("theme"),
        }));
        const nativeCalls = await interceptedNativeCalls(page, dialogEvents);
        await writeResult("after-preferences-theme-persistence.json", { url: page.url(), theme, localValues, nativeCalls, blockedExternal, pageErrors });
        expect(theme).toBe("latte");
        expect(localValues.preferences).toContain("manual");
        expect(localValues.theme).toBe("latte");
        expect(nativeCalls).toEqual([]);
        await context.close();
    });

    it("keeps anonymous CV edits and preferences local through sign-in UI transition", async () => {
        const { context, page, dialogEvents, blockedExternal, pageErrors } = await localPage({ width: 1280, height: 900 });
        const apiRequests: Array<{ method: string; path: string }> = [];
        const getResources: string[] = [];
        const contentWrites: Array<{ method: string; path: string }> = [];
        page.on("request", request => {
            const url = new URL(request.url());
            if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return;
            const method = request.method();
            const path = url.pathname;
            if (path.startsWith("/api/")) {
                apiRequests.push({ method, path });
                if (["POST", "PUT", "PATCH"].includes(method) && /^\/api\/(?:cvs|cv-profiles|profiles|cloud-copies|cloud-templates|cv-templates)(?:\/|$)/.test(path)) {
                    contentWrites.push({ method, path });
                }
            } else if (method === "GET") {
                getResources.push(path);
            }
        });

        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await hydration(page, ".template-picker__grid .template-card--blank");
        await page.locator(".template-picker__grid .template-card--blank").click();
        await page.locator(".cm-content").first().waitFor({ state: "visible" });
        const editor = page.locator(".cm-content").first();
        await editor.click();
        await editor.press("ControlOrMeta+A");
        await page.keyboard.insertText("# Anonymous local sentinel\n\nNever upload this CV content.");
        await page.waitForFunction(() => Object.keys(localStorage).some(key => key.startsWith("cv-sv:session-backup:")));
        await page.waitForFunction(() => [...Array(localStorage.length)].some((_, index) => {
            const key = localStorage.key(index);
            return Boolean(key?.startsWith("cv-sv:session-backup:") && localStorage.getItem(key)?.includes("Anonymous local sentinel"));
        }));

        await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
        await hydration(page);
        await page.getByText("These settings are saved in this browser only. Sign in to keep them with your account.").waitFor();
        const manual = page.locator('input[name="profile-save-mode"][value="manual"]');
        await manual.focus();
        await page.keyboard.press("Space");
        await page.getByRole("status").getByText("Saved in this browser.").waitFor();
        expect(await manual.isChecked()).toBe(true);

        await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
        await page.getByRole("heading", { name: "Sign in to cv-sv" }).waitFor({ state: "visible" });
        const nativeCalls = await interceptedNativeCalls(page, dialogEvents);
        const trace = { apiRequests, getResources, blockedExternal, contentWrites, nativeCalls, pageErrors };
        await writeResult("anonymous-local-no-upload.json", trace);
        expect(contentWrites).toEqual([]);
        expect(nativeCalls).toEqual([]);
        expect(pageErrors).toEqual([]);
        await context.close();
    });
});
