#!/usr/bin/env node
import { chromium } from "playwright-core";
import { resolve } from "node:path";

const url = process.argv[2] ?? process.env.CV_URL ?? "http://localhost:3000/";
const output = resolve(process.argv[3] ?? "cv.pdf");
const executablePath = process.env.CHROMIUM_PATH
    ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

const browser = await chromium.launch({ executablePath, headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    // The editor keeps an SSE connection open, so networkidle never occurs.
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".cv-sheet");
    // Wait for hydration to install the editable document stylesheet.
    await page.waitForFunction(() =>
        getComputedStyle(document.querySelector(".cv-sheet")).fontFamily.includes("Georgia"),
    );
    await page.waitForFunction(() => document.fonts?.status === "loaded");
    const sheets = await page.locator(".cv-sheet").count();
    if (sheets < 1) throw new Error("Expected at least 1 CV sheet, found none");

    await page.pdf({
        path: output,
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
        displayHeaderFooter: false,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    console.error(`Exported ${output}`);
} finally {
    await browser.close();
}
