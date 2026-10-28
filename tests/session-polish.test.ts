import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { readLocalCv, seedLocalCv } from "./helpers/local-cv";

const baseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
const executablePath = process.env.CHROMIUM_PATH
    ?? (process.platform === "darwin" ? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" : "");
const ui = baseUrl && executablePath && existsSync(executablePath) ? describe : describe.skip;
let browser: Browser;
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

async function createSession(context: BrowserContext, title: string) {
    const id = crypto.randomUUID();
    await seedLocalCv(context, {
        id, title,
        markdown: `# ${title} {.cv-name}\n\n:::resume\n## Experience\n\nExample work.\n:::`,
        css: ".resume { width: 210mm; min-height: 297mm; box-sizing: border-box; }",
    });
    return id;
}

async function waitForHydration(page: Page) {
    await page.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: unknown } | null)?.__vue_app__), null, { timeout: 8_000 });
}

async function waitForSheet(page: Page) {
    await waitForHydration(page);
    await page.locator(".preview-page .cv-sheet").first().waitFor({ state: "visible", timeout: 8_000 });
    await page.getByRole("button", { name: "Fit" }).waitFor({ state: "visible" });
}

beforeAll(async () => {
    if (baseUrl && executablePath && existsSync(executablePath)) browser = await chromium.launch({ executablePath, headless: true });
});
afterAll(async () => { await browser?.close(); });

ui("settings, chooser and per-session preview preferences", () => {
    it("initializes theme before showing the chooser and centers it without a fake document title", async () => {
        const context = await browser.newContext();
        await context.addInitScript(() => localStorage.setItem("theme", "opencode"));
        const page = await context.newPage();
        page.setDefaultTimeout(8_000);
        await page.goto(baseUrl!);
        await page.getByRole("heading", { name: "Choose a starting point" }).waitFor();
        await page.waitForFunction(() => (document.querySelector("select[aria-label='Select theme']") as HTMLSelectElement | null)?.value === "opencode", null, { timeout: 8_000 });
        expect(await page.locator("select[aria-label='Select theme']").inputValue()).toBe("opencode");
        expect(await page.locator(".editor-title").count()).toBe(0);
        const picker = await page.locator(".template-picker").boundingBox();
        expect(picker).not.toBeNull();
        expect(picker!.width).toBeLessThanOrEqual(980);
        expect(Math.abs((picker!.x + picker!.width / 2) - (await page.locator(".editor-workspace").evaluate(node => {
            const bounds = node.getBoundingClientRect(); return bounds.x + bounds.width / 2;
        })))).toBeLessThan(2);
        await context.close();
    });

    it("defaults to Fit, allows horizontal scrolling at 100%, and restores zoom independently by session", async () => {
        const context = await browser.newContext();
        const first = await createSession(context, "Polish Alpha");
        const second = await createSession(context, "Polish Beta");
        const page = await context.newPage();
        page.setDefaultTimeout(8_000);
        await page.goto(`${baseUrl}/?s=${first}`);
        await waitForSheet(page);
        const openedDocument = await readLocalCv(page, first);
        expect(openedDocument.revision).toBe(1);
        expect(await page.getByRole("button", { name: "Fit" }).getAttribute("aria-pressed")).toBe("true");
        expect(await page.locator(".format-select option[value='heading']").textContent()).toBe("Heading");
        expect(await page.locator(".format-select").evaluate(element => parseFloat(getComputedStyle(element).width))).toBeGreaterThanOrEqual(76);
        await page.getByRole("button", { name: "Reset zoom" }).click();
        const scroll = await page.locator(".preview-canvas").evaluate(node => ({
            overflowX: getComputedStyle(node).overflowX,
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
        }));
        expect(["auto", "scroll"]).toContain(scroll.overflowX);
        expect(scroll.scrollWidth).toBeGreaterThan(scroll.clientWidth);
        for (let index = 0; index < 5; index++) await page.getByRole("button", { name: "Zoom in" }).click();
        await page.waitForFunction(() => document.querySelector(".zoom-value")?.textContent === "150%");
        const firstZoom = await page.locator(".zoom-value").textContent();
        const storedZoom = await page.evaluate(id => localStorage.getItem(`cv-sv:preview-zoom:v1:session:${id}`), first);
        expect(JSON.parse(storedZoom || "null")).toEqual({ zoom: 150, fit: false });
        await page.goto(`${baseUrl}/?s=${second}`);
        await waitForSheet(page);
        expect(await page.getByRole("button", { name: "Fit" }).getAttribute("aria-pressed")).toBe("true");
        await page.goto(`${baseUrl}/?s=${first}`);
        await waitForSheet(page);
        await page.waitForFunction(expected => document.querySelector(".zoom-value")?.textContent === expected, firstZoom);
        expect(await page.locator(".zoom-value").textContent()).toBe(firstZoom);
        expect(await page.getByRole("button", { name: "Fit" }).getAttribute("aria-pressed")).toBe("false");
        await page.getByRole("button", { name: "Fit", exact: true }).click();
        await expect.poll(() => page.getByRole("button", { name: "Fit", exact: true }).getAttribute("aria-pressed")).toBe("true");
        const fitZoom = Number((await page.locator(".zoom-value").textContent())!.replace("%", ""));
        await page.getByRole("button", { name: "Zoom in" }).click();
        const manualZoom = Math.min(200, Math.max(25, Math.round((fitZoom + 10) / 10) * 10));
        await expect.poll(() => page.locator(".zoom-value").textContent()).toBe(`${manualZoom}%`);
        expect(await page.getByRole("button", { name: "Fit" }).getAttribute("aria-pressed")).toBe("false");
        await context.close();
    });

    it("keeps recent/name ordering and applies alphabetical order", async () => {
        const context = await browser.newContext();
        await createSession(context, "Order Zulu");
        await createSession(context, "Order Alpha");
        const page = await context.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        page.setDefaultTimeout(8_000);
        await page.goto(baseUrl!);
        await waitForHydration(page);
        await page.locator(".document-tree__item").first().waitFor();
        const order = page.getByRole("combobox", { name: "Order sessions" });
        await page.waitForFunction(() => !(document.querySelector("select[aria-label='Order sessions']") as HTMLSelectElement | null)?.disabled);
        await order.selectOption("name");
        const orderState = await page.evaluate(() => ({ stored: localStorage.getItem("editor-session-order"), selected: (document.querySelector("select[aria-label='Order sessions']") as HTMLSelectElement).value }));
        expect(orderState).toEqual({ stored: "name", selected: "name" });
        await expect.poll(async () => {
            const labels = await page.locator(".document-tree__item").allTextContents();
            return labels.findIndex(label => label.includes("Order Alpha")) < labels.findIndex(label => label.includes("Order Zulu"));
        }).toBe(true);
        await page.reload();
        await waitForHydration(page);
        await page.waitForFunction(() => !(document.querySelector("select[aria-label='Order sessions']") as HTMLSelectElement | null)?.disabled);
        expect(await page.getByRole("combobox", { name: "Order sessions" }).inputValue()).toBe("name");
        expect(pageErrors).toEqual([]);
        await context.close();
    });

    it("shows truthful browser-only settings copy and a route-specific title", async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`${baseUrl}/settings`);
        await page.getByRole("heading", { name: "Preferences" }).waitFor();
        await page.getByText("These settings are saved in this browser only. Sign in to keep them with your account.").waitFor();
        expect(await page.title()).toContain("Settings");
        await context.close();
    });
});
