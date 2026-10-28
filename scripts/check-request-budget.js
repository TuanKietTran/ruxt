/**
 * Request-budget guardrail for the Cloudflare build (Workers Free: 100k requests/day). Run after
 * `pnpm cf:build`. Fails when:
 * - the client bundle calls setInterval with a literal delay under 30 s whose callback reaches /api/cvs
 *   (one open tab at 3 s was ~28.8k Worker requests a day);
 * - the server bundle does not turn CV live events off (the Worker answers EventSource with 501);
 * - `.output/public/_headers` lacks the immutable rule for hashed `/_nuxt/*` bundles;
 * - wrangler.json makes static asset hits invoke the Worker (`assets.run_worker_first`).
 *
 * Run: pnpm check:request-budget
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const MIN_INTERVAL_MS = 30_000;
const POLLED_ROUTE = "/api/cvs";
const OUTPUT = ".output";
const failures = [];

const listFiles = (directory, pattern) => existsSync(directory)
   ? readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? listFiles(path, pattern) : pattern.test(entry.name) ? [path] : [];
   })
   : [];

const chunkName = (path) => path.split(/[\\/]/).pop();
/** A reference to the interval timer: `setInterval`, `x.setInterval`, a local alias, or a bound copy. */
const isTimer = (node, aliases) => {
   while (ts.isParenthesizedExpression(node)) node = node.expression;
   if (ts.isIdentifier(node)) return aliases.has(node.text);
   if (ts.isPropertyAccessExpression(node)) return node.name.text === "setInterval";
   return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "bind" && isTimer(node.expression.expression, aliases);
};

/**
 * setInterval calls with a literal delay under 30 s whose callback reaches the polled route. Minifiers
 * alias the timer (`Dt=globalThis.setInterval`), sometimes in a shared chunk that others import, so
 * aliases are followed through assignments, exports and imports across all chunks.
 * Accepts one source string or a list of `{ file, source }` chunks.
 */
export function findShortPolls(input, file = "bundle.js") {
   const chunks = (typeof input === "string" ? [{ file, source: input }] : input).map(chunk => ({
      file: chunk.file,
      sourceFile: ts.createSourceFile(chunk.file, chunk.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS),
      aliases: new Set(["setInterval"]),
   }));
   const exported = new Set();
   for (let changed = true; changed;) {
      changed = false;
      for (const chunk of chunks) {
         const alias = (name) => { if (!chunk.aliases.has(name)) { chunk.aliases.add(name); changed = true; } };
         const visit = (node) => {
            if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isTimer(node.initializer, chunk.aliases)) alias(node.name.text);
            if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left) && isTimer(node.right, chunk.aliases)) alias(node.left.text);
            if (ts.isExportSpecifier(node) && chunk.aliases.has((node.propertyName ?? node.name).text)) {
               const key = `${chunkName(chunk.file)}#${node.name.text}`;
               if (!exported.has(key)) { exported.add(key); changed = true; }
            }
            if (ts.isImportSpecifier(node)) {
               const from = node.parent.parent.parent.moduleSpecifier;
               if (ts.isStringLiteral(from) && exported.has(`${chunkName(from.text)}#${(node.propertyName ?? node.name).text}`)) alias(node.name.text);
            }
            ts.forEachChild(node, visit);
         };
         visit(chunk.sourceFile);
      }
   }

   const findings = [];
   for (const { file: chunkFile, sourceFile, aliases } of chunks) {
      // Minified callbacks are often named functions declared elsewhere in the chunk.
      const declarations = new Map();
      const remember = (name, node) => declarations.set(name, [...declarations.get(name) ?? [], node.getText(sourceFile)]);
      const visitDeclarations = (node) => {
         if (ts.isFunctionDeclaration(node) && node.name) remember(node.name.text, node);
         if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) remember(node.name.text, node.initializer);
         ts.forEachChild(node, visitDeclarations);
      };
      visitDeclarations(sourceFile);
      const visit = (node) => {
         const [callback, delay] = ts.isCallExpression(node) ? node.arguments : [];
         if (callback && delay && ts.isNumericLiteral(delay) && Number(delay.text) < MIN_INTERVAL_MS && isTimer(node.expression, aliases)) {
            const bodies = ts.isIdentifier(callback) ? declarations.get(callback.text) ?? [] : [callback.getText(sourceFile)];
            if (bodies.some(body => body.includes(POLLED_ROUTE))) {
               const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
               findings.push({ file: chunkFile, line: line + 1, ms: Number(delay.text) });
            }
         }
         ts.forEachChild(node, visit);
      };
      visit(sourceFile);
   }
   return findings;
}

