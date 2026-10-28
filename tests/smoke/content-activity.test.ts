import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { readLocalCv, seedLocalCv } from "../helpers/local-cv";

const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (base && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Local CV tests require a local server");
const executablePath = process.env.CHROMIUM_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const ui = base && existsSync(executablePath) ? describe : describe.skip;
let browser: Browser;
vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });
beforeAll(async () => { if (ui === describe) browser = await chromium.launch({ executablePath, headless: true }); });
afterAll(async () => { await browser?.close(); });
const protectedRoute = /\/api\/(?:cvs|cv-profiles|cloud-data|preferences|cv-templates|cv-imports|cloud-sessions|cv-capabilities|cv-applications|cv-artifacts)(?:\/|\?|$)/;

ui("local CV security and durability", () => {
    it("performs a full anonymous lifecycle with zero authenticated API requests", async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        const requests: string[] = [];
        const errors: string[] = [];
        page.on("request", request => { if (protectedRoute.test(request.url())) requests.push(request.method() + " " + new URL(request.url()).pathname); });
        page.on("pageerror", error => errors.push(error.message));
        await page.addInitScript(() => {
            if (window.top !== window) return;
            if (!localStorage.getItem("cv-sv:local-profiles:v1")) localStorage.setItem("cv-sv:local-profiles:v1", JSON.stringify([{
                version: 1, id: "profile-synthetic", createdAt: 1000, updatedAt: 1000,
                identity: { fullName: "Synthetic Candidate", headline: "Engineer", summary: "Synthetic summary", location: "" },
                contacts: [], experiences: [], skills: [], certifications: [], education: [], projects: [], languages: [],
            }]));
        });
        await page.goto(base!);
        await page.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: unknown })?.__vue_app__));
        await page.getByRole("button", { name: /Blank CV/ }).click();
        const editor = page.locator(".cm-content").first();
        try { await editor.click(); } catch {
            throw new Error(JSON.stringify({ errors, pickerVisible: await page.locator(".template-picker").isVisible(), pathname: new URL(page.url()).pathname }));
        }
        await editor.press("ControlOrMeta+A");
        await page.keyboard.insertText(":::resume\n\n# Local Example {.cv-name}\n\nEdited locally.\n\n:::");
        await page.waitForURL(/\?s=/);
        const id = new URL(page.url()).searchParams.get("s")!;
        await page.locator(".save-state--saved").waitFor();
        expect((await readLocalCv(page, id)).markdown).toContain("Edited locally");
        await page.locator(".preview-page").getByText("Edited locally.").first().waitFor();
        const row = () => page.locator(`.document-tree__item[href*="${id}"]`);
        await row().click({ button: "right" });
        await page.locator(".document-context-menu").getByRole("button", { name: "Rename", exact: true }).click();
        await page.getByLabel("Session name").fill("Renamed local");
        await page.getByRole("dialog", { name: "Rename session" }).getByRole("button", { name: "Rename", exact: true }).click();
        expect((await readLocalCv(page, id)).title).toBe("Renamed local");
        await page.getByLabel("Switch profile").selectOption("profile-synthetic");
        await page.getByRole("dialog", { name: "Review profile overwrite" }).waitFor();
        expect(await page.locator(".switch-diff").textContent()).toContain("Synthetic Candidate");
        await page.getByRole("checkbox", { name: /I reviewed this before\/after preview/ }).check();
        await page.getByRole("button", { name: "Confirm switch", exact: true }).click();
        await page.getByRole("button", { name: "Undo switch", exact: true }).waitFor();
        expect((await readLocalCv(page, id)).markdown).toContain("Synthetic Candidate");
        await page.getByRole("button", { name: "Undo switch", exact: true }).click();
        await page.getByRole("dialog", { name: "Review profile overwrite" }).getByRole("button", { name: "Cancel", exact: true }).click();
        await page.locator(".cm-content").first().click();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.insertText("\nPending fork edit");
        await row().click({ button: "right" });
        await page.locator(".document-context-menu").getByRole("button", { name: "Fork", exact: true }).click();
        await page.waitForURL(url => url.searchParams.get("s") !== id);
        const fork = new URL(page.url()).searchParams.get("s")!;
        expect((await readLocalCv(page, fork)).markdown).toContain("Pending fork edit");
        await page.locator(".cm-content").first().click();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.insertText("\nDelete with a pending edit");
        page.on("dialog", dialog => { void dialog.accept(); });
        await page.locator(`.document-tree__item[href*="${fork}"]`).click({ button: "right" });
        await page.locator(".document-context-menu").getByRole("button", { name: "Delete", exact: true }).click();
        await page.waitForURL(url => !url.searchParams.has("s"));
        expect(await readLocalCv(page, fork)).toBeNull();
        await page.goto(`${base}/settings`);
        await page.getByRole("heading", { name: "Preferences" }).waitFor();
        await page.getByRole("radio", { name: /Save with a button/ }).check();
        await page.goto(`${base}/p`);
        await page.locator(".profile-card").first().waitFor();
        expect(requests).toHaveLength(0);
        expect(errors).toEqual([]);
        await context.close();
    });

    it("clones a public template privately in this browser without account requests", async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        let requests = 0;
        page.on("request", request => { if (protectedRoute.test(request.url())) requests++; });
        await page.goto(`${base}/?t=template-harvard&v=1`);
        await page.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: unknown })?.__vue_app__));
        await page.getByRole("button", { name: "Clone to local", exact: true }).click();
        await page.waitForURL(url => url.searchParams.get("t") !== "template-harvard");
        const id = new URL(page.url()).searchParams.get("t");
        expect(id).toBeTruthy();
        const copies = await page.evaluate(() => JSON.parse(localStorage.getItem("cv-sv:local-templates:v1") || "[]"));
        expect(copies).toHaveLength(1);
        expect(copies[0]).toMatchObject({ id, tags: ["local"], builtIn: false });
        await page.reload();
        await page.locator(".template-readonly-label").filter({ hasText: "local" }).waitFor();
        expect(new URL(page.url()).searchParams.get("t")).toBe(id);
        expect(requests).toBe(0);
        await context.close();
    });

    it("surfaces quota errors without dropping the editor content or stored copy", async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await seedLocalCv(context, { id: "quota-example", markdown: "# Original {.cv-name}", css: "" });
        await page.goto(`${base}/?s=quota-example`);
        const editor = page.locator(".cm-content").first();
        await editor.waitFor();
        const before = await readLocalCv(page, "quota-example");
        await page.evaluate(() => {
            const original = Storage.prototype.setItem;
            (window as Window & { restoreStorage?: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
            Storage.prototype.setItem = function (key, value) {
                if (this === localStorage && key.startsWith("cv-sv:")) throw new DOMException("Full", "QuotaExceededError");
                original.call(this, key, value);
            };
        });
        await editor.click(); await editor.press("ControlOrMeta+A");
        await page.keyboard.insertText("# Unsaved content stays here");
        await page.getByRole("alert").filter({ hasText: "Save failed" }).waitFor();
        expect(await editor.textContent()).toContain("Unsaved content stays here");
        expect(await readLocalCv(page, "quota-example")).toEqual(before);
        await page.getByRole("link", { name: "Profile editor", exact: true }).click();
        await page.getByRole("link", { name: "CV editor", exact: true }).click();
        await page.getByRole("alert").filter({ hasText: "Save failed" }).waitFor();
        expect(await page.locator(".cm-content").first().textContent()).toContain("Unsaved content stays here");
        expect(await readLocalCv(page, "quota-example")).toEqual(before);
        await page.evaluate(() => (window as Window & { restoreStorage?: () => void }).restoreStorage?.());
        await page.locator(".save-state--saved").waitFor();
        expect((await readLocalCv(page, "quota-example")).markdown).toContain("Unsaved content stays here");
        await page.reload();
        await page.locator(".cm-content").first().waitFor();
        expect(await page.locator(".cm-content").first().textContent()).toContain("Unsaved content stays here");
        await context.close();
    });

    it("flushes on pagehide, refreshes another tab and survives reload without CV requests", async () => {
        const context = await browser.newContext();
        await seedLocalCv(context, { id: "flush-example", markdown: "# Original {.cv-name}", css: "" });
        let requests = 0;
        context.on("request", request => { if (protectedRoute.test(request.url())) requests++; });
        const first = await context.newPage();
        const second = await context.newPage();
        await first.goto(`${base}/?s=flush-example`);
        await first.locator(".cm-content").first().waitFor();
        await second.goto(`${base}/?s=flush-example`);
        await second.locator(".cm-content").first().waitFor();
        const editor = first.locator(".cm-content").first();
        await editor.click(); await editor.press("ControlOrMeta+A");
        await first.keyboard.insertText("# Flushed immediately {.cv-name}");
        await first.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
        expect((await readLocalCv(first, "flush-example")).markdown).toContain("Flushed immediately");
        await expect.poll(() => second.locator(".cm-content").first().textContent()).toContain("Flushed immediately");
        await second.reload();
        await expect.poll(() => second.locator(".cm-content").first().textContent()).toContain("Flushed immediately");
        expect(requests).toBe(0);
        await context.close();
    });

    it("quietly falls back locally after a mid-session 401 with no retries or lost data", async () => {
        const context = await browser.newContext();
        const response = await context.request.post(`${base}/api/auth/register`, { data: { email: `synthetic-expiry-${Date.now()}@example.com`, password: "synthetic-test-password" } });
        expect(response.status()).toBe(201);
        const page = await context.newPage();
        await seedLocalCv(context, { id: "expiry-example", markdown: "# Kept locally", css: "" });
        let requests = 0;
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/api/preferences", async route => {
            requests++;
            if (route.request().method() === "PUT") await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ statusCode: 401 }) });
            else await route.continue();
        });
        await page.goto(`${base}/settings`);
        await page.getByText(/these settings are saved to your account/i).waitFor();
        await page.getByRole("radio", { name: /Save with a button/ }).check();
        await page.getByText("These settings are saved in this browser only.", { exact: false }).waitFor();
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cv-sv:preferences:v1") || "{}").profileSaveMode)).toBe("manual");
        await page.getByRole("radio", { name: /Save automatically/ }).check();
        await page.waitForTimeout(2200);
        expect(requests).toBe(2);
        expect(new URL(page.url()).pathname).toBe("/settings");
        expect(await page.getByRole("alert").count()).toBe(0);
        expect((await readLocalCv(page, "expiry-example")).markdown).toBe("# Kept locally");
        expect(errors).toEqual([]);
        await context.close();
    });
});
