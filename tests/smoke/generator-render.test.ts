import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright-core";

const base = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
if (base && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) throw new Error("Generator browser tests require a local server");
const executablePath = process.env.CHROMIUM_PATH ?? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const ui = base && existsSync(executablePath) ? describe : describe.skip;
let browser: Browser;
vi.setConfig({ testTimeout: 45_000, hookTimeout: 30_000 });
beforeAll(async () => {
    if (base && existsSync(executablePath)) browser = await chromium.launch({ executablePath, headless: true });
});
afterAll(async () => { await browser?.close(); });
const template = JSON.parse(readFileSync(new URL("../../server/data/cv-templates/harvard.v1.json", import.meta.url), "utf8"));

ui("profile generator real Harvard render", () => {
    it("applies to a fresh session without manual markdown edits and renders structured data", async () => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const id = randomUUID();
        const created = await context.request.post(`${base}/api/cvs`, { data: { id, markdown: template.markdownSkeleton, css: template.css } });
        expect(created.status()).toBe(201);
        const profile = {
            identity: { fullName: "Generator Regression", location: "Ho Chi Minh City, Vietnam", headline: "", summary: "" },
            contacts: [{ kind: "github", label: "", value: "github.com/regression" }],
            education: [{ school: "HO CHI MINH CITY UNIVERSITY OF TECHNOLOGY", degree: "Bachelor’s degree, Computer Science", location: "Ho Chi Minh City, Vietnam", start: "Oct 2020", end: "Oct 2024", details: "GPA: 3.2" }],
            certifications: [{ name: "AZ-400 DevOps Engineer Expert", issuer: "Microsoft", start: "Apr 2026", end: "Apr 2027" }, { name: "AZ-104 Azure Administrator Associate", issuer: "Microsoft", start: "Apr 2026", end: "Apr 2027" }, { name: "TOEIC 870 Listening & Reading" }],
            experiences: [
                { company: "OMNIA SYSTEM VIETNAM", title: "Software Engineer", location: "Ho Chi Minh City, Vietnam", start: "Jan 2024", end: "Aug 2026", highlights: ["Software Engineer unique contribution"] },
                { company: "OMNIA SYSTEM VIETNAM", title: "Experienced Engineer", location: "Ho Chi Minh City, Vietnam", start: "Jan 2026", end: "Aug 2026", highlights: ["Experienced Engineer unique contribution"] },
                { company: "OMNIA SYSTEM VIETNAM", title: "Junior Engineer", location: "Ho Chi Minh City, Vietnam", start: "Jan 2024", end: "Dec 2025", highlights: ["Junior Engineer unique contribution"] },
            ],
            projects: [{ name: "PROJECT REGRESSION", url: "github.com/regression/project", description: "A reproducible project.", technologies: ["Go", "PostgreSQL"] }],
            skills: [], languages: [],
        };
        const response = await context.request.post(`${base}/api/cv-profiles/apply`, { data: { profile, documentIds: [id], expectedRevisions: { [id]: 1 } } });
        expect(response.status()).toBe(200);
        const applied = await response.json();
        expect(applied.applied).toBe(1);
        expect(applied.results[0].document.markdown).toContain("**Stack:** Go, PostgreSQL");
        await page.goto(`${base}/?s=${id}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
        const preview = page.locator(".preview-page");
        await preview.locator(".cv-sheet .resume").first().waitFor();
        await page.waitForFunction(() => document.querySelector(".preview-page")?.textContent?.includes("TOEIC 870"));
        const education = preview.locator("table").filter({ hasText: "HO CHI MINH CITY UNIVERSITY OF TECHNOLOGY" });
        expect(await education.locator("tr").first().locator("th,td").count()).toBe(3);
        expect(await education.textContent()).toContain("GPA: 3.2");
        const certifications = preview.locator("table").filter({ hasText: "AZ-400" });
        expect(await certifications.count()).toBe(1);
        expect(await certifications.locator("tr").count()).toBe(3);
        expect(await certifications.textContent()).toContain("Microsoft");
        expect(await certifications.textContent()).toContain("Apr 2026 – Apr 2027");
        const text = await preview.textContent();
        expect(text?.match(/OMNIA SYSTEM VIETNAM/g)).toHaveLength(1);
        expect(text).not.toContain("| :--");
        for (const title of ["Software Engineer", "Experienced Engineer", "Junior Engineer"]) {
            const roleTable = preview.locator("table").filter({ hasText: title }).first();
            expect(await roleTable.count()).toBe(1);
            const following = await roleTable.evaluate(element => element.nextElementSibling?.textContent);
            expect(following).toContain(`${title} unique contribution`);
        }
        expect(await preview.locator('a[href="https://github.com/regression/project"]').count()).toBe(1);
        expect(await preview.locator('a[href="https://github.com/regression"]').count()).toBe(1);
        const artifacts = fileURLToPath(new URL("../../../evidence/", import.meta.url));
        mkdirSync(artifacts, { recursive: true });
        await preview.screenshot({ path: `${artifacts}/generator-profile-applied.png` });
        await context.close();
    });
});
