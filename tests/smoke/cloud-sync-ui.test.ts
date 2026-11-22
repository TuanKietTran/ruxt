import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { clerkTestSecret, createClerkTestUser, deleteClerkTestUser, signInPage, type ClerkTestUser } from "../helpers/clerk-e2e";
import { readLocalCv, seedLocalCv } from "../helpers/local-cv";

/**
 * Two devices (two separate browser profiles) of one real Clerk account, a real server and a real cloud-copy
 * store: upload a session from one, download it on the other, make both change the same line, and resolve the
 * resulting conflict in the UI piece by piece. Needs cloud retention configured on the server
 * (NUXT_CLOUD_RETENTION_*, see tests/e2e/README.md) and the dev-server Clerk setup of tests/helpers/clerk-e2e.ts.
 */
const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (base && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Sync UI tests create Clerk users and need a local server");
const executablePath = process.env.CHROMIUM_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const secret = clerkTestSecret();
const ui = base && secret && existsSync(executablePath) ? describe : describe.skip;

let browser: Browser;
let user: ClerkTestUser | null = null;
vi.setConfig({ testTimeout: 240_000, hookTimeout: 30_000 });
beforeAll(async () => { if (ui === describe) browser = await chromium.launch({ executablePath, headless: true }); });
afterAll(async () => { await browser?.close(); if (user) await deleteClerkTestUser(secret!, user); });

const baseMarkdown = "# Name\n\nSummary one\n\n## Skills\n\n- A\n- B";
const css = ".r { color: #123456; }";
const ID = "sync-cv";

async function ready(page: Page) {
   await page.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: unknown })?.__vue_app__));
   await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded));
}

async function device(label: string, seed: boolean): Promise<{ context: BrowserContext; page: Page }> {
   const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
   if (seed) await seedLocalCv(context, { id: ID, markdown: baseMarkdown, css, title: "Sync CV" });
   const page = await context.newPage();
   page.setDefaultTimeout(30_000);
   page.on("pageerror", error => { throw new Error(`${label}: ${error.message}`); });
   await page.goto(`${base}/`);
   await ready(page);
   await signInPage(secret!, page, user!);
   await page.locator('[data-account-action="sign-out"]:visible').first().waitFor();
   return { context, page };
}

async function openRecords(page: Page) {
   await page.goto(`${base}/settings/cloud-data`);
   await ready(page);
   await page.getByRole("button", { name: "Records" }).click();
}

const checkbox = (page: Page) => page.getByRole("checkbox", { name: /Sync CV/ }).locator("visible=true").first();
const badge = (page: Page) => page.locator(".records-table tbody tr", { hasText: "Sync CV" }).locator("td").nth(3);

/** Type at the end of the last line ("- B") in the editor, as a user would. */
async function editLastLine(page: Page, suffix: string) {
   await page.goto(`${base}/?s=${ID}`);
   await ready(page);
   await page.locator(".cm-content").first().click();
   await page.keyboard.press("Control+End");
   await page.keyboard.press("Meta+ArrowDown");
   await page.keyboard.press("End");
   await page.keyboard.type(suffix);
   await page.getByText("Saved locally").first().waitFor();
}

