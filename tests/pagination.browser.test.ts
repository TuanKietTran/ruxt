import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import JSZip from "jszip";
import { seedLocalCv } from "./helpers/local-cv";

const baseUrl = process.env.PAGINATION_BASE_URL?.replace(/\/$/, "");
if (baseUrl && !["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseUrl).hostname)) {
    throw new Error("Pagination browser tests are restricted to a local development server");
}
const executablePath = process.env.CHROMIUM_PATH
    ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const suite = baseUrl && existsSync(executablePath) ? describe : describe.skip;
const artifacts = process.env.PAGINATION_ARTIFACTS ?? `/tmp/ruxt-pagination-${Date.now()}`;
let browser: Browser;
const css = `.resume { box-sizing:border-box; width:210mm; min-height:297mm; padding:40px;
    background:#fff; color:#171717; font:14px/20px Georgia,serif; }
.resume h1 { height:40px; margin:0; font-size:24px; }
.resume p { height:180px; margin:0; }
.resume hr { display:none; }`;
const markdown = (count: number) => `:::resume\n\n# Pagination fixture\n\n${Array.from({ length: count }, (_, i) =>
    `Block ${i + 1}: preserved styled content with **bold** and [a link](https://example.com/${i + 1}).`).join("\n\n")}\n\n:::\n`;

async function ready(page: Page, count?: number) {
    await page.locator('.code-preview[data-pagination-state="ready"]').waitFor();
    if (count !== undefined) await page.waitForFunction(count =>
        document.querySelectorAll(".preview-page .cv-pages > .cv-sheet").length === count, count);
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
}
async function create(page: Page, source: string, style = css) {
    const id = `pagination-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await seedLocalCv(page, { id, markdown: source, css: style, title: "Pagination fixture" });
    await page.goto(`${baseUrl}/?s=${id}`);
    await ready(page);
    return id;
}
async function edit(page: Page, source: string) {
    const input = page.locator(".cm-content").first();
    await input.click();
    await input.press("ControlOrMeta+A");
    await page.keyboard.insertText(source);
    await ready(page);
}
async function measurements(page: Page) {
    return page.locator(".preview-page .cv-pages > .cv-sheet").evaluateAll(sheets => sheets.map(sheet => {
        const rect = sheet.getBoundingClientRect();
        const scale = rect.width / (sheet as HTMLElement).offsetWidth;
        const blocks = [...sheet.querySelectorAll("p, h1, h2, li")];
        return {
            width: (sheet as HTMLElement).offsetWidth,
            height: (sheet as HTMLElement).offsetHeight,
            text: sheet.textContent,
            styled: Boolean(sheet.querySelector(".resume")),
            font: getComputedStyle(sheet.querySelector(".resume") ?? sheet).fontFamily,
            lowestContent: Math.max(0, ...blocks.map(block => (block.getBoundingClientRect().bottom - rect.top) / scale)),
            blocks: blocks.filter(block => block.tagName === "P").length,
        };
    }));
}

beforeAll(async () => {
    if (!baseUrl || !existsSync(executablePath)) return;
    await mkdir(artifacts, { recursive: true });
    browser = await chromium.launch({ executablePath, headless: true });
}, 30_000);
afterAll(async () => { await browser?.close(); });

suite("measured CV pagination (local browser)", () => {
    it("renders >3 styled sheets, updates on edits/reload/CSS and is zoom independent", async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await create(page, markdown(18));
        await ready(page, 4);
        await page.locator(".preview-toolbar").getByText("4 pages", { exact: true }).waitFor();
        const initial = await measurements(page);
        expect(initial.every(sheet => sheet.styled && sheet.lowestContent <= sheet.height - 39)).toBe(true);
        expect(initial.map(sheet => sheet.blocks)).toEqual([5, 5, 5, 3]);
        for (let index = 0; index < 4; index++) {
            const sheet = page.locator(".preview-page .cv-pages > .cv-sheet").nth(index);
            await sheet.scrollIntoViewIfNeeded();
            await sheet.screenshot({ path: join(artifacts, `preview-page-${index + 1}.png`) });
        }

        await page.getByRole("button", { name: "Reset zoom", exact: true }).click();
        await ready(page, 4);
        expect((await measurements(page)).map(sheet => sheet.blocks)).toEqual([5, 5, 5, 3]);
        await page.getByRole("button", { name: "Fit", exact: true }).click();
        await ready(page, 4);

        await edit(page, markdown(13));
        await ready(page, 3);
        await page.locator(".preview-toolbar").getByText("3 pages", { exact: true }).waitFor();
        expect((await measurements(page)).map(sheet => sheet.blocks)).toEqual([5, 5, 3]);
        await edit(page, markdown(8));
        await ready(page, 2);
        await page.locator(".preview-toolbar").getByText("2 pages", { exact: true }).waitFor();
        expect((await measurements(page)).map(sheet => sheet.blocks)).toEqual([5, 3]);
        await edit(page, markdown(18));
        await ready(page, 4);
        await page.getByRole("button", { name: "style.css", exact: true }).click();
        await edit(page, css.replace("height:180px", "height:250px"));
        await ready(page, 5);
        await page.getByRole("button", { name: "content.md", exact: true }).click();
        // Reload after actual autosave, not a guessed delay.
        await page.locator(".save-state--saved").waitFor();
        await page.reload();
        await ready(page, 5);
        expect((await measurements(page)).every(sheet => sheet.styled)).toBe(true);
        await writeFile(join(artifacts, "measurements.json"), JSON.stringify({ initial, afterStyleAndReload: await measurements(page), errors }, null, 2));
        expect(errors).toEqual([]);
        await page.close();
    }, 90_000);

    it("preserves directive ancestry around nested explicit breaks, including page four", async () => {
        const page = await browser.newPage();
        const source = `:::resume\n\n${Array.from({ length: 4 }, (_, i) => `Page ${i + 1}`).join("\n\n---\n\n")}\n\n:::\n`;
        await create(page, source);
        await ready(page, 4);
        const pages = await measurements(page);
        expect(pages.map(sheet => sheet.text?.trim())).toEqual(["Page 1", "Page 2", "Page 3", "Page 4"]);
        expect(pages.every(sheet => sheet.styled && sheet.font.includes("Georgia"))).toBe(true);
        await page.close();
    }, 45_000);

    it("splits oversized rich paragraphs and long lists without losing text or styles", async () => {
        const page = await browser.newPage();
        const words = Array.from({ length: 3200 }, (_, i) => `word${i}`).join(" ");
        const source = `:::resume\n\n**${words}** [last link](https://example.com/end)\n\n:::\n`;
        await create(page, source, css.replace("height:180px", "height:auto"));
        const pages = await measurements(page);
        expect(pages.length).toBeGreaterThan(3);
        expect(pages.every(sheet => sheet.styled && sheet.lowestContent <= sheet.height - 38)).toBe(true);
        const text = await page.locator(".preview-page .cv-pages").textContent();
        expect(text?.replace(/\s+/g, " ").trim()).toBe(`${words} last link`);
        expect(await page.locator(".cv-sheet strong").count()).toBe(pages.length);
        expect(await page.locator('.cv-sheet a[href="https://example.com/end"]').count()).toBe(1);
        const list = `:::resume\n\n${Array.from({ length: 25 }, (_, i) => `${i + 1}. Item ${i + 1}`).join("\n")}\n\n:::\n`;
        await edit(page, list);
        await page.getByRole("button", { name: "style.css", exact: true }).click();
        await edit(page, css.replace(".resume p { height:180px; margin:0; }", ".resume ol { margin:0; } .resume li { height:180px; margin:0; }"));
        await ready(page, 5);
        expect(await page.locator(".cv-sheet li").count()).toBe(25);
        expect(await page.locator(".cv-sheet ol").evaluateAll(lists => lists.map(list => list.getAttribute("start")))).toEqual(["1", "6", "11", "16", "21"]);
        await page.close();
    }, 60_000);

    it("repaginates when a late-loading real font changes line wrapping", async () => {
        const fontPath = process.env.PAGINATION_FONT_PATH ?? "/System/Library/Fonts/Monaco.ttf";
        if (!existsSync(fontPath)) return;
        const font = await readFile(fontPath);
        const page = await browser.newPage();
        const source = `:::resume\n\n${Array.from({ length: 15 }, () => "iiii ".repeat(150).trim()).join("\n\n")}\n\n:::\n`;
        const fontCss = css.replace("14px/20px Georgia,serif", "18px/24px PaginationMetric,Georgia,serif")
            .replace("height:180px; margin:0", "margin:0 0 10px");
        await create(page, source, fontCss);
        const before = (await measurements(page)).length;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        await page.route("**/pagination-regression.ttf", async route => {
            await gate;
            await route.fulfill({ contentType: "font/ttf", body: font });
        });
        const request = page.waitForRequest("**/pagination-regression.ttf");
        await page.addStyleTag({ content: `@font-face { font-family: PaginationMetric; src:url('/pagination-regression.ttf'); font-display:swap; }` });
        await request;
        release();
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.waitForFunction(before => document.querySelectorAll(".preview-page .cv-pages > .cv-sheet").length > before, before);
        await ready(page);
        const after = await measurements(page);
        expect(after.every(sheet => sheet.styled && sheet.lowestContent <= sheet.height - 38)).toBe(true);
        await writeFile(join(artifacts, "font-reflow.json"), JSON.stringify({ before, after: after.length, fontPath }, null, 2));
        await page.close();
    }, 60_000);

    it("repaginates after a late image loads without an image-load loop", async () => {
        const page = await browser.newPage();
        await create(page, ":::resume\n\nBefore image\n\nAfter image\n\n:::\n", css.replace("height:180px; margin:0", "margin:0"));
        await ready(page, 1);
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        await page.route("**/pagination-image.svg", async route => {
            await gate;
            await route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1400"><rect width="600" height="1400" fill="#6b8"/></svg>' });
        });
        const request = page.waitForRequest("**/pagination-image.svg");
        await edit(page, ":::resume\n\nBefore image\n\n![Tall image](/pagination-image.svg)\n\nAfter image\n\n:::\n");
        await request;
        release();
        await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".preview-page img")].every(image => image.complete && image.naturalHeight > 0));
        await ready(page);
        const pages = await measurements(page);
        await writeFile(join(artifacts, "image-reflow.json"), JSON.stringify(pages, null, 2));
        expect(pages.length).toBe(3);
        expect(pages.every(sheet => sheet.styled && sheet.lowestContent <= sheet.height - 38)).toBe(true);
        const count = await page.evaluate(async () => {
            let count = 0;
            const listener = () => count++;
            document.addEventListener("cv-pagination-complete", listener);
            await new Promise(resolve => setTimeout(resolve, 150));
            document.removeEventListener("cv-pagination-complete", listener);
            return count;
        });
        expect(count).toBeLessThan(3);
        await page.close();
    }, 60_000);

    it("keeps a long real Harvard template styled and print-consistent", async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const reference = await readFile(new URL("../app/data/reference-cv.md", import.meta.url), "utf8");
        const style = await readFile(new URL("../app/data/reference-cv.css", import.meta.url), "utf8");
        const body = reference.replace(/^:::resume\s*/, "").replace(/\s*:::\s*$/, "");
        await create(page, `:::resume\n\n${Array.from({ length: 6 }, () => body).join("\n\n")}\n\nHARVARD-END-MARKER\n\n:::\n`, style);
        const pages = await measurements(page);
        expect(pages.length).toBeGreaterThan(3);
        expect(pages.every(sheet => sheet.styled && sheet.lowestContent <= sheet.height - 39)).toBe(true);
        expect(await page.locator('.cv-sheet a[href="https://example.com"]').count()).toBe(6);
        expect(await page.locator(".cv-sheet").last().textContent()).toContain("HARVARD-END-MARKER");
        const last = page.locator(".preview-page .cv-pages > .cv-sheet").last();
        await last.scrollIntoViewIfNeeded();
        await last.screenshot({ path: join(artifacts, "harvard-last-preview-page.png") });
        const pdfPath = join(artifacts, "harvard-pagination.pdf");
        await page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true });
        const pdf = await readFile(pdfPath);
        const pdfPages = [...pdf.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)].length;
        expect(pdfPages).toBe(pages.length);
        await writeFile(join(artifacts, "harvard-measurements.json"), JSON.stringify({ pages, pdfPages }, null, 2));
        await page.close();
    }, 60_000);

    it("exports actual four-page PDF and PNG ZIP matching the preview", async () => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
        await create(page, markdown(18));
        await ready(page, 4);
        await page.pdf({ path: join(artifacts, "pagination-four-pages.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
        const pdf = await readFile(join(artifacts, "pagination-four-pages.pdf"));
        const pdfPages = [...pdf.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)].length;
        expect(pdfPages).toBe(4);
        await page.getByRole("button", { name: "Export", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Export CV" });
        await dialog.locator("select").selectOption("png");
        const download = page.waitForEvent("download");
        await dialog.getByRole("button", { name: "Export PNG", exact: true }).click();
        const file = await download.catch(async error => {
            await writeFile(join(artifacts, "export-errors.json"), JSON.stringify(errors, null, 2));
            throw new Error(`${error.message}; browser errors: ${errors.join("; ")}`);
        });
        const zipPath = join(artifacts, "pagination-four-pages.zip");
        await file.saveAs(zipPath);
        const zip = await JSZip.loadAsync(await readFile(zipPath));
        const pngs = Object.values(zip.files).filter(file => file.name.endsWith(".png"));
        expect(pngs).toHaveLength(4);
        const dimensions = [];
        for (let index = 0; index < pngs.length; index++) {
            const png = await pngs[index]!.async("nodebuffer");
            expect(png.subarray(1, 4).toString()).toBe("PNG");
            dimensions.push({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });
            await writeFile(join(artifacts, `export-page-${index + 1}.png`), png);
        }
        expect(dimensions.every(({ width, height }) => width >= 1500 && height >= 2200)).toBe(true);
        await writeFile(join(artifacts, "exports.json"), JSON.stringify({ pdfPages, pngPages: pngs.length, dimensions }, null, 2));
        await page.close();
    }, 120_000);
});
