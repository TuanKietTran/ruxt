import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { clerkTestSecret, createClerkTestUser, deleteClerkTestUser, signInPage, type ClerkTestUser } from "../helpers/clerk-e2e";
import { readLocalCv, readLocalProfilesRaw, seedLocalCv, seedLocalProfiles } from "../helpers/local-cv";

/**
 * Two devices (two separate browser profiles) of one real Clerk account, a real server and a real cloud-copy
 * store. With consent granted, records sync by themselves in both directions: a second browser with empty
 * storage shows every record after one sync with no clicks, a different local record is never overwritten,
 * and each kind has its own cap. Also: both devices change the same line and resolve the conflict piece by
 * piece. Needs cloud retention configured on the server (NUXT_CLOUD_RETENTION_*, see tests/e2e/README.md), the
 * dev-server Clerk setup of tests/helpers/clerk-e2e.ts and, for the quota case, NUXT_CLOUD_COPY_LIMITS_SESSION=2.
 */
const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (base && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Sync UI tests create Clerk users and need a local server");
const executablePath = process.env.CHROMIUM_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const secret = clerkTestSecret();
const ui = base && secret && existsSync(executablePath) ? describe : describe.skip;

let browser: Browser;
let user: ClerkTestUser | null = null;
const created: ClerkTestUser[] = [];
const newUser = async (label: string) => { user = await createClerkTestUser(secret!, label); created.push(user); return user; };
vi.setConfig({ testTimeout: 240_000, hookTimeout: 30_000 });
beforeAll(async () => { if (ui === describe) browser = await chromium.launch({ executablePath, headless: true }); });
afterAll(async () => { await browser?.close(); for (const entry of created) await deleteClerkTestUser(secret!, entry); });

const baseMarkdown = "# Name\n\nSummary one\n\n## Skills\n\n- A\n- B";
const css = ".r { color: #123456; }";
const ID = "sync-cv";

async function ready(page: Page) {
   await page.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: unknown })?.__vue_app__));
   await page.waitForFunction(() => Boolean((window as unknown as { Clerk?: { loaded?: boolean } }).Clerk?.loaded));
}

/**
 * A tab that holds the sync leader lock and never answers or syncs, like a tab of an older release or one that
 * stopped running. Every request for the lock (including a takeover) is parked with it.
 */
const SILENT_LEADER = `(() => {
   const original = navigator.locks.request.bind(navigator.locks);
   navigator.locks.request = function (name, ...rest) {
      if (typeof name === "string" && name.startsWith("ruxt-cloud-sync-leader:")) {
         const options = typeof rest[0] === "object" && rest[0] ? rest[0] : {};
         return original(name, { mode: "exclusive", ...(options.steal ? { steal: true } : {}) }, () => new Promise(() => {}));
      }
      return original(name, ...rest);
   };
})();`;

