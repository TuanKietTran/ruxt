/**
 * Value completion for the CV markdown language: directive names, directive
 * attribute keys/values, trailing attribute braces and table alignments.
 * Pure (no DOM/CodeMirror): callers pass the document text and cursor offset.
 * Inventories are grep-verified against the repo, not invented: the only
 * directive is `resume` (cvMarkdown), sanitize keeps only class/id attribute
 * keys, the only document classes are those in reference-cv.css, and the only
 * alignment tokens are those used in repo markdown tables. No document ids
 * exist in the repo, so id values and `#` shorthand complete to nothing.
 */
export const DIRECTIVE_NAMES: readonly string[] = ["resume"];
export const DIRECTIVE_ATTRIBUTE_KEYS: readonly string[] = ["class", "id"];
export const KNOWN_CLASS_TOKENS: readonly string[] = ["cv-name", "resume"];
export const TABLE_ALIGNMENT_TOKENS: readonly string[] = [":--", "--:", "---"];

export type ValueCompletionKind = "directive" | "attribute" | "class" | "alignment";

export interface ValueCompletion {
    value: string;
    kind: ValueCompletionKind;
    from: number;
    to: number;
}

const make = (values: readonly string[], kind: ValueCompletionKind, from: number, to: number): ValueCompletion[] =>
    values.map((value) => ({ value, kind, from, to }));

/** Table delimiter row: `| :-- | --- |` on the line after a `|` header row. */
function completeTableAlignment(text: string, cursor: number, lineStart: number, linePrefix: string): ValueCompletion[] | null {
    if (!linePrefix.trimStart().startsWith("|")) return null;
    if (!/^[|\s:\-]+$/.test(linePrefix)) return null;
    if (lineStart === 0) return null;
    const prevEnd = lineStart - 1;
    const prevStart = text.lastIndexOf("\n", prevEnd - 1) + 1;
    if (!text.slice(prevStart, prevEnd).includes("|")) return null;
    const lastPipe = linePrefix.lastIndexOf("|");
    const cell = linePrefix.slice(lastPipe + 1);
    const token = cell.trim();
    const from = token ? lineStart + lastPipe + 1 + (cell.length - cell.trimStart().length) : cursor;
    return make(TABLE_ALIGNMENT_TOKENS.filter((tokenValue) => tokenValue.startsWith(token)), "alignment", from, cursor);
}

/** Attribute completion inside an unclosed `{...}` on the current line. */
function completeAttributeBrace(cursor: number, lineStart: number, linePrefix: string): ValueCompletion[] | null {
    const brace = linePrefix.lastIndexOf("{");
    if (brace < 0) return null;
    const after = linePrefix.slice(brace + 1);
    if (after.includes("}")) return [];
    const isDirective = linePrefix.trimStart().startsWith(":::");
    const equals = after.match(/(?:^|\s)(class|id)\s*=\s*["']?([A-Za-z0-9_-]*)$/);
    if (equals) {
        if (equals[1] === "id") return [];
        const prefix = equals[2] ?? "";
        return make(KNOWN_CLASS_TOKENS.filter((token) => token.startsWith(prefix)), "class", cursor - prefix.length, cursor);
    }
    const token = after.match(/(\S*)$/)?.[1] ?? "";
    const from = cursor - token.length;
    if (token.startsWith("#")) return [];
    if (token.startsWith(".")) {
        return make(KNOWN_CLASS_TOKENS.map((known) => `.${known}`).filter((value) => value.startsWith(token)), "class", from, cursor);
    }
    if (!token) {
        if (isDirective) return make(DIRECTIVE_ATTRIBUTE_KEYS, "attribute", cursor, cursor);
        return make(KNOWN_CLASS_TOKENS.map((known) => `.${known}`), "class", cursor, cursor);
    }
    if (isDirective) {
        return make(DIRECTIVE_ATTRIBUTE_KEYS.filter((key) => key.startsWith(token)), "attribute", from, cursor);
    }
    return make(KNOWN_CLASS_TOKENS.filter((known) => known.startsWith(token)).map((known) => `.${known}`), "class", from, cursor);
}

export function completeValues(text: string, cursor: number): ValueCompletion[] {
    if (!text || cursor < 0 || cursor > text.length) return [];
    const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
    const linePrefix = text.slice(lineStart, cursor);
    const table = completeTableAlignment(text, cursor, lineStart, linePrefix);
    if (table) return table;
    const directive = linePrefix.match(/^:::([A-Za-z0-9_-]*)$/);
    if (directive) {
        const prefix = directive[1] ?? "";
        return make(DIRECTIVE_NAMES.filter((name) => name.startsWith(prefix)), "directive", lineStart + 3, cursor);
    }
    return completeAttributeBrace(cursor, lineStart, linePrefix) ?? [];
}
