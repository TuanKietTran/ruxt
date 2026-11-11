/**
 * Pure ranged diagnostics for the CV Markdown grammar the editor already
 * parses (see `../cvMarkdown.ts`): `:::name{attrs}` container directives,
 * trailing `{ .class #id }` attribute blocks on headings and paragraphs,
 * and thematic breaks (`---`), which `splitCvSheets` turns into sheets.
 *
 * No DOM and no parser dependency: the scan is line-based and every
 * diagnostic carries a CodeMirror-style offset range (`from` inclusive,
 * `to` exclusive) into the source string.
 */

export type CvDiagnosticSeverity = "error" | "warning";

export type CvDiagnosticCode =
    | "unclosed-directive"
    | "stray-directive-close"
    | "unknown-directive"
    | "unclosed-attribute-block"
    | "malformed-attribute-block"
    | "multiple-ids"
    | "duplicate-id"
    | "unknown-attribute-class"
    | "leading-sheet-break"
    | "trailing-sheet-break"
    | "consecutive-sheet-breaks";

/** A character range in the source: `from` inclusive, `to` exclusive. */
export interface CvDiagnosticRange {
    from: number;
    to: number;
}

export interface CvDiagnostic extends CvDiagnosticRange {
    code: CvDiagnosticCode;
    severity: CvDiagnosticSeverity;
    message: string;
    source: "cv-markdown";
}

export interface CvSourcePosition {
    offset: number;
    /** 1-based. */
    line: number;
    /** 1-based. */
    column: number;
}

export const CV_DIAGNOSTIC_SOURCE = "cv-markdown" as const;

/** Container directive names defined by the repo grammar (`:::resume`). */
export const CV_DIRECTIVE_NAMES: readonly string[] = ["resume"];

/**
 * Attribute classes with a defined meaning in the repo: `.cv-name` is the
 * only class styled by the reference CV stylesheet. A directive name also
 * becomes a rendered class (`:::resume` renders with class `resume`), so
 * directive names are accepted as class tokens too.
 */
export const CV_ATTRIBUTE_CLASSES: readonly string[] = ["cv-name"];

const knownClasses = new Set([...CV_ATTRIBUTE_CLASSES, ...CV_DIRECTIVE_NAMES]);
const knownDirectives = new Set(CV_DIRECTIVE_NAMES);

