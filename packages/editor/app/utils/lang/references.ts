// Go-to-definition + find-references for the CV markdown language.
// Pure text service (no DOM, no CodeMirror): it scans one document and
// reports the #id / .class symbols the grammar actually uses —
//   - `:::name` container directives (the name acts as a class symbol,
//     ranged over the name only, without the `:::` prefix)
//   - `{.class #id}` attribute blocks on headings / paragraphs /
//     directives — the assignment sites; the first assignment of a
//     symbol is its definition
//   - `[label](#id)` fragment links — references to an #id
//   - CSS selector tokens (`.class` / `#id` before a `{...}` declaration
//     block) — references, never definitions
// Everything else is ignored on purpose: prose tokens (`C#`, `.hidden`
// in running text), heading markers, fenced code blocks, CSS comments,
// and CSS declaration values (`#171717`, `.5mm`). Names are
// case-sensitive and the `kind` keeps a class and an id that share a
// name apart.

export type LangSymbolKind = "class" | "id";

export interface LangSymbolOccurrence {
    kind: LangSymbolKind;
    name: string;
    from: number;
    to: number;
    definition: boolean;
}

export interface FindReferencesOptions {
    includeDefinition?: boolean;
}

interface RawOccurrence extends LangSymbolOccurrence {
    assignment: boolean;
}

const NAME = "[A-Za-z_][A-Za-z0-9_-]*";
const TOKEN_RE = new RegExp(`([.#])(${NAME})`, "g");
const LINK_RE = new RegExp(`\\]\\(#(${NAME})\\)`, "g");
const DIRECTIVE_RE = new RegExp(`^(\\s*):::(${NAME})`);

// Blank out CSS comments without moving any offset: every removed
// character becomes a space (newlines kept).
const blankIgnoredSpans = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, (span) => span.replace(/[^\n]/g, " "));

// An attribute block holds only `.class` / `#id` tokens and key=value
// pairs; a CSS declaration block betrays itself with `:` / `;`.
const isAttributeBlock = (content: string): boolean =>
    content.trim().length > 0 && !/[:;]/.test(content);

const collectTokens = (
    out: RawOccurrence[],
    segment: string,
    segmentOffset: number,
    assignment: boolean,
) => {
    for (const match of segment.matchAll(TOKEN_RE)) {
        const name = match[2] ?? "";
        const from = segmentOffset + (match.index ?? 0);
        out.push({
            kind: match[1] === "#" ? "id" : "class",
            name,
            from,
            to: from + 1 + name.length,
            definition: false,
            assignment,
        });
    }
};

const collectLine = (out: RawOccurrence[], line: string, lineOffset: number) => {
    const directive = DIRECTIVE_RE.exec(line);
    if (directive) {
        const name = directive[2] ?? "";
        const from = lineOffset + (directive[1]?.length ?? 0) + 3;
        out.push({
            kind: "class",
            name,
            from,
            to: from + name.length,
            definition: false,
            assignment: true,
        });
    }
    // Brace groups: attribute blocks contribute their tokens as
    // assignments; for a CSS rule the selector segment in front of the
    // declaration block contributes references.
    let segmentStart = 0;
    let cursor = 0;
    while (cursor < line.length) {
        const open = line.indexOf("{", cursor);
        if (open === -1) break;
        const close = line.indexOf("}", open + 1);
        if (close === -1) break;
        const content = line.slice(open + 1, close);
        if (isAttributeBlock(content)) {
            collectTokens(out, content, lineOffset + open + 1, true);
        } else {
            collectTokens(out, line.slice(segmentStart, open), lineOffset + segmentStart, false);
        }
        segmentStart = close + 1;
        cursor = close + 1;
    }
    for (const match of line.matchAll(LINK_RE)) {
        const name = match[1] ?? "";
        const from = lineOffset + (match.index ?? 0) + 2; // `](#` precedes the `#name`
        out.push({
            kind: "id",
            name,
            from,
            to: from + 1 + name.length,
            definition: false,
            assignment: false,
        });
    }
};

export function findSymbolOccurrences(text: string): LangSymbolOccurrence[] {
    const source = blankIgnoredSpans(text);
    const raw: RawOccurrence[] = [];
    let inFence = false;
    let lineOffset = 0;
    for (const line of source.split("\n")) {
        if (line.trimStart().startsWith("```")) {
            inFence = !inFence;
        } else if (!inFence) {
            collectLine(raw, line, lineOffset);
        }
        lineOffset += line.length + 1;
    }
    raw.sort((a, b) => a.from - b.from);
    const seenAssignments = new Set<string>();
    return raw.map(({ assignment, ...occurrence }) => {
        const key = `${occurrence.kind}:${occurrence.name}`;
        if (assignment && !seenAssignments.has(key)) {
            seenAssignments.add(key);
            return { ...occurrence, definition: true };
        }
        return occurrence;
    });
}

export function symbolAtOffset(
    text: string,
    offset: number,
): LangSymbolOccurrence | null {
    if (offset < 0 || offset > text.length) return null;
    return (
        findSymbolOccurrences(text).find(
            (occurrence) => occurrence.from <= offset && offset < occurrence.to,
        ) ?? null
    );
}

export function findDefinition(
    text: string,
    offset: number,
): LangSymbolOccurrence | null {
    const symbol = symbolAtOffset(text, offset);
    if (!symbol) return null;
    return (
        findSymbolOccurrences(text).find(
            (occurrence) =>
                occurrence.definition &&
                occurrence.kind === symbol.kind &&
                occurrence.name === symbol.name,
        ) ?? null
    );
}

export function findReferences(
    text: string,
    offset: number,
    options: FindReferencesOptions = {},
): LangSymbolOccurrence[] {
    const symbol = symbolAtOffset(text, offset);
    if (!symbol) return [];
    const includeDefinition = options.includeDefinition ?? true;
    return findSymbolOccurrences(text).filter(
        (occurrence) =>
            occurrence.kind === symbol.kind &&
            occurrence.name === symbol.name &&
            (includeDefinition || !occurrence.definition),
    );
}
