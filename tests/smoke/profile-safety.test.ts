import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";

const baseUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/, "");
const executablePath = process.env.CHROMIUM_PATH ?? (process.platform === "darwin" ? "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" : "");
const ui = baseUrl && executablePath && existsSync(executablePath) ? describe : describe.skip;
let browser: Browser;
beforeAll(async () => { if (baseUrl && executablePath && existsSync(executablePath)) browser = await chromium.launch({ executablePath, headless: true }); });
afterAll(async () => { await browser?.close(); });

ui("profile safety browser regressions", () => {
  it("retains all 15 comma-separated technologies typed immediately, committed with Enter and blur", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const now = Date.now();
    await page.addInitScript(({ now }) => localStorage.setItem("cv-sv:local-profiles:v1", JSON.stringify([{
      version: 1, id: "profile-tech-regression", createdAt: now, updatedAt: now,
      identity: { fullName: "Tech Regression", headline: "", summary: "", location: "" }, contacts: [], experiences: [], skills: [], certifications: [], education: [], languages: [],
      projects: [{ name: "Regression project", url: "", description: "", technologies: [] }],
    }])), { now });
    await page.goto(`${baseUrl}/p`);
    await page.locator(".profile-card__select").filter({ hasText: "Tech Regression" }).click();
    await page.getByRole("button", { name: /Technologies/ }).click();
    const input = page.locator("textarea.profile-input").last();
    const tokens = ["Go", "CQRS", "PostgreSQL", "OpenAPI", "REST", "Idempotency", "TypeScript", "Vue", "Nuxt", "Vitest", "Playwright", "Docker", "SQLite", "Redis", "GraphQL"];
    await input.pressSequentially(tokens.join(", "), { delay: 5 });
    await input.press("Enter");
    await expect.poll(async () => page.locator(".chips").last().locator("span").allTextContents()).toEqual(tokens);
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("cv-sv:local-profiles:v1") || "[]")[0].projects[0].technologies)).toEqual(tokens);
    await page.locator(".editable-field__display").last().click();
    const blurInput = page.locator("textarea.profile-input").last();
    await blurInput.fill("Go, CQRS, PostgreSQL");
    await page.getByRole("heading", { name: "Projects" }).click();
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("cv-sv:local-profiles:v1") || "[]")[0].projects[0].technologies)).toEqual(["Go", "CQRS", "PostgreSQL"]);
    await page.locator(".editable-field__display").last().click();
    const tabInput = page.locator("textarea.profile-input").last();
    await tabInput.fill("Go, CQRS, PostgreSQL, OpenAPI");
    await tabInput.press("Tab");
    await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("cv-sv:local-profiles:v1") || "[]")[0].projects[0].technologies)).toEqual(["Go", "CQRS", "PostgreSQL", "OpenAPI"]);
    await context.close();
  }, 30_000);

  it("keeps the selected duplicate-name profile stable across five edits and offers rename/duplicate warnings", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const now = Date.now();
    const profiles = ["profile-identity-a", "profile-identity-b"].map((id, index) => ({
      version: 1, id, createdAt: now - index - 1, updatedAt: now - index - 1,
      identity: { fullName: "Same Name", headline: index ? "Other profile" : "Selected profile", summary: "Before", location: "A" },
      contacts: [], experiences: [], skills: [], certifications: index ? [] : [{ name: "AZ-X", issuer: "Old issuer", start: "2024", end: "2025" }], education: [], languages: [],
      projects: [{ name: "Project", url: "", description: "Before", technologies: [] }],
    }));
    await page.addInitScript(profiles => localStorage.setItem("cv-sv:local-profiles:v1", JSON.stringify(profiles)), profiles);
    await page.goto(`${baseUrl}/p`);
    await page.locator(".profile-card__select").filter({ hasText: "Selected profile" }).click();
    await page.locator(".identity-name .editable-field__display").click();
    await page.locator(".identity-name textarea.profile-input").fill("Pending edit");
    // Stress removal-focusout ordering without the pointer's normal pre-click blur.
    await page.locator(".profile-card__select").filter({ hasText: "Other profile" }).evaluate(element => (element as HTMLButtonElement).click());
    await expect.poll(async () => page.locator(".profile-card.active .profile-card__select").textContent()).toContain("Other profile");
    const initialOther = await page.evaluate(() => JSON.parse(localStorage.getItem("cv-sv:local-profiles:v1") || "[]").find((profile: any) => profile.id === "profile-identity-b"));
    expect(initialOther).toEqual(profiles[1]);
    expect(initialOther.updatedAt).toBe(now - 2);
    await page.locator(".profile-card__select").filter({ hasText: "Selected profile" }).click();
    // Actual pointer path: blur may save the originating profile, never its destination.
    await page.locator(".identity-name .editable-field__display").click();
    await page.locator(".identity-name textarea.profile-input").fill("Real pending edit");
    await page.locator(".profile-card__select").filter({ hasText: "Other profile" }).click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("cv-sv:local-profiles:v1") || "[]").find((profile: any) => profile.id === "profile-identity-b"))).toEqual(profiles[1]);
    await page.locator(".profile-card__select").filter({ hasText: "Selected profile" }).click();
    const edit = async (field: ReturnType<typeof page.locator>, value: string) => {
      await field.locator(".editable-field__display").click();
      const input = field.locator("textarea.profile-input");
      await input.fill(value);
      await page.getByRole("heading", { name: "Profile identity" }).click();
    };
    await edit(page.locator(".identity-name"), "Same Name Edited");
    await edit(page.locator(".identity-headline"), "Selected profile updated");
    await edit(page.locator(".identity-location"), "London");
    await edit(page.locator(".profile-identity .editable-field").nth(2), "Five edit regression");
    await edit(page.locator('[data-entry="projects-0"] .entry-grid > .editable-field').nth(3), "Updated project description");
    await edit(page.locator(".profile-columns .profile-section").first().locator(".entry-card .editable-field").nth(1), "New issuer");
    const projects = page.locator(".profile-section").filter({ has: page.getByRole("heading", { name: "Projects" }) });
    await projects.getByRole("button", { name: "＋ Add" }).click();
    const addedProject = page.locator('[data-entry="projects-1"]');
    await addedProject.locator("textarea.profile-input").fill("Temporary project");
    await addedProject.locator("textarea.profile-input").press("Enter");
    await addedProject.getByRole("button", { name: "Remove project" }).click();
    await expect.poll(async () => page.locator(".profile-card.active .profile-card__select").textContent()).toContain("Same Name Edited");
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("cv-sv:local-profiles:v1") || "[]"));
    const selected = stored.find((profile: any) => profile.id === "profile-identity-a");
    const other = stored.find((profile: any) => profile.id === "profile-identity-b");
    expect(selected.identity).toMatchObject({ fullName: "Same Name Edited", headline: "Selected profile updated", location: "London", summary: "Five edit regression" });
    expect(selected.projects[0].description).toBe("Updated project description");
    expect(selected.certifications[0]).toMatchObject({ issuer: "New issuer", start: "2024", end: "2025" });
    expect(other.updatedAt).toBe(now - 2);
    const dialogHandler = (dialog: import("playwright-core").Dialog) => { void dialog.accept(dialog.type() === "prompt" ? "Same Name" : undefined); };
    page.on("dialog", dialogHandler);
    await page.locator(".profile-card.active button", { hasText: "Rename" }).click();
    page.off("dialog", dialogHandler);
    await expect.poll(() => page.locator(".duplicate-warning").count()).toBe(2);
    await page.locator(".profile-card.active").getByRole("button", { name: "Duplicate", exact: true }).click();
    await expect.poll(() => page.locator(".profile-card").count()).toBe(3);
    await expect.poll(() => page.locator(".duplicate-warning").count()).toBe(3);
    await context.close();
  }, 30_000);

  it("rejects an apply preview if the session changed before confirmation", async () => {
    const context = await browser.newContext(); const page = await context.newPage();
    const id = crypto.randomUUID().replaceAll("-", "");
    const created = await context.request.post(`${baseUrl}/api/cvs`, { data: { id, title: `Stale preview ${id}`, markdown: "# Stale target\\n\\nOriginal content\\n", css: "body {}" } });
    expect(created.ok()).toBe(true); const initial = await created.json();
    const now = Date.now(); const profile = { version: 1, id: `profile-stale-${id}`, createdAt: now, updatedAt: now, identity: { fullName: "Stale Profile", headline: "", summary: "", location: "" }, contacts: [], experiences: [], skills: [], certifications: [], education: [], projects: [], languages: [] };
    await page.addInitScript(profile => localStorage.setItem("cv-sv:local-profiles:v1", JSON.stringify([profile])), profile);
    await page.goto(`${baseUrl}/p`); await page.locator(".profile-card__select").filter({ hasText: "Stale Profile" }).click();
    await page.getByRole("button", { name: "Apply to sessions…" }).click();
    await page.locator(`.apply-session input[value="${id}"]`).check();
    await page.getByRole("button", { name: "Preview overwrite" }).click();
    const concurrent = "# Stale target\\n\\nConcurrent editor content\\n";
    const changed = await context.request.put(`${baseUrl}/api/cvs/${id}`, { data: { markdown: concurrent, css: "body {}", expectedRevision: initial.revision } });
    expect(changed.ok()).toBe(true);
    await page.getByRole("checkbox", { name: /I reviewed the before\/after preview/ }).check();
    const applyResponsePromise = page.waitForResponse(response => response.url().endsWith("/api/cv-profiles/apply") && response.request().method() === "POST");
    await page.getByRole("button", { name: /Confirm & apply/ }).click();
    const applyResponse = await applyResponsePromise;
    expect(applyResponse.ok()).toBe(true);
    const applyResult = await applyResponse.json();
    expect(applyResult.results[0]).toMatchObject({ ok: false });
    await expect.poll(async () => (await context.request.get(`${baseUrl}/api/cvs/${id}`)).json()).toMatchObject({ markdown: concurrent });
    await context.close();
  }, 60_000);

  it("previews profile switch, requires confirmation, and restores the previous source on undo", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const id = crypto.randomUUID().replaceAll("-", "");
    const original = "# Switch Original\n\nPrivate custom objective.\n\n## Experience\n\n- Hand-edited detail\n";
    const response = await context.request.post(`${baseUrl}/api/cvs`, { data: { id, title: "Switch safety", markdown: original, css: ".resume { color: navy; }" } });
    expect(response.ok()).toBe(true);
    const now = Date.now();
    const profile = { version: 1, id: "profile-switch-regression", createdAt: now, updatedAt: now,
      identity: { fullName: "Switched Candidate", headline: "Engineer", summary: "New summary", location: "London" }, contacts: [],
      experiences: [{ title: "Developer", company: "Replacement Co", location: "", start: "2024", end: "Present", highlights: ["New content"] }],
      skills: [], certifications: [], education: [], projects: [], languages: [] };
    await page.addInitScript(profile => localStorage.setItem("cv-sv:local-profiles:v1", JSON.stringify([profile])), profile);
    await page.goto(`${baseUrl}/?s=${id}`);
    await page.getByLabel("Switch profile").selectOption(profile.id);
    await page.getByRole("dialog", { name: "Review profile overwrite" }).waitFor({ state: "visible" });
    const preview = await page.locator(".switch-diff").innerText();
    expect(preview).toContain("Private custom objective."); expect(preview).toContain("New content"); expect(preview).toContain("color: navy");
    const confirm = page.getByRole("button", { name: "Confirm switch" });
    expect(await confirm.isDisabled()).toBe(true);
    await page.getByRole("checkbox", { name: /I reviewed this before\/after preview/ }).check();
    await confirm.click();
    await page.getByRole("button", { name: "Undo switch" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Undo switch" }).click();
    await expect.poll(async () => (await context.request.get(`${baseUrl}/api/cvs/${id}`)).json()).toMatchObject({ markdown: original, css: ".resume { color: navy; }" });
    await context.close();
  }, 60_000);

  it("requires reviewed apply preview and restores the exact previous session on undo", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const id = crypto.randomUUID().replaceAll("-", "");
    const original = "# Original Candidate\n\nCustom objective that must be visible in preview.\n\n## Experience\n\n- Hand-edited bullet\n";
    const created = await context.request.post(`${baseUrl}/api/cvs`, { data: { id, title: "Safety preview session", markdown: original, css: ".resume { color: black; }" } });
    expect(created.ok()).toBe(true);
    const now = Date.now();
    await page.addInitScript(({ now }) => localStorage.setItem("cv-sv:local-profiles:v1", JSON.stringify([{
      version: 1, id: "profile-preview-regression", createdAt: now, updatedAt: now,
      identity: { fullName: "Preview Candidate", headline: "Engineer", summary: "New summary", location: "London" }, contacts: [],
      experiences: [{ title: "Developer", company: "New Company", location: "", start: "2024", end: "Present", highlights: ["Replacement bullet"] }],
      skills: [], certifications: [], education: [], projects: [], languages: [],
    }])), { now });
    await page.goto(`${baseUrl}/p`);
    await page.locator(".profile-card__select").filter({ hasText: "Preview Candidate" }).click();
    await page.getByRole("button", { name: "Apply to sessions…" }).click();
    await page.locator(`.apply-session input[value="${id}"]`).check();
    await page.getByRole("button", { name: "Preview overwrite" }).click();
    const previewText = await page.locator(".overwrite-preview").innerText();
    expect(previewText).toContain("Custom objective that must be visible in preview.");
    expect(previewText).toContain("Replacement bullet");
    expect(await page.getByRole("button", { name: /Confirm & apply/ }).isDisabled()).toBe(true);
    await page.getByRole("checkbox", { name: /I reviewed the before\/after preview/ }).scrollIntoViewIfNeeded();
    await page.getByRole("checkbox", { name: /I reviewed the before\/after preview/ }).check();
    await page.getByRole("button", { name: /Confirm & apply/ }).click();
    await page.getByRole("button", { name: "Undo this profile change" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Undo this profile change" }).click();
    await expect.poll(async () => (await context.request.get(`${baseUrl}/api/cvs/${id}`)).json()).toMatchObject({ markdown: original, css: ".resume { color: black; }" });
    await context.close();
  }, 60_000);
});