async function device(label: string, seed: boolean | ((context: BrowserContext) => Promise<void>)): Promise<{ context: BrowserContext; page: Page }> {
   const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
   if (seed === true) await seedLocalCv(context, { id: ID, markdown: baseMarkdown, css, title: "Sync CV" });
   else if (seed) await seed(context);
   const page = await context.newPage();
   page.setDefaultTimeout(30_000);
   page.on("pageerror", error => { throw new Error(`${label}: ${error.message}`); });
   if (label.includes("silent")) await page.addInitScript(SILENT_LEADER);
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

/** Acknowledge the retention notice and grant consent for the categories; false when retention is not configured. */
async function consent(context: BrowserContext, categories: string[] = ["cloudSessions"]): Promise<boolean> {
   const acknowledged = await context.request.post(`${base}/api/cloud-data/retention-acknowledgement`);
   if (acknowledged.status() !== 200) return false;
   for (const category of categories) {
      expect((await context.request.put(`${base}/api/cloud-data/consent`, { data: { category, granted: true } })).status()).toBe(200);
   }
   return true;
}

/** Cloud copies of the signed-in account as `kind:id`, from the export. */
async function cloudCopies(context: BrowserContext): Promise<string[]> {
   const response = await context.request.get(`${base}/api/cloud-data/export`);
   const body = await response.json() as { copies: Array<{ kind: string; clientItemId: string }> };
   return body.copies.map(copy => `${copy.kind}:${copy.clientItemId}`).sort();
}

const legacyProfile = (fullName: string) => ({ identity: { fullName, headline: `${fullName}, engineer`, summary: "", location: "" } });

ui("cloud sync across two devices, in the UI", () => {
   it("uploads on its own from one device, arrives on another without a click, and resolves a real conflict piece by piece", async () => {
      await newUser("syncui");
      const a = await device("device A", true);
      if (!await consent(a.context)) return; // cloud retention is not configured on this server

      // Device A: opening the app uploads the session by itself; nobody selects or confirms anything.
      await openRecords(a.page);
      await a.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByText("In your cloud", { exact: true }).waitFor();

      // Device B signs in with empty storage; the record simply arrives, and nothing local is replaced.
      const b = await device("device B", false);
      await openRecords(b.page);
      await b.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByText("In your cloud", { exact: true }).waitFor();
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
      await b.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByText("In your cloud", { exact: true }).waitFor({ timeout: 60_000 });
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

   it("second device with empty storage signs in and sees every record after one sync, with no clicks", async () => {
      await newUser("syncauto");
      const a = await device("device A", async context => {
         await seedLocalCv(context, { id: ID, markdown: baseMarkdown, css, title: "Sync CV" });
         // A profile that already has an id, and two saved by early versions that have none.
         await seedLocalProfiles(context, [
            { ...legacyProfile("Ada Lovelace"), id: "profile-ada", createdAt: 10, updatedAt: 20, label: "Ada" },
            legacyProfile("Grace Hopper"),
            legacyProfile("Alan Turing"),
         ]);
      });
      if (!await consent(a.context, ["cloudSessions", "cloudProfiles"])) return;
      await openRecords(a.page);
      await a.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByText("In your cloud", { exact: true }).waitFor();

      // Every local profile now has a stable id (none changed, none lost) and all of them are in the cloud.
      const stored = await readLocalProfilesRaw(a.page);
      expect(stored).toHaveLength(3);
      expect(stored.every(entry => typeof entry.id === "string" && entry.id)).toBe(true);
      expect(stored.find(entry => entry.id === "profile-ada")).toMatchObject({ createdAt: 10, updatedAt: 20, label: "Ada" });
      await expect.poll(() => cloudCopies(a.context), { timeout: 60_000, intervals: [1_000] })
         .toEqual([`profile:${stored[0]!.id}`, `profile:${stored[1]!.id}`, `profile:${stored[2]!.id}`, `session:${ID}`].sort());

      // A brand-new browser, same account: the first page it shows already lists the session, with no Download
      // or Upload anywhere; the profiles page lists the profiles.
      const b = await device("device B", false);
      const sidebarRow = b.page.getByRole("link", { name: /Sync CV/ }).first();
      await sidebarRow.waitFor({ timeout: 60_000 });
      // The sidebar row says where the session is, never a blanket "local" once an account syncs it.
      await expect.poll(() => sidebarRow.innerText(), { timeout: 60_000, intervals: [500] }).toMatch(/In your cloud · r\d+/);
      expect(await sidebarRow.innerText()).not.toMatch(/\blocal\b/i);
      expect((await readLocalCv(b.page, ID))?.markdown).toBe(baseMarkdown);
      await b.page.goto(`${base}/p`);
      await ready(b.page);
      for (const name of ["Ada", "Grace Hopper", "Alan Turing"]) await b.page.getByText(name, { exact: false }).first().waitFor({ timeout: 60_000 });
      expect((await readLocalProfilesRaw(b.page)).map(entry => entry.id).sort()).toEqual(stored.map(entry => entry.id).sort());
      // Nothing waits for a click: no banner offers a download.
      expect(await b.page.getByTestId("cloud-sync-banner").count()).toBe(0);
      await a.context.close();
      await b.context.close();
   });

   it("never overwrites a different local record on download: both versions are kept for the Conflicts tab", async () => {
      await newUser("syncsafe");
      const a = await device("device A", true);
      if (!await consent(a.context)) return;
      await openRecords(a.page);
      await a.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByText("In your cloud", { exact: true }).waitFor();

      const different = "# Mine\n\nWritten on the other browser before it ever synced";
      const b = await device("device B", async context => { await seedLocalCv(context, { id: ID, markdown: different, css, title: "Sync CV" }); });
      await openRecords(b.page);
      await b.page.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByText("Conflict", { exact: true }).waitFor({ timeout: 60_000 });
      expect((await readLocalCv(b.page, ID))?.markdown).toBe(different);
      expect(JSON.stringify(await (await b.context.request.get(`${base}/api/cloud-data/copies/session/${ID}`)).json())).toContain("# Name");
      await b.page.getByRole("button", { name: /^Conflicts/ }).click();
      await b.page.getByRole("button", { name: /Review/ }).waitFor();
      await a.context.close();
      await b.context.close();
   });

   it("gives each kind its own cap, shows what does not fit as over limit, and drops nothing", async () => {
      await newUser("syncquota");
      const a = await device("device A", async context => {
         for (const id of ["q1", "q2", "q3"]) await seedLocalCv(context, { id, markdown: `# ${id}`, css, title: `Quota ${id}` });
         await seedLocalProfiles(context, [{ ...legacyProfile("Quota Profile"), id: "profile-q", createdAt: 1, updatedAt: 2 }]);
      });
      if (!await consent(a.context, ["cloudSessions", "cloudProfiles"])) return;
      await a.page.goto(`${base}/settings/cloud-data`);
      await ready(a.page);
      await a.page.getByText(/Cloud copies: CV sessions/).waitFor({ timeout: 60_000 });
      const sessionsFact = await a.page.locator(".facts div", { hasText: "Cloud copies: CV sessions" }).innerText();
      if (!/of 2\b/.test(sessionsFact)) return; // the server was not started with NUXT_CLOUD_COPY_LIMITS_SESSION=2

      await expect.poll(() => cloudCopies(a.context), { timeout: 60_000, intervals: [1_000] }).toHaveLength(3); // two sessions and the profile
      await a.page.getByRole("button", { name: "Records" }).click();
      const overLimit = a.page.locator(".records-table tbody tr").getByText("Not synced: over limit", { exact: true });
      await overLimit.first().waitFor({ timeout: 60_000 });
      expect(await overLimit.count()).toBe(1); // three local sessions, two fit under the cap of two
      expect(await a.page.locator(".records-table tbody tr", { hasText: "Quota Profile" }).getByText("In your cloud", { exact: true }).count()).toBe(1);
      for (const id of ["q1", "q2", "q3"]) expect((await readLocalCv(a.page, id))?.markdown).toBe(`# ${id}`); // nothing dropped

      // The header chip and the session list both say so, with the reason, and the empty state is never silent.
      await a.page.getByText(/1 item could not sync \(over limit\)/).first().waitFor();
      await a.page.goto(`${base}/`);
      await ready(a.page);
      await a.page.getByTestId("cloud-sync-banner").getByText(/1 item could not sync \(over limit\)/).waitFor({ timeout: 30_000 });
      await a.context.close();
   });

   it("a second tab beside a leader that does not answer takes over: the records leave 'On this device only' by themselves and sync", async () => {
      await newUser("syncstale");
      // Tab A signs in first and holds the leader lock without ever syncing (an older bundle, or a stopped tab).
      const a = await device("silent tab A", true);
      if (!await consent(a.context)) return;
      await a.page.goto(`${base}/settings/cloud-data`);
      await ready(a.page);
      await a.page.getByRole("button", { name: "Records" }).click();
      const rowA = a.page.locator(".records-table tbody tr", { hasText: "Sync CV" });
      await rowA.waitFor();
      // Alone, it never syncs, but it never claims the record is final either.
      await a.page.waitForTimeout(8_000);
      expect(await cloudCopies(a.context)).toEqual([]);
      expect(await rowA.innerText()).not.toContain("On this device only");
      expect(await a.page.getByTestId("records-sync-state").innerText()).not.toMatch(/Synced/);

      // Tab B of the same browser profile: it asks who leads, hears nothing, takes the leadership and syncs.
      const pageB = await a.context.newPage();
      pageB.setDefaultTimeout(30_000);
      pageB.on("pageerror", error => { throw new Error(`tab B: ${error.message}`); });
      await pageB.goto(`${base}/settings/cloud-data`);
      await ready(pageB);
      await expect.poll(() => cloudCopies(a.context), { timeout: 60_000, intervals: [1_000] }).toEqual([`session:${ID}`]);
      await pageB.getByRole("button", { name: "Records" }).click();
      await pageB.locator(".records-table tbody tr", { hasText: "Sync CV" }).getByText("In your cloud", { exact: true }).waitFor({ timeout: 30_000 });
      await pageB.getByRole("button", { name: "Overview" }).click();
      const connection = await pageB.locator(".facts div", { hasText: "Connection" }).innerText();
      expect(connection).toMatch(/Live updates on|Live updates unavailable|Connecting|Reconnecting/);
      expect(await pageB.locator(".facts div", { hasText: "Last synced" }).innerText()).not.toContain("Not yet");

      // Tab A, now a follower, reflects the same state and says another tab is syncing.
      await a.page.getByRole("button", { name: "Records" }).click();
      await rowA.getByText("In your cloud", { exact: true }).waitFor({ timeout: 30_000 });
      await a.page.getByRole("button", { name: "Overview" }).click();
      await a.page.locator(".facts div", { hasText: "Connection" }).getByText(/Another tab is syncing|older version|not answering/).waitFor();
      await a.context.close();
   });
});
