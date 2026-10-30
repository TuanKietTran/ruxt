import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";

const baseUrl = process.env.PROFILES_BASE_URL?.replace(/\/$/, "");
if (baseUrl && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname)) {
    throw new Error("Profile browser tests are restricted to a local development server");
}
/** CHROMIUM_PATH, else any Playwright-installed Chromium, else Brave (as the pagination test does). */
function findChromium(): string | undefined {
    if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
    const cache = join(homedir(), "Library/Caches/ms-playwright");
    if (existsSync(cache)) {
        for (const dir of readdirSync(cache).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) {
            const app = join(cache, dir, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
            if (existsSync(app)) return app;
        }
    }
    const brave = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
    return existsSync(brave) ? brave : undefined;
}
const executablePath = findChromium();
const suite = baseUrl && executablePath ? describe : describe.skip;
let browser: Browser;

const KEY = "cv-sv:local-profiles:v1";
const seed = (names: string[]) => names.map((fullName, i) => ({
    version: 1, id: `profile-${fullName.toLowerCase()}`, createdAt: 1000 + i, updatedAt: 1000 + (names.length - i) * 1000,
    identity: { fullName, headline: "", summary: "", location: "" },
    contacts: [], experiences: [], skills: [], certifications: [], education: [], projects: [], languages: [],
}));
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]") as any[], KEY);
const cardNames = (page: Page) => page.locator(".profile-card__select strong").evaluateAll(els => els.map(el => el.firstChild!.textContent!.trim()));

async function waitForHydration(page: Page) {
    await page.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: { _instance?: { isMounted?: boolean } } } | null)?.__vue_app__?._instance?.isMounted));
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function guardNativeDialogs(page: Page) {
    await page.addInitScript(() => {
        const forbidden = () => { throw new Error("Native dialog/print API must not be called"); };
        window.alert = forbidden;
        window.confirm = forbidden;
        window.prompt = forbidden;
        window.print = forbidden;
    });
}

async function open(names: string[]) {
    const page = await browser.newPage();
    await guardNativeDialogs(page);
    await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key!)) localStorage.setItem(key!, value!); }, [KEY, JSON.stringify(seed(names))]);
    await page.goto(`${baseUrl}/p`);
    if (names.length) await page.locator(".profile-card").first().waitFor();
    else await page.locator(".profiles-empty").waitFor();
    await waitForHydration(page);
    return page;
}