const classOrIdToken = /^[.#][\w-]+$/;
const keyValueToken = /^[A-Za-z][\w-]*=(?:"[^"]*"|'[^']*'|[^\s]+)$/;
const sheetBreak = /^(?:-{3,}|\*{3,}|_{3,})$/;
const directiveLine = /^:::([A-Za-z0-9_-]*)(\{.*)?$/;
const trailingBlock = /\{([^{}]*)\}(\s*)$/;
const inlineBlock = /\{[^{}]*\}/;

export function positionAt(source: string, offset: number): CvSourcePosition {
    const clamped = Math.max(0, Math.min(offset, source.length));
    let line = 1;
    let lineStart = 0;
    for (let index = 0; index < clamped; index++) {
        if (source[index] === "\n") {
            line++;
            lineStart = index + 1;
        }
    }
    return { offset: clamped, line, column: clamped - lineStart + 1 };
}

interface OpenDirective extends CvDiagnosticRange {
    name: string;
}

/** Diagnose malformed CV Markdown. Pure: no DOM, no I/O, no mutation. */
export function diagnoseCvMarkdown(source: string): CvDiagnostic[] {
    const diagnostics: CvDiagnostic[] = [];
    const seenIds = new Map<string, number>();
    const openDirectives: OpenDirective[] = [];
    let lastContentKind: "none" | "content" | "sheet-break" = "none";
    let lastSheetBreak: CvDiagnosticRange | undefined;
    let previousLineWasParagraph = false;

    const report = (code: CvDiagnosticCode, severity: CvDiagnosticSeverity, range: CvDiagnosticRange, message: string) => {
        diagnostics.push({ code, severity, message, source: CV_DIAGNOSTIC_SOURCE, from: range.from, to: range.to });
    };

    const checkAttributeTokens = (inner: string, innerFrom: number, allowKeyValue: boolean) => {
        let idsInBlock = 0;
        for (const match of inner.matchAll(/\S+/g)) {
            const token = match[0];
            const range = { from: innerFrom + match.index, to: innerFrom + match.index + token.length };
            if (!classOrIdToken.test(token)) {
                if (allowKeyValue && keyValueToken.test(token)) continue;
                report("malformed-attribute-block", "error", range, `Malformed attribute token "${token}": expected a .class or #id token.`);
                continue;
            }
            if (token.startsWith(".")) {
                const className = token.slice(1);
                if (!knownClasses.has(className)) {
                    report("unknown-attribute-class", "warning", range, `Unknown attribute class ".${className}": the CV stylesheet only defines ${[...knownClasses].map((name) => `.${name}`).join(", ")}.`);
                }
            } else {
                idsInBlock++;
                const id = token.slice(1);
                if (idsInBlock > 1) {
                    report("multiple-ids", "error", range, `Attribute block sets more than one id: only the last #id is kept, so "#${id}" replaces the earlier one.`);
                }
                if (seenIds.has(id)) {
                    report("duplicate-id", "error", range, `Duplicate id "#${id}": ids must be unique in a CV document.`);
                } else {
                    seenIds.set(id, range.from);
                }
            }
        }
    };

    const checkAttributeBlock = (inner: string, innerFrom: number, braces: CvDiagnosticRange, allowKeyValue: boolean) => {
        if (!inner.trim()) {
            report("malformed-attribute-block", "error", braces, "Empty attribute block: expected at least one .class or #id token.");
            return;
        }
        checkAttributeTokens(inner, innerFrom, allowKeyValue);
    };

    let lineStart = 0;
    for (const rawLine of source.split("\n")) {
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
        const trimmed = line.trim();
        const trimmedFrom = lineStart + (line.length - line.trimStart().length);
        const trimmedTo = trimmedFrom + trimmed.length;
        const nextLineStart = lineStart + rawLine.length + 1;

        if (!trimmed) {
            previousLineWasParagraph = false;
            lineStart = nextLineStart;
            continue;
        }

        const directive = directiveLine.exec(trimmed);
        if (directive) {
            const name = directive[1] ?? "";
            const attrs = directive[2];
            const attrsFrom = trimmedFrom + 3 + name.length;
            if (!name && !attrs) {
                if (openDirectives.length === 0) {
                    report("stray-directive-close", "error", { from: trimmedFrom, to: trimmedFrom + 3 }, "Closing ::: has no matching opening directive.");
                } else {
                    openDirectives.pop();
                }
            } else if (!name) {
                report("malformed-attribute-block", "error", { from: attrsFrom, to: trimmedTo }, "A ::: closing directive cannot carry an attribute block.");
            } else {
                openDirectives.push({ name, from: trimmedFrom, to: trimmedFrom + 3 + name.length });
                if (!knownDirectives.has(name)) {
                    report("unknown-directive", "warning", { from: trimmedFrom + 3, to: trimmedFrom + 3 + name.length }, `Unknown directive ":::${name}": the CV grammar only defines ${CV_DIRECTIVE_NAMES.map((known) => `:::${known}`).join(", ")}.`);
                }
                if (attrs) {
                    if (!attrs.endsWith("}")) {
                        report("unclosed-attribute-block", "error", { from: attrsFrom, to: trimmedTo }, `Unclosed attribute block on ":::${name}": missing a closing }.`);
                    } else {
                        checkAttributeBlock(attrs.slice(1, -1), attrsFrom + 1, { from: attrsFrom, to: trimmedTo }, true);
                    }
                }
            }
            previousLineWasParagraph = false;
            lineStart = nextLineStart;
            continue;
        }

        if (sheetBreak.test(trimmed) && !previousLineWasParagraph) {
            const range = { from: trimmedFrom, to: trimmedTo };
            if (lastContentKind === "none") {
                report("leading-sheet-break", "warning", range, "Sheet break before any content: the first sheet would be empty and is dropped.");
            } else if (lastContentKind === "sheet-break") {
                report("consecutive-sheet-breaks", "warning", range, "Consecutive sheet breaks: the sheet between them would be empty and is dropped.");
            }
            lastContentKind = "sheet-break";
            lastSheetBreak = range;
            previousLineWasParagraph = false;
            lineStart = nextLineStart;
            continue;
        }

        const trailing = trailingBlock.exec(line);
        if (trailing) {
            const inner = trailing[1] ?? "";
            const blockFrom = lineStart + trailing.index;
            checkAttributeBlock(inner, blockFrom + 1, { from: blockFrom, to: blockFrom + inner.length + 2 }, false);
        } else {
            const openBrace = line.lastIndexOf("{");
            if (openBrace >= 0 && !line.slice(openBrace).includes("}")) {
                report("unclosed-attribute-block", "error", { from: lineStart + openBrace, to: lineStart + line.trimEnd().length }, "Unclosed attribute block: missing a closing } at the end of the line.");
            } else if (/^\s{0,3}#{1,6}\s/.test(line)) {
                const inline = inlineBlock.exec(line);
                if (inline) {
                    report("malformed-attribute-block", "error", { from: lineStart + inline.index, to: lineStart + inline.index + inline[0].length }, "Attribute block must be the last thing on a heading or paragraph line to be applied.");
                }
            }
        }

        lastContentKind = "content";
        previousLineWasParagraph = !/^[#>|]/.test(trimmed) && !trimmed.startsWith(":::");
        lineStart = nextLineStart;
    }

    if (lastContentKind === "sheet-break" && lastSheetBreak) {
        report("trailing-sheet-break", "warning", lastSheetBreak, "Sheet break after the last content: the final sheet would be empty and is dropped.");
    }
    for (const open of openDirectives) {
        report("unclosed-directive", "error", open, `Unclosed directive ":::${open.name}": missing a closing ::: line.`);
    }

    return diagnostics.sort((a, b) => a.from - b.from || a.code.localeCompare(b.code));
}
