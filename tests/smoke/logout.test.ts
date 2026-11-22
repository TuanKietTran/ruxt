import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { clerkTestSecret, clerkUserId, createClerkTestUser, deleteClerkTestUser, revokeClerkSession, signInPage, type ClerkTestUser } from "../helpers/clerk-e2e";
import { readLocalCv, seedLocalCv } from "../helpers/local-cv";

/**
 * Sign-out against a real Clerk development instance and a real server (no mocks). Skipped unless
 * SMOKE_BASE_URL points at a local server, a browser exists, and a Clerk dev secret is available (see
 * tests/helpers/clerk-e2e.ts). A skipped run establishes no coverage.
 */
const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (base && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Sign-out tests create Clerk users and need a local server");
const executablePath = process.env.CHROMIUM_PATH
   ?? (process.platform === "darwin" ? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" : "");
const secret = clerkTestSecret();
const ui = base && secret && executablePath && existsSync(executablePath) ? describe : describe.skip;

let browser: Browser;
const users: ClerkTestUser[] = [];
vi.setConfig({ testTimeout: 90_000, hookTimeout: 30_000 });

beforeAll(async () => {
   if (ui === describe) browser = await chromium.launch({ executablePath, headless: true });
}, 30_000);
afterAll(async () => {
   await browser?.close();
   await Promise.all(users.map(user => deleteClerkTestUser(secret!, user)));
});

const css = ".resume { padding: 24px; } .resume h1 { color: #123456; }";
const markdown = ":::resume\n\n# Kept Across Sign-out {.cv-name}\n\n## Summary\n\nLocal work that must survive.\n\n:::\n";

async function newUser(label: string) {
   const user = await createClerkTestUser(secret!, label);
   users.push(user);
   return user;
}

async function open(page: Page, path: string) {
   await page.goto(`${base}${path}`);
   await page.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: unknown })?.__vue_app__));
   await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded));
}

const signOutControls = (page: Page) => page.locator('[data-account-action="sign-out"]:visible');

/** Click the first visible sign-out control and wait until the sign-out has fully finished. */
async function signOut(page: Page) {
   await signOutControls(page).first().click();
   await page.getByText(/^Signed out\./).first().waitFor({ timeout: 30_000 });
}

async function expectSignedOutUi(page: Page) {
   await page.waitForFunction(() => document.querySelectorAll('[data-account-action="sign-out"]').length === 0, null, { timeout: 20_000 });
   expect(await signOutControls(page).count()).toBe(0);
}

async function expectServerSignedOut(context: BrowserContext) {
   expect((await context.request.get(`${base}/api/auth/me`)).status()).toBe(401);
   expect((await context.request.get(`${base}/api/cloud-data/consent`)).status()).toBe(401);
   expect((await context.request.get(`${base}/api/preferences`)).status()).toBe(401);
}

