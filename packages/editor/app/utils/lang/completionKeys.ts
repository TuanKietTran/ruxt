import { ATTRIBUTE_CLASSES, CV_DIRECTIVES, CV_SECTIONS, KNOWN_ATTRIBUTE_IDS } from "./schema";

/**
 * Pure key completion for the CV document grammar (see `./schema`).
 * Given the document text and a cursor offset, returns the known
 * keys/names that fit the syntactic context at the cursor:
 *
 * - `:::re|`        -> directive names
 * - `# Name {.cv-|` -> attribute classes (also inside `:::resume{...}`)
 * - `# Name {#|`    -> attribute ids (none are known, so none are offered)
 * - `## Ex|`        -> level-2 section headings
 *
 * Anything else returns an empty list. No CodeMirror/DOM imports: a UI
 * slice adapts `from`/`to`/`insertText` to its own completion source.
 */

export type KeyCompletionKind = "directive" | "class" | "id" | "section";

export interface KeyCompletion {
    label: string;
    /** Text that replaces the range `from..to` when accepted. */
    insertText: string;
    kind: KeyCompletionKind;
    detail?: string;
    from: number;
    to: number;
}

const byPrefix = (name: string, prefix: string) => name.toLowerCase().startsWith(prefix.toLowerCase());

function attributeCompletions(lineBefore: string, offset: number): KeyCompletion[] | undefined {
    const open = lineBefore.lastIndexOf("{");
    if (open < 0) return undefined;
    const content = lineBefore.slice(open + 1);
    if (content.includes("}") || !/^[\s.#\w-]*$/.test(content)) return undefined;
    const token = lineBefore.match(/[.#]?[\w-]*$/)?.[0] ?? "";
    const from = offset - token.length;
    if (token.startsWith("#")) {
        return KNOWN_ATTRIBUTE_IDS.filter((id) => byPrefix(id, token.slice(1))).map((id) => ({
            label: id, insertText: `#${id}`, kind: "id" as const, from, to: offset,
        }));
    }
    if (token.startsWith(".") || token === "") {
        const prefix = token.startsWith(".") ? token.slice(1) : "";
        return ATTRIBUTE_CLASSES.filter((c) => byPrefix(c.name, prefix)).map((c) => ({
            label: c.name, insertText: `.${c.name}`, kind: "class" as const, detail: c.description, from, to: offset,
        }));
    }
    return [];
}

export function getKeyCompletions(text: string, offset: number): KeyCompletion[] {
    const at = Math.max(0, Math.min(Math.floor(offset), text.length));
    const lineStart = at === 0 ? 0 : text.lastIndexOf("\n", at - 1) + 1;
    const lineBefore = text.slice(lineStart, at);

    const attribute = attributeCompletions(lineBefore, at);
    if (attribute !== undefined) return attribute;

    const directive = lineBefore.match(/^(\s*):::([\w-]*)$/);
    if (directive) {
        const from = lineStart + directive[1].length + 3;
        return CV_DIRECTIVES.filter((d) => byPrefix(d.name, directive[2])).map((d) => ({
            label: d.name, insertText: d.name, kind: "directive" as const, detail: d.description, from, to: at,
        }));
    }

    const heading = lineBefore.match(/^##(\s+)([A-Za-z][A-Za-z &]*|)$/);
    if (heading) {
        const partial = heading[2];
        const from = lineStart + 2 + heading[1].length;
        return CV_SECTIONS.filter((s) => byPrefix(s.name, partial)).map((s) => ({
            label: s.name,
            insertText: s.name,
            kind: "section" as const,
            detail: s.profileKey ? `Section for the ${s.profileKey} profile key.` : "Section.",
            from,
            to: at,
        }));
    }

    return [];
}

/** Alias matching the slice name; `getKeyCompletions` is canonical. */
export const keyCompletions = getKeyCompletions;
