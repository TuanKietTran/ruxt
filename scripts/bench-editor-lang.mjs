#!/usr/bin/env node
/**
 * Bench: renderCvMarkdownToHtml + CodeMirror indicator regex scan on a
 * generated 10,000-line CV document. Prints "before" (baseline) numbers;
 * nothing in the app has been optimised yet, so every number here is the
 * reference the lang slices will be measured against.
 *
 * Usage: node scripts/bench-editor-lang.mjs [--lines 10000] [--render-runs 5] [--scan-runs 20]
 *
 * cvMarkdown.ts is TypeScript inside packages/editor, whose deps are not
 * hoisted to the repo root, so a direct import fails on `unified`. The bench
 * resolves the installed @ruxt/editor package in the pnpm store, rewrites
 * the source file's bare imports to the resolved absolute paths in a temp
 * copy inside scripts/ (outside node_modules, so Node type stripping
 * applies), imports that, and always deletes the temp copy on exit.
 */
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? Number(args[index + 1]) : fallback;
};
const lineCount = option("lines", 10_000);
const renderRuns = option("render-runs", 5);
const scanRuns = option("scan-runs", 20);

function generateDocument(lines) {
    const out = [];
    let i = 0;
    const push = text => { if (out.length < lines) out.push(text); };
    push(":::resume");
    push("");
    push("# Bench Name {.cv-name}");
    push("");
    while (out.length < lines - 1) {
        i++;
        push(`## Section ${i} {#section-${i}}`);
        push("");
        push(`Paragraph ${i} with **bold**, a [link](https://example.com/${i}) and trailing attributes. {#p-${i} .cv-name}`);
        push("");
        push(`- Item ${i}a with plain text`);
        push(`- Item ${i}b with an attribute block {.cv-name}`);
        push("");
        push("---");
        push("");
    }
    push(":::");
    return out.slice(0, lines).join("\n");
}

function loadIndicatorPatterns() {
    const source = readFileSync(join(root, "packages/editor/app/composables/useCodeMirror.ts"), "utf8");
    const attribute = source.match(/const attributePattern = (\/[^\n]+\/g);/);
    const directive = source.match(/const directivePattern = (\/[^\n]+\/);/);
    if (!attribute || !directive) throw new Error("indicator patterns not found in useCodeMirror.ts");
    return { attributePattern: eval(attribute[1]), directivePattern: eval(directive[1]) };
}

/** Mirror of markdownIndicatorDecorations in useCodeMirror.ts: per line, directive match wins, else all attribute matches. */
function scanIndicators(lines, { attributePattern, directivePattern }) {
    let ranges = 0;
    for (const line of lines) {
        attributePattern.lastIndex = 0;
        if (directivePattern.test(line)) { ranges++; continue; }
        for (const _match of line.matchAll(attributePattern)) ranges++;
    }
    return ranges;
}

async function loadRender() {
    const sourcePath = join(root, "packages/editor/app/utils/cvMarkdown.ts");
    try {
        return await import(pathToFileURL(sourcePath).href);
    } catch { /* deps not hoisted; fall through to the rewritten temp copy */ }
    const store = join(root, "node_modules", ".pnpm");
    const entry = existsSync(store) && readdirSync(store).find(name => name.startsWith("@ruxt+editor@"));
    if (!entry) throw new Error("installed @ruxt/editor not found in node_modules/.pnpm; run pnpm install first");
    const editorDir = join(store, entry, "node_modules", "@ruxt", "editor");
    const require = createRequire(join(editorDir, "package.json"));
    const packages = ["unified", "remark-parse", "remark-gfm", "remark-directive", "remark-rehype", "rehype-sanitize", "rehype-stringify"];
    let source = readFileSync(sourcePath, "utf8");
    for (const pkg of packages) {
        const resolved = pathToFileURL(require.resolve(pkg)).href;
        source = source.replaceAll(`from "${pkg}"`, `from "${resolved}"`);
    }
    const tempPath = join(root, "scripts", ".bench-editor-lang.tmp.mts");
    writeFileSync(tempPath, source);
    try {
        return await import(pathToFileURL(tempPath).href);
    } finally {
        rmSync(tempPath, { force: true });
    }
}

function timeRuns(fn, runs) {
    fn(); // warmup, untimed
    const samples = [];
    let result;
    for (let run = 0; run < runs; run++) {
        const start = performance.now();
        result = fn();
        samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    return { median: samples[Math.floor(samples.length / 2)], min: samples[0], max: samples[samples.length - 1], result };
}

const markdown = generateDocument(lineCount);
const lines = markdown.split("\n");
console.log(`bench-editor-lang BEFORE (baseline, no lang optimisation applied)`);
console.log(`document: ${lines.length} lines, ${Buffer.byteLength(markdown)} bytes`);

const { renderCvMarkdownToHtml, splitCvSheets } = await loadRender();
const render = timeRuns(() => renderCvMarkdownToHtml(markdown), renderRuns);
const sheets = splitCvSheets(render.result);
console.log(`renderCvMarkdownToHtml: median ${render.median.toFixed(1)}ms min ${render.min.toFixed(1)}ms max ${render.max.toFixed(1)}ms over ${renderRuns} runs -> ${render.result.length} html chars, ${sheets.length} sheets`);

const patterns = loadIndicatorPatterns();
const scan = timeRuns(() => scanIndicators(lines, patterns), scanRuns);
console.log(`indicator regex scan: median ${scan.median.toFixed(1)}ms min ${scan.min.toFixed(1)}ms max ${scan.max.toFixed(1)}ms over ${scanRuns} runs -> ${scan.result} indicator ranges`);