ui("cloud sync across two devices, in the UI", () => {
   it("uploads from one device, downloads on another, and resolves a real conflict piece by piece", async () => {
      user = await createClerkTestUser(secret!, "syncui");
      const a = await device("device A", true);
      const consentReady = await a.context.request.post(`${base}/api/cloud-data/retention-acknowledgement`);
      if (consentReady.status() !== 200) return; // cloud retention is not configured on this server
      expect((await a.context.request.put(`${base}/api/cloud-data/consent`, { data: { category: "cloudSessions", granted: true } })).status()).toBe(200);

      // Device A selects the session and uploads it.
      await openRecords(a.page);
      await checkbox(a.page).check();
      await a.page.getByRole("button", { name: /^Upload \(1\)/ }).click();
      await a.page.getByRole("button", { name: "Confirm upload" }).click();
      await a.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByText("Synced", { exact: true }).waitFor();

      // Device B sees it only in the cloud and downloads it; nothing is uploaded from B, nothing local is replaced.
      const b = await device("device B", false);
      await openRecords(b.page);
      await b.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).waitFor();
      await checkbox(b.page).check();
      await b.page.getByRole("button", { name: /^Download \(1\)/ }).click();
      await b.page.getByRole("button", { name: "Confirm download" }).click();
      await b.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByText("Synced", { exact: true }).waitFor();
      expect((await readLocalCv(b.page, ID))?.markdown).toBe(baseMarkdown);

      // B edits the last line and goes offline; A edits the same line and uploads while B is away.
      await editLastLine(b.page, " (from B)");
      await b.context.setOffline(true);
      await editLastLine(a.page, " (from A)");
      await expect.poll(async () => {
         const copy = await a.context.request.get(`${base}/api/cloud-data/copies/session/${ID}`);
         return copy.status() === 200 ? JSON.stringify(await copy.json()).includes("(from A)") : false;
      }, { timeout: 120_000, intervals: [2_000] }).toBe(true);

      // B reconnects. Its change collides with A's: both versions are kept and B is offered the review.
      await b.context.setOffline(false);
      await openRecords(b.page);
      await b.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByRole("button", { name: "Resolve" }).waitFor({ timeout: 120_000 });
      expect((await readLocalCv(b.page, ID))?.markdown).toContain("(from B)");
      await b.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByRole("button", { name: "Resolve" }).click();

      const review = b.page.getByRole("dialog", { name: /Review: Sync CV/ });
      await review.waitFor();
      await review.getByText(/1 piece was changed differently/).waitFor();
      await review.getByText("- B (from A)").first().waitFor();
      await review.getByText("- B (from B)").first().waitFor();
      // Nothing is applied until the conflicting change has a choice.
      const apply = review.getByRole("button", { name: "Apply my choices" });
      expect(await apply.isDisabled()).toBe(true);
      await review.getByText("1 choice left").waitFor();
      await review.getByRole("radiogroup", { name: /Content \(content.md\), change 1/ }).getByLabel("Both").check();
      expect(await apply.isDisabled()).toBe(false);
      await apply.click();

      // The merged text keeps both people's words and is now the shared version.
      // The review closes and the conflict list is empty again; the record is no longer waiting on anything.
      await b.page.getByText(/^No conflicts\./).waitFor({ timeout: 30_000 });
      await b.page.getByRole("button", { name: "Records" }).click();
      await b.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByText("Synced", { exact: true }).waitFor({ timeout: 60_000 });
      const merged = (await readLocalCv(b.page, ID))?.markdown as string;
      expect(merged).toContain("- B (from A)");
      expect(merged).toContain("- B (from B)");
      await expect.poll(async () => {
         const copy = await b.context.request.get(`${base}/api/cloud-data/copies/session/${ID}`);
         const text = JSON.stringify(await copy.json());
         return text.includes("(from A)") && text.includes("(from B)");
      }, { timeout: 60_000, intervals: [2_000] }).toBe(true);

      // Selective restoration: an earlier cloud version comes back as a NEW local record; the current one is untouched.
      const before = await b.page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("cv-sv:session-backup:")).length);
      await b.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByRole("button", { name: "History" }).click();
      const history = b.page.getByRole("dialog", { name: /History: Sync CV/ });
      await history.waitFor();
      await history.getByRole("button", { name: /^Restore .* as copy$/ }).last().click();
      await expect.poll(() => b.page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("cv-sv:session-backup:")).length), { timeout: 30_000 }).toBe(before + 1);
      expect((await readLocalCv(b.page, ID))?.markdown).toBe(merged);
      await a.context.close();
      await b.context.close();
   });
});
