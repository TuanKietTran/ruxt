/**
 * Quick fixes for the CV markdown language: pure text + diagnostic in,
 * text edits out. No DOM, no editor imports, so it is unit-testable and
 * reusable from any host (CodeMirror code actions, CLI, tests).
 *
 * A diagnostic is defined locally (not imported from the diagnostics
 * slice): a machine code plus the character range it was reported on.
 */

export interface LangDiagnosticRange {
    from: number;
    to: number;
}

export interface LangDiagnostic {
    code: string;
    range: LangDiagnosticRange;
    message?: string;
}

export interface TextEdit {
    from: number;
    to: number;
    insert: string;
}

/** Container directives the grammar renders (`:::resume` -> div.resume). */
export const KNOWN_DIRECTIVES: readonly string[] = ["resume"];

/** Classes authors may put in trailing `{ .class #id }` attribute blocks. */
export const KNOWN_CLASSES: readonly string[] = ["cv-name"];

/** Classic Levenshtein edit distance. */
export function editDistance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(
                previous[j] + 1,
                current[j - 1] + 1,
                previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
        }
        previous = current;
    }
    return previous[b.length];
}

function clampRange(text: string, range: LangDiagnosticRange): LangDiagnosticRange | undefined {
    const from = Math.max(0, Math.min(range.from, text.length));
    const to = Math.max(from, Math.min(range.to, text.length));
    if (range.from > text.length) return undefined;
    return { from, to };
}

function lineEnd(text: string, from: number): number {
    const newline = text.indexOf("\n", from);
    return newline === -1 ? text.length : newline;
}

/** Close an unclosed `:::name` container by appending `:::` at the document end. */
function closeDirective(text: string, range: LangDiagnosticRange): TextEdit[] {
    const rest = text.slice(range.to);
    if (rest.split("\n").some((line) => line.trim() === ":::")) return [];
    if (!text.slice(0, range.to).includes(":::")) return [];
    const insert = text.endsWith("\n\n") ? ":::\n" : text.endsWith("\n") ? "\n:::\n" : "\n\n:::\n";
    return [{ from: text.length, to: text.length, insert }];
}

/** Close an unclosed `{ ...` attribute block with `}` at the end of its line. */
function closeBrace(text: string, range: LangDiagnosticRange): TextEdit[] {
    const end = lineEnd(text, range.from);
    const segment = text.slice(range.from, end);
    if (!segment.includes("{")) return [];
    if (segment.includes("}")) return [];
    return [{ from: end, to: end, insert: "}" }];
}

/**
 * Replace a near-miss name with the closest known name. Offers nothing for
 * an exact match, a far miss (distance above the length-scaled threshold),
 * or an ambiguous tie between two known names.
 */
function correctName(text: string, range: LangDiagnosticRange, known: readonly string[]): TextEdit[] {
    const slice = text.slice(range.from, range.to);
    const match = slice.match(/[\w-]+/);
    if (!match || match.index === undefined) return [];
    const word = match[0];
    if (known.includes(word)) return [];
    const threshold = word.length >= 5 ? 2 : 1;
    let best: string | undefined;
    let bestDistance = Infinity;
    let tied = false;
    for (const candidate of known) {
        const distance = editDistance(word.toLowerCase(), candidate.toLowerCase());
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
            tied = false;
        } else if (distance === bestDistance) {
            tied = true;
        }
    }
    if (!best || tied || bestDistance > threshold) return [];
    const from = range.from + match.index;
    return [{ from, to: from + word.length, insert: best }];
}

function inferNameKind(text: string, range: LangDiagnosticRange): "directive" | "class" | undefined {
    const before = text.slice(Math.max(0, range.from - 3), range.from);
    if (before.endsWith(":::")) return "directive";
    if (before.endsWith(".") || before.endsWith("{") || before.endsWith(" ")) {
        const lineStart = text.lastIndexOf("\n", range.from) + 1;
        if (text.slice(lineStart, range.from).includes("{")) return "class";
        if (before.endsWith(".")) return "class";
    }
    return undefined;
}

/**
 * Quick fixes for one diagnostic. Returns plain `{ from, to, insert }`
 * edits (empty when the diagnostic is not fixable); applying them must not
 * require any other change to the document.
 */
export function getQuickFixes(text: string, diagnostic: LangDiagnostic): TextEdit[] {
    const range = clampRange(text, diagnostic.range);
    if (!range) return [];
    const code = diagnostic.code.toLowerCase();
    const slice = text.slice(range.from, range.to);
    if (code.includes("unclosed")) {
        if (code.includes("directive") || code.includes("container") || slice.includes(":::")) return closeDirective(text, range);
        if (code.includes("brace") || code.includes("attribute") || code.includes("attr") || slice.includes("{")) return closeBrace(text, range);
        return [];
    }
    if (code.includes("unknown") || code.includes("misspell") || code.includes("invalid") || code.includes("unrecognized")) {
        if (code.includes("directive")) return correctName(text, range, KNOWN_DIRECTIVES);
        if (code.includes("class")) return correctName(text, range, KNOWN_CLASSES);
        const kind = inferNameKind(text, range);
        if (kind === "directive") return correctName(text, range, KNOWN_DIRECTIVES);
        if (kind === "class") return correctName(text, range, KNOWN_CLASSES);
        return [];
    }
    return [];
}

export const quickFixesForDiagnostic = getQuickFixes;

/** Apply edits right-to-left so earlier offsets stay valid. */
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
    let result = text;
    for (const edit of [...edits].sort((a, b) => b.from - a.from)) {
        result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
    }
    return result;
}
