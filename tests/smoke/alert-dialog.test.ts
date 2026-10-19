import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";

const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (base && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Alert dialog regression requires a local server");
const executablePath = process.env.CHROMIUM_PATH ?? (process.platform === "darwin" ? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" : "");
const ui = base && executablePath && existsSync(executablePath) ? describe : describe.skip;
let browser: Browser;
beforeAll(async () => { if (base && executablePath && existsSync(executablePath)) browser = await chromium.launch({ executablePath, headless: true }); });
afterAll(async () => { await browser?.close(); });

ui("subscription cancellation error dialog", () => {
    it("shows the API message as text, focuses dismissal, and restores focus on Escape", async () => {
        const context = await browser.newContext();
        const userId = "demo";
        const page = await context.newPage();
        page.setDefaultTimeout(5_000);
        const plan = { id: "fixture-plan", name: "Fixture plan", provider: "Fixture", billingCycle: "monthly", price: { amountMinor: 1200, currency: "USD" } };
        const subscription = { id: "fixture-subscription", userId, planId: plan.id, status: "active", startedAt: new Date().toISOString(), currentPeriodStart: new Date().toISOString(), currentPeriodEnd: new Date(Date.now() + 86400000).toISOString(), trialEndsAt: null, cancelledAt: null, pausedAt: null, nextIntervalPlanId: null };
        const apiMessage = "<img src=x onerror=alert(1)> Cancellation service unavailable.";
        let cancelRequests = 0;
        await page.route("**/api/plans**", route => route.fulfill({ json: { plans: [plan] } }));
        await page.route("**/api/subscriptions**", async route => {
            if (route.request().url().endsWith("/cancel")) {
                cancelRequests++;
                await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: apiMessage }) });
            } else await route.fulfill({ json: { subscriptions: [subscription] } });
        });
        try {
            await page.goto(`${base}/about`, { waitUntil: "domcontentloaded", timeout: 15_000 });
            await page.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: unknown })?.__vue_app__));
            await page.evaluate(() => {
                const app = (document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: any }).__vue_app__;
                return app.config.globalProperties.$router.push("/d?userId=demo");
            });
            await page.waitForURL(/\/d\?userId=demo/);
            const cancelButton = page.getByRole("button", { name: "Cancel subscription" });
            await cancelButton.waitFor({ state: "visible" });
            page.once("dialog", dialog => { void dialog.accept(); });
            await cancelButton.click();
            const dialog = page.getByRole("alertdialog", { name: "Cancellation failed" });
            await dialog.waitFor({ state: "visible" });
            await expect.poll(() => dialog.locator("#cancel-error-message").textContent()).toBe(apiMessage);
            expect(await dialog.locator("img").count()).toBe(0);
            const dismiss = dialog.getByRole("button", { name: "Dismiss" });
            expect(await dismiss.evaluate(element => element === document.activeElement)).toBe(true);
            await page.keyboard.press("Escape");
            await expect.poll(() => dialog.count()).toBe(0);
            expect(await cancelButton.evaluate(element => element === document.activeElement)).toBe(true);

            page.once("dialog", nativeDialog => { void nativeDialog.accept(); });
            await cancelButton.click();
            await dialog.waitFor({ state: "visible" });
            await dismiss.click();
            await expect.poll(() => dialog.count()).toBe(0);
            expect(cancelRequests).toBe(2);
        } finally {
            await context.close();
        }
    }, 30_000);
});
