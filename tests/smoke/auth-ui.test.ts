import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

const baseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
const executablePath = process.env.CHROMIUM_PATH
   ?? (process.platform === "darwin" ? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" : "");
const ui = baseUrl && executablePath && existsSync(executablePath) ? describe : describe.skip;

let browser: Browser;
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

async function waitForAuthDialog(page: Page) {
   await page.getByRole("dialog").waitFor({ state: "visible", timeout: 15_000 });
   await page.getByPlaceholder("Enter your email address").waitFor({ state: "visible", timeout: 15_000 });
}

async function registerLegacySession(context: BrowserContext, label: string) {
   const email = `ui-${label}-${Date.now()}-${Math.random()}@example.com`;
   const response = await context.request.post(`${baseUrl}/api/auth/register`, {
      data: { email, password: "ui-test-password" },
   });
   expect(response.status()).toBe(201);
   return email;
}

beforeAll(async () => {
   if (baseUrl && executablePath && existsSync(executablePath)) {
      browser = await chromium.launch({ executablePath, headless: true });
   }
}, 30_000);

afterAll(async () => {
   await browser?.close();
});

ui("login and sign-up UI flows", () => {
   it("opens sign-in from a protected route and preserves its local destination", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${baseUrl}/settings/cloud-data`);
      await waitForAuthDialog(page);

      expect(new URL(page.url()).pathname).toBe("/login");
      expect(new URL(page.url()).searchParams.get("redirect")).toBe("/settings/cloud-data");
      await page.getByText("Sign in without leaving your current CV workflow.").waitFor();
      expect(await page.getByRole("tab", { name: "Sign in", exact: true }).getAttribute("aria-selected")).toBe("true");
      const socialButtons = page.locator('[class*="cl-socialButtonsIconButton__"]');
      const socialCount = await socialButtons.count();
      // Clerk only renders social providers configured for the deployment. Local
      // smoke runs commonly have none; when configured, verify the expected set.
      if (socialCount > 0) {
         expect(socialCount).toBe(3);
         expect(await page.locator('[class*="cl-socialButtonsIconButton__github"]').count()).toBe(1);
         expect(await page.locator('[class*="cl-socialButtonsIconButton__google"]').count()).toBe(1);
         expect(await page.locator('[class*="cl-socialButtonsIconButton__microsoft"]').count()).toBe(1);
      }
      expect(await page.getByPlaceholder("Enter your password").count()).toBe(1);
      await context.close();
   });

   it("switches between sign-in and sign-up without leaving the current route", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${baseUrl}/login`);
      await waitForAuthDialog(page);

      await page.getByRole("tab", { name: "Create account", exact: true }).click();
      await page.getByText("Create an account to access optional cloud features").waitFor();
      await page.getByPlaceholder("Create a password").waitFor();
      expect(new URL(page.url()).pathname).toBe("/login");

      await page.getByRole("tab", { name: "Sign in", exact: true }).click();
      await page.getByPlaceholder("Enter your password").waitFor();
      await context.close();
   });

   it("dismisses the dialog safely and returns the deep-link bridge to the editor", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${baseUrl}/login?mode=signup`);
      await waitForAuthDialog(page);

      await page.getByRole("button", { name: "Close" }).click();
      await page.waitForURL(`${baseUrl}/`);
      expect(await page.getByRole("dialog").count()).toBe(0);
      await context.close();
   });
});

ui("authenticated and unauthenticated data-ownership UI", () => {
   it("lets an authenticated owner change consent and persists only that owner's view", async () => {
      const aliceContext = await browser.newContext();
      aliceContext.setDefaultTimeout(5_000);
      const aliceEmail = await registerLegacySession(aliceContext, "alice");
      const alicePage = await aliceContext.newPage();
      await alicePage.goto(`${baseUrl}/settings/cloud-data`);
      await alicePage.getByRole("heading", { name: "Cloud data" }).waitFor();
      await alicePage.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: unknown })?.__vue_app__));
      await alicePage.getByText(aliceEmail).waitFor();

      const aliceSessionConsent = alicePage.locator("label.consent-card", { hasText: "Cloud session recovery" }).getByRole("checkbox");
      expect(await aliceSessionConsent.isChecked()).toBe(false);
      const saveResponse = alicePage.waitForResponse(response =>
         response.url().endsWith("/api/cloud-data/consent") && response.request().method() === "PUT");
      // Clicking the card title (not just the checkbox) must toggle consent.
      await alicePage.getByRole("heading", { name: "Cloud session recovery" }).click();
      expect((await saveResponse).status()).toBe(200);
      await alicePage.locator("label.consent-card", { hasText: "Cloud session recovery" }).getByText("Allowed", { exact: true }).waitFor();
      await alicePage.reload();
      expect(await alicePage.locator("label.consent-card", { hasText: "Cloud session recovery" }).getByRole("checkbox").isChecked()).toBe(true);

      const bobContext = await browser.newContext();
      bobContext.setDefaultTimeout(5_000);
      await registerLegacySession(bobContext, "bob");
      const bobPage = await bobContext.newPage();
      await bobPage.goto(`${baseUrl}/settings/cloud-data`);
      await bobPage.getByRole("heading", { name: "Cloud data" }).waitFor();
      await bobPage.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: unknown })?.__vue_app__));
      expect(await bobPage.locator("label.consent-card", { hasText: "Cloud session recovery" }).getByRole("checkbox").isChecked()).toBe(false);
      expect(await bobPage.locator("label.consent-card", { hasText: "Cloud templates" }).getByRole("checkbox").isChecked()).toBe(false);

      await aliceContext.close();
      await bobContext.close();
   });
});