/** Header blocks of a Workers/Pages `_headers` file: path -> lower-cased header map (joined like Cloudflare). */
export function parseHeadersFile(text) {
   const rules = new Map();
   let current;
   for (const raw of text.split("\n")) {
      if (!raw.trim() || raw.trim().startsWith("#")) continue;
      if (!/^\s/.test(raw)) {
         current = rules.get(raw.trim()) ?? new Map();
         rules.set(raw.trim(), current);
         continue;
      }
      const separator = raw.indexOf(":");
      if (!current || separator < 0) continue;
      const name = raw.slice(0, separator).trim().toLowerCase();
      const value = raw.slice(separator + 1).trim();
      current.set(name, current.has(name) ? `${current.get(name)}, ${value}` : value);
   }
   return rules;
}

const main = () => {
   const nitro = join(OUTPUT, "nitro.json");
   if (!existsSync(nitro) || JSON.parse(readFileSync(nitro, "utf8")).preset !== "cloudflare-module") {
      console.error("check-request-budget: build the Worker first with `pnpm cf:build`.");
      process.exit(1);
   }

   const clientChunks = listFiles(join(OUTPUT, "public", "_nuxt"), /\.js$/);
   if (!clientChunks.length) failures.push(`${OUTPUT}/public/_nuxt: no client chunks found`);
   for (const finding of findShortPolls(clientChunks.map(file => ({ file, source: readFileSync(file, "utf8") })))) {
      failures.push(`${finding.file}:${finding.line}: setInterval every ${finding.ms} ms reaches ${POLLED_ROUTE}; poll no faster than ${MIN_INTERVAL_MS} ms`);
   }

   const serverChunks = listFiles(join(OUTPUT, "server"), /\.mjs$/).map(file => readFileSync(file, "utf8"));
   if (!serverChunks.some(source => /\bcvLiveEvents"?:\s*(?:false\b|!1\b)/.test(source))) {
      failures.push(`${OUTPUT}/server: runtime config must set public.cvLiveEvents to false for Workers (EventSource gets 501 there)`);
   }

   const headersPath = join(OUTPUT, "public", "_headers");
   const nuxtRule = existsSync(headersPath) ? parseHeadersFile(readFileSync(headersPath, "utf8")).get("/_nuxt/*") : undefined;
   const cacheControl = nuxtRule?.get("cache-control") ?? "";
   if (!/\bimmutable\b/.test(cacheControl) || !/max-age=31536000\b/.test(cacheControl)) {
      failures.push(`${headersPath}: /_nuxt/* must be served with "public, max-age=31536000, immutable" (found: ${cacheControl || "no rule"})`);
   }

   const assets = JSON.parse(readFileSync("wrangler.json", "utf8")).assets ?? {};
   if (assets.run_worker_first) failures.push("wrangler.json: assets.run_worker_first makes every static asset hit a Worker request");

   if (failures.length) {
      console.error(`Request budget check failed:\n- ${failures.join("\n- ")}`);
      process.exit(1);
   }
   console.log(`Request budget check passed (${clientChunks.length} client chunks, /_nuxt/* immutable, assets served without the Worker)`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
