import { existsSync, readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser, type Page } from "playwright-core";
import { seedLocalCv } from "../helpers/local-cv";

/**
 * Private templates in a real browser: save a CV as a template, rename, export, import and delete it.
 * Needs only a local server (SMOKE_BASE_URL) and a browser; no account.
 */
const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (base && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Template tests require a local server");
const executablePath = process.env.CHROMIUM_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const ui = base && existsSync(executablePath) ? describe : describe.skip;
let browser: Browser;
vi.setConfig({ testTimeout: 90_000, hookTimeout: 30_000 });
beforeAll(async () => { if (ui === describe) browser = await chromium.launch({ executablePath, headless: true }); });
afterAll(async () => { await browser?.close(); });

const css = ".resume { padding: 24px; color: #223344; } .resume h1 { color: #123456; }";
const markdown = ":::resume\n\n# Ada Lovelace {.cv-name}\n\n## Experience\n\n- Wrote the first program for the Analytical Engine\n\n:::\n";

const templates = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("cv-sv:local-templates:v1") || "[]") as Array<{ id: string; name: string; markdownSkeleton: string; css: string; tags: string[]; version: number }>);

async function openSessionMenu(page: Page, label: string) {
   await page.getByRole("button", { name: `Session actions for ${label}` }).click();
   await page.getByRole("navigation", { name: "Session actions" }).waitFor();
}

ui("private templates", () => {
   it("saves a CV as a template, then renames, exports, imports and deletes it, leaving the CV alone", async () => {
      const context = await browser.newContext({ acceptDownloads: true });
      const page = await context.newPage();
      page.setDefaultTimeout(20_000);
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      const id = `template-session-${Date.now()}`;
      await seedLocalCv(page, { id, markdown, css, title: "Ada CV" });
      await page.goto(`${base}/?s=${id}`);
      await page.getByRole("button", { name: "Session actions for Ada CV" }).waitFor();

      // Save as template: personal text becomes placeholders, the CV is untouched.
      await openSessionMenu(page, "Ada CV");
      await page.getByRole("button", { name: "Save as template…" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Template name").fill("Ada layout");
      await dialog.getByRole("button", { name: "Save template" }).click();
      await page.getByText("Read only · local").waitFor();
      let stored = await templates(page);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ name: "Ada layout", version: 1, tags: ["local"], css });
      expect(stored[0]!.markdownSkeleton).toContain("## Experience");
      expect(stored[0]!.markdownSkeleton).not.toContain("Ada Lovelace");
      expect(stored[0]!.markdownSkeleton).not.toContain("Analytical Engine");
      expect(JSON.parse(await page.evaluate(id => localStorage.getItem(`cv-sv:session-backup:${id}`)!, id)).markdown).toBe(markdown);

      // Rename.
      await page.getByRole("button", { name: "Rename", exact: true }).click();
      await dialog.getByLabel("Template name").fill("Renamed layout");
      await dialog.getByRole("button", { name: "Rename", exact: true }).click();
      await page.getByRole("heading", { name: "Renamed layout" }).or(page.getByText("Renamed layout").first()).waitFor();
      stored = await templates(page);
      expect(stored[0]!.name).toBe("Renamed layout");

      // Export: a file with the content and no id.
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Export template as a file" }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/\.template\.json$/);
      const exportPath = (await file.path())!;
      const exported = JSON.parse(readFileSync(exportPath, "utf8"));
      expect(exported).toMatchObject({ schema: "ruxt.template-export/1", name: "Renamed layout", css });
      expect(exported.id).toBeUndefined();

      // Import it back: a second, separate template.
      await page.locator("input.template-file-input").setInputFiles(exportPath);
      await page.getByText("Imported template Renamed layout").waitFor();
      stored = await templates(page);
      expect(stored).toHaveLength(2);
      expect(new Set(stored.map(template => template.id)).size).toBe(2);

      // A file that is not an export is refused and adds nothing.
      await page.locator("input.template-file-input").setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from('{"hello":"world"}') });
      await page.getByText("That file is not a Ruxt template export.").waitFor();
      expect(await templates(page)).toHaveLength(2);

      // Delete asks first, removes only that template, and the CV stays.
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await dialog.getByRole("button", { name: "Keep template" }).click();
      expect(await templates(page)).toHaveLength(2);
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await dialog.getByRole("button", { name: "Delete template" }).click();
      await page.waitForFunction(() => !location.search.includes("t="));
      expect(await templates(page)).toHaveLength(1);
      expect(JSON.parse(await page.evaluate(id => localStorage.getItem(`cv-sv:session-backup:${id}`)!, id)).markdown).toBe(markdown);

      // The saved template starts a new CV that keeps the layout and has no personal text.
      await page.reload();
      await page.getByRole("button", { name: /Renamed layout/ }).first().click();
      await page.getByText("Read only · local").waitFor();
      expect(errors).toEqual([]);
      await context.close();
   });
});
