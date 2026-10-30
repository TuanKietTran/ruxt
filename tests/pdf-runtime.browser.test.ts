import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { seedLocalCv } from "./helpers/local-cv";

const baseUrl = process.env.PDF_QA_BASE_URL?.replace(/\/$/, "");
if (!baseUrl) throw new Error("PDF runtime QA requires PDF_QA_BASE_URL for the local Nuxt fixture server");
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname)) {
    throw new Error("PDF runtime QA is restricted to an isolated local development server");
}
const executablePath = process.env.PDF_QA_CHROMIUM_PATH ?? chromium.executablePath();
const artifacts = resolve(process.cwd(), process.env.PDF_QA_ARTIFACTS ?? "../../artifacts/ui-pdf-qa");
let browser: Browser;
const css = `.resume { box-sizing:border-box; width:210mm; min-height:297mm; padding:24px; background:#fff; color:#171717; font:15px/22px Georgia,serif; } .resume h1 { color:#123456; margin:0 0 12px; } .resume p { margin:0 0 12px; } .resume hr { display:none; }`;
const markdown = `:::resume\n\n# PDF QA Fixture {.cv-name}\n\n${Array.from({ length: 3 }, (_, page) => `## Page ${page + 1} Marker\n\n${Array.from({ length: 4 }, (_, row) => `Page ${page + 1} paragraph ${row + 1}: styled content for rendered output verification.`).join("\n\n")}`).join("\n\n---\n\n")}\n\n:::\n`;