ui("sign-out with a real Clerk session", () => {
   it("offers sign-out right after an in-page sign-in, with no reload", async () => {
      const user = await newUser("inpage");
      const context = await browser.newContext();
      const page = await context.newPage();
      await open(page, "/");
      expect(await page.locator('[data-account-action="sign-in"]:visible').count()).toBe(1);
      expect(await signOutControls(page).count()).toBe(0);

      await signInPage(secret!, page, user);
      await signOutControls(page).first().waitFor({ timeout: 20_000 });
      // Header button and activity-bar icon both name the account.
      expect(await signOutControls(page).count()).toBe(2);
      // The control appears from Clerk's session; /api/auth/me then names the account in its label.
      await page.waitForFunction((label) => document.querySelector('[data-account-action="sign-out"]')?.getAttribute("aria-label") === label, `Sign out ${user.email}`, { timeout: 20_000 });
      expect((await context.request.get(`${base}/api/auth/me`)).status()).toBe(200);

      // A signed-in page load hydrates cleanly: the sync status the browser adds later must not mismatch the server HTML.
      const hydration: string[] = [];
      page.on("console", message => { if (/hydration/i.test(message.text())) hydration.push(message.text()); });
      await page.reload();
      await signOutControls(page).first().waitFor({ timeout: 20_000 });
      await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded));
      await page.waitForTimeout(2_000);
      expect(hydration).toEqual([]);
      await context.close();
   });

   const routes: Array<{ name: string; path: string; staysOnPage: boolean; lands?: string }> = [
      { name: "CV editor (template picker)", path: "/", staysOnPage: true },
      { name: "CV editor (open session)", path: "/?s=logout-session", staysOnPage: true },
      { name: "legacy editor deep link (redirects to the session)", path: "/e/logout-session", staysOnPage: true, lands: "/" },
      { name: "profile editor", path: "/p", staysOnPage: true },
      { name: "job automation workspace", path: "/jobs", staysOnPage: true },
      { name: "settings", path: "/settings", staysOnPage: true },
      { name: "help", path: "/about", staysOnPage: true },
      { name: "cloud data (account-only page)", path: "/settings/cloud-data", staysOnPage: false },
      { name: "account management (account-only page)", path: "/settings/account", staysOnPage: false },
   ];

   for (const route of routes) {
      it(`signs out from ${route.name}, keeps local work, and the server stops answering`, async () => {
         const user = await newUser("route");
         const context = await browser.newContext();
         await seedLocalCv(context, { id: "logout-session", markdown, css, title: "Kept Across Sign-out" });
         const page = await context.newPage();
         const errors: string[] = [];
         page.on("pageerror", error => errors.push(error.message));
         await open(page, "/");
         await signInPage(secret!, page, user);
         await signOutControls(page).first().waitFor({ timeout: 20_000 });
         await open(page, route.path);
         await signOutControls(page).first().waitFor({ timeout: 20_000 });

         await signOut(page);
         await expectSignedOutUi(page);
         expect(await clerkUserId(page)).toBeNull();
         if (route.staysOnPage) expect(new URL(page.url()).pathname).toBe(route.lands ?? new URL(route.path, base).pathname);
         else await page.waitForURL(url => new URL(url).pathname === "/");
         await expectServerSignedOut(context);

         // Local work is untouched, and a reload still shows a signed-out app.
         expect((await readLocalCv(page, "logout-session"))?.markdown).toBe(markdown);
         await page.reload();
         await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded));
         expect(await signOutControls(page).count()).toBe(0);
         expect((await readLocalCv(page, "logout-session"))?.markdown).toBe(markdown);
         expect(errors).toEqual([]);
         await context.close();
      });
   }

   it("shows Clerk's account management to a signed-in user, and only to them", async () => {
      const user = await newUser("account");
      const context = await browser.newContext();
      const page = await context.newPage();
      await open(page, "/settings/account");
      await page.waitForURL(url => new URL(url).pathname === "/login");
      expect(new URL(page.url()).searchParams.get("redirect")).toBe("/settings/account");
      await open(page, "/");
      await signInPage(secret!, page, user);
      await signOutControls(page).first().waitFor({ timeout: 20_000 });
      await open(page, "/settings/account");
      await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
      // Clerk's profile component lists the account's email address.
      await page.getByText(user.email, { exact: false }).first().waitFor({ timeout: 30_000 });
      await page.getByText("Profile details", { exact: false }).first().waitFor({ timeout: 30_000 });
      await context.close();
   });

   it("signs out from the activity bar on a phone-sized screen where header buttons are hidden", async () => {
      const user = await newUser("phone");
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await open(page, "/");
      await signInPage(secret!, page, user);
      await signOutControls(page).first().waitFor({ timeout: 20_000 });
      // Only the activity-bar icon is visible at this width.
      expect(await signOutControls(page).count()).toBe(1);
      await signOutControls(page).first().tap();
      await page.getByText(/^Signed out\./).first().waitFor({ timeout: 30_000 });
      await expectSignedOutUi(page);
      await expectServerSignedOut(context);
      await context.close();
   });

   it("signs every open tab out and leaves local work in place", async () => {
      const user = await newUser("tabs");
      const context = await browser.newContext();
      await seedLocalCv(context, { id: "logout-session", markdown, css, title: "Kept Across Sign-out" });
      const first = await context.newPage();
      await open(first, "/");
      await signInPage(secret!, first, user);
      await signOutControls(first).first().waitFor({ timeout: 20_000 });
      const second = await context.newPage();
      await open(second, "/p");
      await signOutControls(second).first().waitFor({ timeout: 20_000 });

      await signOut(first);
      await expectSignedOutUi(first);
      // No reload in the second tab: it learns about the sign-out on its own.
      await second.bringToFront();
      await expectSignedOutUi(second);
      expect((await readLocalCv(second, "logout-session"))?.markdown).toBe(markdown);
      await expectServerSignedOut(context);
      await context.close();
   });

   it("follows a sign-in and an account switch made in another tab", async () => {
      const alice = await newUser("alice");
      const bob = await newUser("bob");
      const context = await browser.newContext();
      const first = await context.newPage();
      await open(first, "/");
      await signInPage(secret!, first, alice);
      await signOutControls(first).first().waitFor({ timeout: 20_000 });
      const second = await context.newPage();
      await open(second, "/");
      await signOutControls(second).first().waitFor({ timeout: 20_000 });

      // Alice signs out in the second tab, and Bob signs in there. ClerkJS tells the first tab only about
      // the sign-out; the app notices the new account from the browser's session cookie.
      await signOut(second);
      await signInPage(secret!, second, bob);
      await second.waitForFunction((label) => document.querySelector('[data-account-action="sign-out"]')?.getAttribute("aria-label") === label, `Sign out ${bob.email}`, { timeout: 20_000 });

      await first.waitForFunction((label) => document.querySelector('[data-account-action="sign-out"]')?.getAttribute("aria-label") === label, `Sign out ${bob.email}`, { timeout: 30_000 });
      await first.waitForFunction((id) => (window as unknown as { Clerk?: { user?: { id: string } | null } }).Clerk?.user?.id === id, bob.id, { timeout: 20_000 });
      expect(await signOutControls(first).count()).toBeGreaterThan(0);
      await context.close();
   });

   it("stays signed in and says so when offline, then signs out once the network returns", async () => {
      const user = await newUser("offline");
      const context = await browser.newContext();
      await seedLocalCv(context, { id: "logout-session", markdown, css, title: "Kept Across Sign-out" });
      const page = await context.newPage();
      await open(page, "/?s=logout-session");
      await signInPage(secret!, page, user);
      await signOutControls(page).first().waitFor({ timeout: 20_000 });

      await context.setOffline(true);
      await signOutControls(page).first().click();
      await page.getByText(/you are offline.*still signed in/i).waitFor({ timeout: 20_000 });
      expect(await signOutControls(page).count()).toBeGreaterThan(0);
      expect(await clerkUserId(page)).toBe(user.id);
      expect((await readLocalCv(page, "logout-session"))?.markdown).toBe(markdown);

      await context.setOffline(false);
      await signOut(page);
      await expectSignedOutUi(page);
      await expectServerSignedOut(context);
      await context.close();
   });

   it("treats a session that ended on the server as signed out and rejects account requests", async () => {
      const user = await newUser("expired");
      const context = await browser.newContext();
      await seedLocalCv(context, { id: "logout-session", markdown, css, title: "Kept Across Sign-out" });
      const page = await context.newPage();
      await open(page, "/?s=logout-session");
      await signInPage(secret!, page, user);
      await signOutControls(page).first().waitFor({ timeout: 20_000 });

      // The session is revoked (expiry, an administrator, a password reset). ClerkJS finds out on its next
      // token refresh, which this forces; the app must then drop the account without any click.
      await revokeClerkSession(secret!, page);
      await page.evaluate(() => (window as unknown as { Clerk: { session: { getToken(options: object): Promise<unknown> } } }).Clerk.session.getToken({ skipCache: true }).catch(() => undefined));
      await expectSignedOutUi(page);
      await page.getByText(/^You were signed out\./).first().waitFor({ timeout: 20_000 });
      expect(await clerkUserId(page)).toBeNull();
      expect((await readLocalCv(page, "logout-session"))?.markdown).toBe(markdown);

      // Once the short-lived token cookie is gone, the server refuses the account APIs too.
      await context.clearCookies({ name: /^__session|^__client_uat/ });
      await expectServerSignedOut(context);
      await page.reload();
      await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded));
      expect(await signOutControls(page).count()).toBe(0);
      expect((await readLocalCv(page, "logout-session"))?.markdown).toBe(markdown);
      await context.close();
   });
});
