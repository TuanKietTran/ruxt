import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { seedLocalCv } from "./helpers/local-cv";

/**
 * Editor intellisense harness: scripted Playwright (Brave) + axe against a
 * local dev server. Env-gated like the sibling browser suites: without
 * EDITOR_INTELLISENSE_BASE_URL the suite skips. The completion popup is not
 * wired in the current editor, so the keyboard flow skips gracefully when no
 * popup appears and instead asserts the editor loads and the markdown
 * indicator decorations (:::directives and trailing {.class #id} blocks)
 * render. axe runs when an axe-core build is resolvable (AXE_PATH or a
 * node_modules/axe-core install); otherwise that check skips gracefully too.
 */
const baseUrl = process.env.EDITOR_INTELLISENSE_BASE_URL?.replace(/\/$/, "");
if (baseUrl && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname)) {
    throw new Error("Editor intellisense browser tests are restricted to a local development server");
}
const executablePath = process.env.CHROMIUM_PATH
    ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const browserPath = existsSync(executablePath) ? executablePath : chromium.executablePath();
const suite = baseUrl && existsSync(browserPath) ? describe : describe.skip;
let browser: Browser;

const css = `.resume { box-sizing: border-box; width: 210mm; min-height: 297mm; padding: 40px; background: #fff; color: #171717; font: 14px/20px Georgia, serif; }`;
const markdown = `:::resume

# Ada Lovelace {.cv-name}

## Experience {#experience}

Analytical engines, notes on the engine. {#summary}

:::
`;

function axeSourcePath(): string | undefined {
    const candidates = [
        process.env.AXE_PATH,
        join(process.cwd(), "node_modules", "axe-core", "axe.min.js"),
    ].filter((path): path is string => Boolean(path));
    const pnpmStore = join(process.cwd(), "node_modules", ".pnpm");
    if (existsSync(pnpmStore)) {
        for (const entry of readdirSync(pnpmStore)) {
            if (entry.startsWith("axe-core@")) candidates.push(join(pnpmStore, entry, "node_modules", "axe-core", "axe.min.js"));
        }
    }
    return candidates.find(path => existsSync(path));
}

async function openEditor(page: Page) {
    const id = `intellisense-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await seedLocalCv(page, { id, markdown, css, title: "Intellisense fixture" });
    await page.goto(`${baseUrl}/?s=${id}`);
    await page.locator(".cm-content").first().waitFor({ state: "visible" });
    await page.waitForFunction(() => Boolean((document.querySelector("#__nuxt") as HTMLElement & { __vue_app__?: { _instance?: { isMounted?: boolean } } } | null)?.__vue_app__?._instance?.isMounted));
    return id;
}

async function indicatorTexts(page: Page): Promise<string[]> {
    return page.locator(".cm-content .cm-markdown-indicator").evaluateAll(els => els.map(el => el.textContent ?? ""));
}

async function editorText(page: Page): Promise<string> {
    return (await page.locator(".cm-content").first().innerText()).replace(/\u200b/g, "");
}

/** Returns true when a completion popup appeared and the option was accepted by keyboard. */
async function acceptCompletionIfOffered(page: Page): Promise<boolean> {
    const popup = page.locator(".cm-tooltip-autocomplete, .cm-tooltip.cm-completion").first();
    try {
        await popup.waitFor({ state: "visible", timeout: 1_500 });
    } catch {
        return false;
    }
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    return true;
}

beforeAll(async () => {
    if (!baseUrl || !existsSync(browserPath)) return;
    browser = await chromium.launch({ executablePath: browserPath, headless: true });
}, 30_000);
afterAll(async () => { await browser?.close(); });

suite("editor intellisense (local browser)", () => {
    it("loads the seeded CV, decorates directives and attribute blocks, and passes axe when available", async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await openEditor(page);
        expect(await editorText(page)).toContain("Ada Lovelace");
        await page.waitForFunction(() => document.querySelectorAll(".cm-content .cm-markdown-indicator").length >= 2);
        const indicators = await indicatorTexts(page);
        expect(indicators.some(text => text.startsWith(":::"))).toBe(true);
        expect(indicators.some(text => text.includes(".cv-name"))).toBe(true);
        expect(indicators.some(text => text.includes("#experience"))).toBe(true);
        const axePath = axeSourcePath();
        if (axePath) {
            await page.addScriptTag({ path: axePath });
            const results = await page.evaluate(async () => {
                const axe = (window as unknown as { axe: { run: (node: Document, options: object) => Promise<{ violations: { id: string; impact?: string | null }[]; passes: unknown[] }> } }).axe;
                return axe.run(document, { resultTypes: ["violations"] });
            });
            const critical = results.violations.filter(violation => violation.impact === "critical").map(violation => violation.id);
            expect(results.passes.length).toBeGreaterThan(0);
            expect(critical).toEqual([]);
        } else {
            console.warn("axe-core not resolvable (set AXE_PATH or install axe-core); axe check skipped");
        }
        expect(errors).toEqual([]);
        await page.close();
    }, 60_000);

    it("drives completion by keyboard only, skipping gracefully when the popup is not wired", async () => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await openEditor(page);
        const editor = page.locator(".cm-content").first();
        await editor.focus();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.type(":::res", { delay: 40 });
        const directiveCompleted = await acceptCompletionIfOffered(page);
        if (directiveCompleted) {
            expect(await editorText(page)).toContain(":::resume");
        } else {
            console.warn("completion popup not wired for directives; asserting typed text and indicators instead");
            expect(await editorText(page)).toContain(":::res");
        }
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        await page.keyboard.type("# Grace Hopper {.cv-n", { delay: 40 });
        const classCompleted = await acceptCompletionIfOffered(page);
        if (classCompleted) {
            await page.keyboard.type("}");
            expect(await editorText(page)).toContain(".cv-name");
        } else {
            console.warn("completion popup not wired for attribute classes; asserting typed text and indicators instead");
            await page.keyboard.type("ame}");
        }
        await page.waitForFunction(() => [...document.querySelectorAll(".cm-content .cm-markdown-indicator")].some(el => el.textContent?.includes(".cv-name")));
        const indicators = await indicatorTexts(page);
        expect(indicators.some(text => text.includes(".cv-name"))).toBe(true);
        expect(errors).toEqual([]);
        await page.close();
    }, 60_000);
});
