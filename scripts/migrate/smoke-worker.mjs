#!/usr/bin/env node
const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) {
  console.error("usage: node scripts/migrate/smoke-worker.mjs <base-url> [--compare <deno-url>]");
  process.exit(64);
}
const compareAt = process.argv.indexOf("--compare");
const deno = compareAt >= 0 ? process.argv[compareAt + 1] : null;
const routes = ["/", "/login", "/api/health", "/favicon.ico"];
let failed = false;
async function request(origin, route) {
  const response = await fetch(new URL(route, origin), { redirect: "manual" });
  const body = await response.text();
  return { status: response.status, headers: response.headers, body };
}
for (const route of routes) {
  const result = await request(base, route);
  console.log(`worker ${route}: ${result.status}`);
  if (result.status < 200 || result.status >= 400) failed = true;
  if (route === "/") {
    for (const header of ["x-content-type-options", "x-frame-options", "referrer-policy"]) {
      if (!result.headers.has(header)) { console.error(`missing security header ${header}`); failed = true; }
    }
  }
  if (route === "/favicon.ico" && !result.body.length) { console.error("empty static asset"); failed = true; }
  if (deno) {
    const other = await request(deno, route);
    console.log(`deno   ${route}: ${other.status}`);
    if (other.status !== result.status) { console.error(`status differs for ${route}`); failed = true; }
  }
}
const api = await request(base, "/api/preferences");
console.log(`worker /api/preferences: ${api.status}`);
if (api.status !== 401) { console.error(`expected unauthenticated API 401, got ${api.status}`); failed = true; }
if (failed) process.exit(1);
console.log("smoke ok");
