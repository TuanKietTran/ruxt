/**
 * Session continuity across deployments. Builds must exist (`NITRO_PRESET=node-server nuxi build`).
 * One browser profile on one origin keeps its localStorage while the server underneath is replaced by
 * "deployments" with separate, empty storage, stopped mid-edit, and down before a draft registers.
 * Every session the browser has seen must survive with all of its edits.
 *
 * Run: pnpm test:session-continuity   (PLAYWRIGHT_CHROMIUM_EXECUTABLE overrides the browser path)
 */
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SP = tmpdir();
const ROOT = process.cwd();
const PORT = Number(process.env.CONTINUITY_PORT ?? 3124);
const BASE = `http://localhost:${PORT}`;
const KEY = "pk_test_" + Buffer.from("example.clerk.accounts.dev$").toString("base64");
let server;
let failures = 0;
const check = (label, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? " — " + detail : ""}`); if (!ok) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function startServer(dataDir) {
  server = spawn("node", [join(ROOT, ".output/server/index.mjs")], {
    // Storage paths are relative to the working directory, so each deployment gets its own cwd.
    cwd: dataDir,
    env: { ...process.env, PORT: String(PORT), NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY: KEY, NUXT_CLERK_SECRET_KEY: "sk_test_x" },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/api/health")).ok) return; } catch {} await sleep(250); }
  throw new Error("server did not start");
}
async function stopServer() {
  if (!server) return;
  const s = server; server = undefined;
  s.kill("SIGTERM");
  await new Promise(r => s.once("exit", r));
}
const api = async path => (await fetch(BASE + path)).json();
const serverSessions = async () => (await api("/api/cvs")).documents.map(d => d.id);

if (!existsSync(join(ROOT, ".output/server/index.mjs"))) throw new Error("Build first: NITRO_PRESET=node-server nuxi build");
const dirA = mkdtempSync(join(SP, "deployA-"));
const dirB = mkdtempSync(join(SP, "deployB-"));
const dirC = mkdtempSync(join(SP, "deployC-"));
const profileDir = mkdtempSync(join(SP, "browser-"));
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
  args: ["--no-proxy-server"],
  viewport: { width: 1400, height: 900 },
});
await context.addCookies([{ name: "__clerk_db_jwt", value: "dvb_x", url: BASE }]);
await context.route(/clerk\.accounts\.dev/, r => r.abort());
const page = context.pages()[0] ?? await context.newPage();
page.on("pageerror", e => !/Clerk/.test(e.message) && console.log("  pageerror:", e.message));
const typeInEditor = async text => { await page.click(".cm-content"); await page.keyboard.press("Control+End"); await page.keyboard.type(text); };
const sessionIdFromUrl = () => new URL(page.url()).searchParams.get("s");
const goto = async path => { await page.goto(BASE + path, { waitUntil: "load" }); await page.waitForTimeout(1500); };

try {
  // Deployment A: create two sessions with edits
  await startServer(dirA);
  await goto("/");
  await typeInEditor("\n\nAlpha session body");
  await page.waitForURL(/\?s=/, { timeout: 10000 });
  const idAlpha = sessionIdFromUrl();
  await page.waitForTimeout(800);
  await typeInEditor("\nAlpha second edit");
  await page.waitForTimeout(1500);
  await goto("/");
  await typeInEditor("\n\nBeta session body");
  await page.waitForURL(/\?s=/, { timeout: 10000 });
  const idBeta = sessionIdFromUrl();
  await page.waitForTimeout(1500);
  const aDocs = await serverSessions();
  check("deploy A stored both sessions", aDocs.includes(idAlpha) && aDocs.includes(idBeta), aDocs.join(","));

  // ---- Scenario 1: new deployment B with empty storage
  await stopServer();
  await startServer(dirB);
  check("deploy B starts without the sessions", !(await serverSessions()).includes(idAlpha));
  await goto("/");
  const listed = await page.$$eval(".document-tree__item", els => els.map(e => e.getAttribute("href") || ""));
  check("sidebar on deploy B lists both sessions", listed.some(h => h.includes(idAlpha)) && listed.some(h => h.includes(idBeta)), listed.join(" | "));
  await page.waitForTimeout(1500);
  const bDocs = await serverSessions();
  check("deploy B re-created both sessions from the browser", bDocs.includes(idAlpha) && bDocs.includes(idBeta), bDocs.join(","));
  const alpha = await api(`/api/cvs/${idAlpha}`);
  check("recovered Alpha keeps every edit", alpha.markdown?.includes("Alpha session body") && alpha.markdown?.includes("Alpha second edit"));
  await goto(`/?s=${idBeta}`);
  const betaText = await page.textContent(".cm-content");
  check("opening Beta on deploy B shows its content", betaText.includes("Beta session body"));

  // ---- Scenario 2: server goes down mid-edit (rollout), edit is retried without further typing
  await stopServer();
  await typeInEditor("\nEdited during rollout");
  await page.waitForTimeout(1500);
  const stateDown = await page.textContent(".save-state");
  check("save shows offline while the server is down", stateDown.trim() === "offline", stateDown);
  await startServer(dirB);
  await page.waitForTimeout(12000);
  const betaAfter = await api(`/api/cvs/${idBeta}`);
  check("edit made during the outage reached the server by retry", betaAfter.markdown?.includes("Edited during rollout"));
  check("save state recovered", (await page.textContent(".save-state")).trim() === "saved");

  // ---- Scenario 3: new draft typed while the server is down survives a reload onto a new deployment
  await goto("/");
  await stopServer();
  await typeInEditor("\n\nGamma draft written offline");
  await page.waitForTimeout(1200);
  await startServer(dirC);
  await goto("/");
  await page.waitForURL(/\?s=/, { timeout: 15000 }).catch(() => {});
  const idGamma = sessionIdFromUrl();
  const gamma = idGamma ? await api(`/api/cvs/${idGamma}`) : {};
  check("offline new draft was restored and registered on deploy C", Boolean(gamma.markdown?.includes("Gamma draft written offline")), page.url());
  await page.waitForTimeout(1500);
  const cDocs = await serverSessions();
  check("deploy C also re-created Alpha and Beta", cDocs.includes(idAlpha) && cDocs.includes(idBeta), cDocs.join(","));
  const betaC = await api(`/api/cvs/${idBeta}`);
  check("Beta on deploy C has the rollout edit", betaC.markdown?.includes("Edited during rollout"));

  // ---- Scenario 4: a tab that remembered its session under the old key still returns to it
  await goto("/p");
  await page.evaluate(id => { for (const k of Object.keys(sessionStorage)) if (k.startsWith("cv-sv:last")) sessionStorage.removeItem(k); sessionStorage.setItem("cv-sv:last-cv-route", `/?s=${id}`); }, idAlpha);
  await goto("/p");
  await page.click('.activity-bar__top a[aria-label="CV editor"]');
  await page.waitForTimeout(1500);
  check("CV icon returns to the session remembered under the legacy key", page.url().includes(idAlpha), page.url());

  // ---- Scenario 5: deleting a session does not resurrect it
  const before = await serverSessions();
  await page.evaluate(() => { window.confirm = () => true; });
  await page.click(`.document-tree__item[href*="${idGamma}"]`, { button: "right" });
  await page.click(".document-context-menu__danger");
  await page.waitForTimeout(1500);
  await goto("/");
  await page.waitForTimeout(1500);
  const after = await serverSessions();
  check("deleted session stays deleted after reload", before.includes(idGamma) && !after.includes(idGamma), after.join(","));
} catch (error) {
  failures++;
  console.log("ERROR", error.message);
} finally {
  await context.close();
  await stopServer();
  for (const d of [dirA, dirB, dirC, profileDir]) rmSync(d, { recursive: true, force: true });
  console.log(failures ? `${failures} FAILED` : "ALL PASSED");
  process.exit(failures ? 1 : 0);
}