suite("profile editor (browser)", { timeout: 60_000 }, () => {
    beforeAll(async () => { browser = await chromium.launch({ executablePath, headless: true }); });
    afterAll(async () => { await browser?.close(); });

    it("opens a new empty profile with Full name focused and keeps it unsaved until valid", async () => {
        const page = await open([]);
        await page.locator(".profile-placeholder").waitFor({ state: "visible" });
        await page.locator(".profile-placeholder .profile-save").click();
        await page.locator(".profile-sheet").waitFor({ state: "visible" });
        const fullName = page.locator(".profile-name-section .profile-input");
        await fullName.waitFor({ state: "visible" });
        await expect.poll(() => fullName.evaluate(element => element === document.activeElement)).toBe(true);
        expect(await stored(page)).toEqual([]);

        await fullName.fill(" ");
        await fullName.press("Enter");
        await page.getByText("Full name is required to save.").waitFor({ state: "visible" });
        expect(await stored(page)).toEqual([]);

        await page.locator(".profile-name-section .editable-field__display").click();
        const correctedName = page.locator(".profile-name-section .profile-input");
        await correctedName.waitFor({ state: "visible" });
        await correctedName.fill("New Person");
        await page.locator(".profile-name-section .profile-input").press("Enter");
        await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || "[]").some((profile: any) => profile.identity.fullName === "New Person"), KEY);
        await page.close();
    });

    it("opens the form and focuses Full name from the sidebar New profile action", async () => {
        const page = await open([]);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.getByRole("button", { name: "Toggle sidebar" }).click();
        await page.locator(".editor-layout--drawer-open").waitFor();
        await page.locator(".profiles-new").click();
        await page.locator(".profile-sheet").waitFor({ state: "visible" });
        const fullName = page.locator('.profile-name-section textarea[placeholder="Your name"]');
        await fullName.waitFor({ state: "visible" });
        await expect.poll(() => fullName.evaluate(element => element === document.activeElement)).toBe(true);
        await page.close();
    });

    it("keeps Preferences within a 390px viewport after hydration", async () => {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await guardNativeDialogs(page);
        await page.goto(`${baseUrl}/settings`);
        await page.getByRole("heading", { name: "Preferences" }).waitFor();
        await waitForHydration(page);
        await expect.poll(() => page.evaluate(() => ({
            viewport: window.innerWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
            root: document.querySelector("#__nuxt")?.scrollWidth ?? 0,
        }))).toEqual({ viewport: 390, document: 390, body: 390, root: 390 });
        expect(await page.locator(".settings").count()).toBe(1);
        await page.close();
    });

    it("keeps selection by id and the card order stable while editing; other profiles' updatedAt is untouched", async () => {
        const page = await open(["Alice", "Bob", "Carol"]);
        expect(await cardNames(page)).toEqual(["Alice", "Bob", "Carol"]);
        const before = Object.fromEntries((await stored(page)).map(p => [p.id, p.updatedAt]));

        await page.locator(".profile-card", { hasText: "Carol" }).locator(".profile-card__select").click();
        await page.locator(".profile-card.active", { hasText: "Carol" }).waitFor();

        // Edit Carol's headline; saving bumps her updatedAt, which must not move her card or the selection.
        await page.getByRole("button", { name: /Headline/ }).click();
        await page.locator(".editable-field__control textarea").fill("Staff engineer");
        await page.locator(".editable-field__control textarea").press("Enter");
        await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || "[]").some((p: any) => p.identity.headline === "Staff engineer"), KEY);

        expect(await cardNames(page)).toEqual(["Alice", "Bob", "Carol"]);
        expect(await page.locator(".profile-card.active strong").first().innerText()).toContain("Carol");
        const after = await stored(page);
        expect(after.find(p => p.id === "profile-carol")!.updatedAt).toBeGreaterThan(before["profile-carol"]!);
        for (const id of ["profile-alice", "profile-bob"]) expect(after.find(p => p.id === id)!.updatedAt).toBe(before[id]);

        // Switching selection also leaves every other profile alone.
        await page.locator(".profile-card", { hasText: "Alice" }).locator(".profile-card__select").click();
        await page.locator(".profile-card.active", { hasText: "Alice" }).waitFor();
        const switched = await stored(page);
        for (const id of ["profile-alice", "profile-bob"]) expect(switched.find(p => p.id === id)!.updatedAt).toBe(before[id]);
        await page.close();
    });

    it("technologies chip input keeps every token (Go, C) and commits exactly the box value on Enter and blur", async () => {
        const page = await open(["Alice"]);
        await page.locator(".profile-card__select").click();
        await page.locator(".profile-section", { has: page.getByRole("heading", { name: "Projects" }) }).getByRole("button", { name: /Add/ }).click();
        // A new entry opens its first field for editing.
        const name = page.locator('[data-entry="projects-0"] .editable-field__control textarea');
        await name.fill("Demo");
        await name.press("Enter");

        const techs = async () => (await stored(page))[0].projects[0]?.technologies;
        const box = page.locator('[data-entry="projects-0"] .tech-input__box input');

        await box.fill("Go");
        await box.press("Enter");
        await expect.poll(techs).toEqual(["Go"]);

        // Comma commits the token typed so far; the rest stays in the box, and blur commits exactly that.
        await box.pressSequentially("C,TS");
        await expect.poll(techs).toEqual(["Go", "C"]);
        await page.locator("h1, h2").first().click();
        await expect.poll(techs).toEqual(["Go", "C", "TS"]);

        // Waiting well past the old 700ms autosave delay must not change or duplicate anything.
        await page.waitForTimeout(1500);
        expect(await techs()).toEqual(["Go", "C", "TS"]);
        const chips = await page.locator('[data-entry="projects-0"] [data-chip]').evaluateAll(els => els.map(el => el.firstChild!.textContent!.trim()));
        expect(chips).toEqual(["Go", "C", "TS"]);
        await page.close();
    });
});
