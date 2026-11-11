import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { seedLocalCv } from "../helpers/local-cv";

const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (base && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Local CV tests require a local server");
const executablePath = process.env.CHROMIUM_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const ui = base && existsSync(executablePath) ? describe : describe.skip;
let browser: Browser;
vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });
beforeAll(async () => { if (ui === describe) browser = await chromium.launch({ executablePath, headless: true }); });
afterAll(async () => { await browser?.close(); });

const css = `.resume { box-sizing:border-box; width:210mm; min-height:297mm; padding:24px; background:#fff; color:#171717; font:15px/22px Georgia,serif; } .resume h1 { color:#123456; margin:0 0 12px; } .resume p { margin:0 0 12px; }`;
const markdown = `:::resume\n\n# Visitor Export {.cv-name}\n\n## Summary\n\nVisitor path export fixture: styled content for the smoke PDF download.\n\n:::\n`;

ui("visitor paths", () => {
    it("shows the landing page and opens the editor from its primary CTA", async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${base}/about`);
        await page.getByText("About Ruxt", { exact: true }).waitFor();
        await page.getByRole("heading", { name: /Write your CV in Markdown/ }).waitFor();
        await page.getByText(/local-first CV editor/).waitFor();
        expect(await page.getByRole("link", { name: "Cloud data settings" }).getAttribute("href")).toBe("/settings/cloud-data");
        await page.getByRole("link", { name: /Open the editor/ }).click();
        await page.waitForURL(url => new URL(url).pathname === "/");
        await page.locator(".template-picker").waitFor();
        await page.getByRole("heading", { name: "Choose a starting point" }).waitFor();
        expect(await page.getByRole("button", { name: "Export", exact: true }).isDisabled()).toBe(true);
        expect(errors).toEqual([]);
        await context.close();
    });

    it("exports a PDF through the Export CV and Export PDF dialogs", async () => {
        const context = await browser.newContext({ acceptDownloads: true });
        const page = await context.newPage();
        page.setDefaultTimeout(20_000);
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        const id = `visitor-export-${Date.now()}`;
        await seedLocalCv(page, { id, markdown, css, title: "Visitor Export" });
        await page.goto(`${base}/?s=${id}`);
        await page.locator(".code-preview[data-pagination-state=\"ready\"]").waitFor();
        await page.waitForFunction(() => document.querySelectorAll(".preview-page .cv-pages > .cv-sheet").length === 1);
        const exportButton = page.getByRole("button", { name: "Export", exact: true });
        await exportButton.waitFor({ state: "visible" });
        await page.waitForFunction(() => {
            const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Export");
            return typeof (button as any)?.__vnode?.props?.onClick === "function";
        });
        await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
        await exportButton.click();
        const options = page.getByRole("dialog", { name: "Export CV" });
        await options.waitFor();
        await options.getByText("A4 PDF uses the browser print pipeline.").waitFor();
        await options.getByRole("button", { name: "Export PDF" }).click();
        const dialog = page.getByRole("dialog", { name: "Export PDF" });
        await dialog.waitFor();
        expect(await dialog.locator('[data-testid="pdf-save-to"]').inputValue()).toBe("Downloads (browser default)");
        await dialog.locator("input").first().fill("Visitor-Export");
        const submit = dialog.getByRole("button", { name: "Download PDF" });
        await page.waitForFunction(() => {
            const button = [...document.querySelectorAll("button")].find(item => item.textContent?.trim() === "Download PDF");
            return button instanceof HTMLButtonElement && !button.disabled;
        });
        const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
        await submit.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe("Visitor-Export.pdf");
        await dialog.getByText(/Saved Visitor-Export\.pdf to Downloads \(browser default\)/).waitFor();
        expect(await dialog.getByRole("alert").count()).toBe(0);
        expect(errors).toEqual([]);
        await context.close();
    });
});
