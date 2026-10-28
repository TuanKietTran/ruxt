/**
 * Count the Worker requests one open editor tab makes. Static assets are counted separately because
 * Workers Static Assets serve them without invoking the Worker.
 *
 * Start a server first, preferably the Cloudflare build under workerd (dummy test keys only):
 *   pnpm cf:build && pnpm exec wrangler dev --config wrangler.json --local --port 8799 \
 *     --var NUXT_PUBLIC_CLERK_PUBLISHABLE_KEY:pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk \
 *     --var NUXT_CLERK_SECRET_KEY:sk_test_x --var NUXT_SESSION_SECRET:local-measurement-session-secret-32chars
 * Then: pnpm measure:requests [baseUrl] [--json]
 *
 * A virtual clock compresses ten idle minutes into a few seconds, so per-day figures are measured
 * rates multiplied by 144, not estimates. PLAYWRIGHT_CHROMIUM_EXECUTABLE overrides the browser path.
 */
import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const BASE = (args.find(arg => !arg.startsWith("--")) ?? "http://localhost:8799").replace(/\/$/, "");
const asJson = args.includes("--json");
const IDLE_MINUTES = 10;
const PER_DAY = (24 * 60) / IDLE_MINUTES;

const isAsset = (pathname) => pathname.startsWith("/_nuxt/") || /\.(?:ico|txt|png|svg|jpe?g|webp|woff2?|css|js|json|webmanifest)$/.test(pathname) && !pathname.startsWith("/api/");
const routeOf = (method, pathname) => `${method} ${pathname.replace(/\/api\/cvs\/[^/]+/, "/api/cvs/:id")}`;

const id = crypto.randomUUID();
const created = await fetch(`${BASE}/api/cvs`, {
   method: "POST",
   headers: { "content-type": "application/json" },
   body: JSON.stringify({ id, title: "Request budget", markdown: "# Request budget\n\nBody.\n", css: "body { color: black; }" }),
});
if (!created.ok) throw new Error(`could not create a session: ${created.status} ${await created.text()}`);

const context = await chromium.launchPersistentContext("", {
   executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined),
   args: ["--no-proxy-server"],
   viewport: { width: 1400, height: 900 },
});
await context.addCookies([{ name: "__clerk_db_jwt", value: "dvb_x", url: BASE }]);
await context.route(/clerk\.accounts\.dev|clerk-telemetry|clerk\.com/, route => route.abort());
const page = context.pages()[0] ?? await context.newPage();

let phase = "open";
const phases = new Map([["open", { worker: new Map(), assets: 0 }]]);
const enter = (name) => {
   phase = name;
   if (!phases.has(name)) phases.set(name, { worker: new Map(), assets: 0 });
};
const record = (request) => {
   const url = new URL(request.url());
   if (url.origin !== BASE) return;
   const bucket = phases.get(phase) ?? { worker: new Map(), assets: 0 };
   phases.set(phase, bucket);
   if (isAsset(url.pathname)) bucket.assets += 1;
   else {
      const key = routeOf(request.method(), url.pathname);
      bucket.worker.set(key, (bucket.worker.get(key) ?? 0) + 1);
   }
};
page.on("request", record);
const settle = ms => page.waitForTimeout(ms);
const advance = async (minutes) => {
   for (let second = 0; second < minutes * 60; second++) {
      await page.clock.runFor(1_000);
      if (second % 10 === 0) await settle(15);
   }
   await settle(1_000);
};
const setVisibility = state => page.evaluate((next) => {
   Object.defineProperty(document, "visibilityState", { configurable: true, get: () => next });
   Object.defineProperty(document, "hidden", { configurable: true, get: () => next === "hidden" });
   document.dispatchEvent(new Event("visibilitychange"));
   window.dispatchEvent(new Event(next === "hidden" ? "blur" : "focus"));
}, state);
const typeAtEnd = async (text) => {
   await page.click(".cm-content");
   await page.keyboard.press("Control+End");
   await page.keyboard.type(text);
};

try {
   await page.clock.install();
   await page.goto(`${BASE}/?s=${id}`, { waitUntil: "load" });
   await settle(3_000);

   enter(`idle visible ${IDLE_MINUTES} min`);
   await advance(IDLE_MINUTES);

   // Hide first and let in-flight requests land, so they count toward the visible phase that started them.
   await setVisibility("hidden");
   await settle(1_000);
   enter(`hidden ${IDLE_MINUTES} min`);
   await advance(IDLE_MINUTES);

   enter("return to tab");
   await setVisibility("visible");
   await settle(2_000);

   for (const words of [10, 40]) {
      enter(`type ${words} words, 700 ms pauses`);
      for (let word = 0; word < words; word++) {
         await typeAtEnd(` w${words}-${word}`);
         await page.clock.runFor(700);
         await settle(50);
      }
      await page.clock.runFor(15_000);
      await settle(2_000);
   }

   enter("edit then leave at once");
   await typeAtEnd(" leaving-now");
   await page.goto("about:blank");
   await settle(2_000);
   const stored = await (await fetch(`${BASE}/api/cvs/${id}`)).json();
   const flushedOnLeave = String(stored.markdown ?? "").includes("leaving-now");

   const rows = [...phases].map(([name, bucket]) => {
      const total = [...bucket.worker.values()].reduce((sum, count) => sum + count, 0);
      return { phase: name, workerRequests: total, assets: bucket.assets, routes: Object.fromEntries(bucket.worker) };
   });
   const rate = name => rows.find(row => row.phase === name)?.workerRequests ?? 0;
   const summary = {
      base: BASE,
      rows,
      perDay: {
         idleVisibleTab: rate(`idle visible ${IDLE_MINUTES} min`) * PER_DAY,
         hiddenTab: rate(`hidden ${IDLE_MINUTES} min`) * PER_DAY,
      },
      flushedOnLeave,
   };
   if (asJson) console.log(JSON.stringify(summary, null, 2));
   else {
      for (const row of rows) console.log(`${row.phase.padEnd(32)} worker=${String(row.workerRequests).padStart(4)} assets=${String(row.assets).padStart(4)}  ${JSON.stringify(row.routes)}`);
      console.log(`per day (extrapolated x${PER_DAY}): idle visible tab=${summary.perDay.idleVisibleTab}, hidden tab=${summary.perDay.hiddenTab}`);
      console.log(`edit typed just before leaving reached the server: ${flushedOnLeave}`);
   }
} finally {
   await context.close();
   await fetch(`${BASE}/api/cvs/${id}`, { method: "DELETE" }).catch(() => undefined);
}