async function pageReady(page: Page, expected = 3) {
    await page.locator(".code-preview[data-pagination-state=\"ready\"]").waitFor();
    await page.waitForFunction(count => document.querySelectorAll(".preview-page .cv-pages > .cv-sheet").length === count, expected);
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
}
async function openFixture(page: Page, suffix: string) {
    const id = `pdf-qa-${Date.now()}-${suffix}`;
    await seedLocalCv(page, { id, markdown, css, title: `PDF QA ${suffix}` });
    await page.goto(`${baseUrl}/?s=${id}`);
    await pageReady(page);
    await page.evaluate(() => {
        const sibling = document.createElement("div");
        sibling.className = "cv-sheet";
        sibling.dataset.pdfQaSibling = "true";
        sibling.textContent = "OUTSIDE_ACTIVE_PREVIEW_SENTINEL";
        sibling.style.cssText = "position:fixed;left:-100000px;top:0;width:210mm;height:297mm;background:#ff00ff;color:#000";
        document.body.prepend(sibling);
    });
    return id;
}
async function openPdfDialog(page: Page) {
    const exportButton = page.getByRole("button", { name: "Export", exact: true });
    await exportButton.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
        const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Export");
        return typeof (button as any)?.__vnode?.props?.onClick === "function";
    });
    await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await exportButton.click();
    const options = page.getByRole("dialog", { name: "Export CV" });
    await options.getByRole("button", { name: "Export PDF" }).click();
    const dialog = page.getByRole("dialog", { name: "Export PDF" });
    await dialog.waitFor();
    return dialog;
}
function trackNetwork(page: Page) {
    const requests: { method: string; url: string; body: string }[] = [];
    page.on("request", request => requests.push({ method: request.method(), url: request.url(), body: request.postData() ?? "" }));
    const contentWrites = () => requests.filter(request => {
        if (!["POST", "PUT", "PATCH"].includes(request.method)) return false;
        const path = new URL(request.url).pathname;
        return /\/(?:api\/)?(?:cv|profiles?|templates?|sessions?|documents?|uploads?|imports?)(?:[-_/]|$)/i.test(path)
            || /PDF QA Fixture|Page \d+ paragraph|markdown|stylesheet/i.test(request.body);
    }).map(({ method, url }) => `${method} ${url}`);
    const assets = () => requests.filter(request => request.method === "GET" && /\.(?:woff2?|ttf|otf|png|jpe?g|gif|svg)(?:[?#]|$)/i.test(new URL(request.url).pathname + new URL(request.url).search)).map(request => request.url);
    return { requests, contentWrites, assets };
}
async function installNativeGuards(page: Page) {
    const invoked: string[] = [];
    await page.addInitScript(() => {
        for (const name of ["alert", "confirm", "prompt", "print"] as const) {
            Object.defineProperty(window, name, { configurable: false, value: () => { (window as any).__pdfQaNativeCalls.push(name); throw new Error(`Forbidden native API: ${name}`); } });
        }
        (window as any).__pdfQaNativeCalls = [];
    });
    page.on("dialog", dialog => { invoked.push(`dialog:${dialog.type()}`); void dialog.dismiss(); });
    return async () => {
        const calls = await page.evaluate(() => (window as any).__pdfQaNativeCalls as string[]);
        expect([...invoked, ...calls]).toEqual([]);
    };
}

beforeAll(async () => {
    if (!existsSync(executablePath)) throw new Error(`Required Playwright Chromium is missing at ${executablePath}; provision it with ./node_modules/.bin/playwright-core install chromium or set PDF_QA_CHROMIUM_PATH`);
    await mkdir(artifacts, { recursive: true });
    browser = await chromium.launch({ executablePath, headless: true });
}, 30_000);
afterAll(async () => { await browser?.close(); });

describe("PDF runtime acceptance (product UI, isolated local browser)", () => {
    it("downloads a valid selected-page PDF with configured filename, paper, orientation and margins", async () => {
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();
        const assertNoNative = await installNativeGuards(page);
        const failures: string[] = [];
        const network = trackNetwork(page);
        page.on("pageerror", error => failures.push(error.message));
        await openFixture(page, "selected");
        const dialog = await openPdfDialog(page);
        expect(await dialog.getByText("3 available").count()).toBe(1);
        expect(await page.locator('[data-pdf-qa-sibling="true"]').count()).toBe(1);
        const previewSheet = dialog.locator(".cv-pdf-preview__page .cv-sheet");
        await previewSheet.waitFor({ state: "visible" });
        const previewMetrics = await previewSheet.evaluate(element => {
            const rect = element.getBoundingClientRect();
            return { width: rect.width, height: rect.height, text: element.textContent ?? "", transform: getComputedStyle(element).transform };
        });
        await writeFile(join(artifacts, "selected-page-preview-metrics.json"), JSON.stringify(previewMetrics, null, 2));
        expect(previewMetrics.text).toContain("Page 2 Marker");
        expect(previewMetrics.width).toBeGreaterThan(100);
        expect(previewMetrics.height).toBeGreaterThan(100);
        await dialog.getByLabel("Filename").fill("QA Letter Landscape");
        await dialog.getByLabel("Paper").selectOption("letter");
        await dialog.getByLabel("Orientation").selectOption("landscape");
        await dialog.getByLabel("Top").fill("20");
        await dialog.getByLabel("Right").fill("15");
        await dialog.getByLabel("Bottom").fill("10");
        await dialog.getByLabel("Left").fill("5");
        await dialog.getByLabel(/^Pages/).fill("2");
        expect(await dialog.getByText("Preview · page 2").count()).toBe(1);
        await dialog.locator(".cv-pdf-preview__page").screenshot({ path: join(artifacts, "selected-page-preview.png") });
        await page.evaluate(() => {
            const texts: string[] = [];
            const collect = () => document.querySelectorAll(".cv-pdf-progress").forEach(node => { if (node.textContent) texts.push(node.textContent); });
            const observer = new MutationObserver(collect);
            observer.observe(document.body, { subtree: true, childList: true, characterData: true });
            (window as any).__pdfQaProgress = { texts, collect, observer };
        });
        const downloadPromise = page.waitForEvent("download");
        await dialog.getByRole("button", { name: "Download PDF" }).click();
        const download = await downloadPromise;
        const progressTexts = await page.evaluate(() => { const state = (window as any).__pdfQaProgress; state.collect(); state.observer.disconnect(); return state.texts as string[]; });
        expect(progressTexts.some(text => /Creating page 1 of 1/.test(text))).toBe(true);
        expect(await download.suggestedFilename()).toBe("QA-Letter-Landscape.pdf");
        const pdfPath = join(artifacts, "selected-letter-landscape.pdf");
        await download.saveAs(pdfPath);
        const bytes = await readFile(pdfPath);
        expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
        const source = bytes.toString("latin1");
        const pageCount = [...source.matchAll(/\/Type\s*\/Page\b/g)].length;
        expect(pageCount).toBe(1);
        const mediaBox = source.match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1]?.trim().split(/\s+/).map(Number);
        expect(mediaBox).toBeDefined();
        expect(mediaBox?.[2]).toBeCloseTo(792, 0);
        expect(mediaBox?.[3]).toBeCloseTo(612, 0);
        expect(source).toContain("/Width");
        await writeFile(join(artifacts, "selected-letter-landscape.json"), JSON.stringify({ filename: await download.suggestedFilename(), pageCount, mediaBox, size: bytes.length, contentWriteRequests: network.contentWrites(), fontImageGetRequests: network.assets() }, null, 2));
        expect(network.contentWrites()).toEqual([]);
        await assertNoNative();
        expect(failures).toEqual([]);
        await context.close();
    }, 120_000);

    it("exports all pages in A4 portrait and reports invalid page selection inline", async () => {
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();
        const assertNoNative = await installNativeGuards(page);
        const network = trackNetwork(page);
        await openFixture(page, "all-pages");
        const dialog = await openPdfDialog(page);
        const pages = dialog.getByLabel(/^Pages/);
        await pages.fill("1-4");
        expect(await dialog.getByRole("alert").filter({ hasText: /Choose pages from 1 to 3/ }).count()).toBe(1);
        await pages.fill("");
        await dialog.getByLabel("Paper").selectOption("a4");
        await dialog.getByLabel("Orientation").selectOption("portrait");
        const downloadPromise = page.waitForEvent("download");
        await dialog.getByRole("button", { name: "Download PDF" }).click();
        const download = await downloadPromise;
        const pdfPath = join(artifacts, "all-pages-a4-portrait.pdf");
        await download.saveAs(pdfPath);
        const bytes = await readFile(pdfPath);
        expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
        const source = bytes.toString("latin1");
        const pageCount = [...source.matchAll(/\/Type\s*\/Page\b/g)].length;
        expect(pageCount).toBe(3);
        const mediaBox = source.match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1]?.trim().split(/\s+/).map(Number);
        expect(mediaBox?.[2]).toBeCloseTo(595.28, 0);
        expect(mediaBox?.[3]).toBeCloseTo(841.89, 0);
        await writeFile(join(artifacts, "all-pages-a4-portrait.json"), JSON.stringify({ pageCount, mediaBox, size: bytes.length, outsideActivePreviewSentinelPresent: await page.locator('[data-pdf-qa-sibling="true"]').count() === 1, contentWriteRequests: network.contentWrites(), fontImageGetRequests: network.assets() }, null, 2));
        expect(network.contentWrites()).toEqual([]);
        await assertNoNative();
        await context.close();
    }, 120_000);

    it("exports discontiguous Legal portrait pages without including a sibling preview", async () => {
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();
        const assertNoNative = await installNativeGuards(page);
        const network = trackNetwork(page);
        await openFixture(page, "legal-isolation");
        const dialog = await openPdfDialog(page);
        await dialog.getByLabel("Filename").fill("QA Legal Selected");
        await dialog.getByLabel("Paper").selectOption("legal");
        await dialog.getByLabel("Orientation").selectOption("portrait");
        await dialog.getByLabel(/^Pages/).fill("1,3");
        const downloadPromise = page.waitForEvent("download");
        await dialog.getByRole("button", { name: "Download PDF" }).click();
        const download = await downloadPromise;
        expect(await download.suggestedFilename()).toBe("QA-Legal-Selected.pdf");
        const pdfPath = join(artifacts, "selected-legal-portrait.pdf");
        await download.saveAs(pdfPath);
        const bytes = await readFile(pdfPath);
        expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
        const source = bytes.toString("latin1");
        const pageCount = [...source.matchAll(/\/Type\s*\/Page\b/g)].length;
        expect(pageCount).toBe(2);
        const mediaBox = source.match(/\/MediaBox\s*\[([^\]]+)\]/)?.[1]?.trim().split(/\s+/).map(Number);
        expect(mediaBox?.[2]).toBeCloseTo(612, 0);
        expect(mediaBox?.[3]).toBeCloseTo(1008, 0);
        const outsideActivePreviewSentinelPresent = await page.locator('[data-pdf-qa-sibling="true"]').count() === 1;
        await writeFile(join(artifacts, "selected-legal-portrait.json"), JSON.stringify({ filename: await download.suggestedFilename(), pageCount, mediaBox, size: bytes.length, outsideActivePreviewSentinelPresent, contentWriteRequests: network.contentWrites(), fontImageGetRequests: network.assets() }, null, 2));
        expect(outsideActivePreviewSentinelPresent).toBe(true);
        expect(network.contentWrites()).toEqual([]);
        await assertNoNative();
        expect(await page.locator(".cv-export-scope .cv-sheet").count()).toBe(3);
        await context.close();
    }, 120_000);
});
