/**
 * Diagnostics for unknown names in the CV document grammar.
 *
 * Grounded in the repo, not invented:
 * - the only container directive anywhere is `:::resume` (cvMarkdown.ts
 *   renders remark-directive containers; `reference-cv.md` uses one).
 * - the only attribute class with a defined meaning is `.cv-name` on the
 *   name heading; any `#id` is accepted by the grammar (sanitize allows
 *   className/id), so ids are never flagged.
 * - `##` section headings are the nine names below: the five sections in
 *   `reference-cv.md` first, then the profile-backed sections the core
 *   `CvProfileProps` shape adds (Objective, Skills, Certifications,
 *   Languages), each carrying its profile key where it has one.
 *
 * Only syntactic positions are checked: a line starting `:::`, a trailing
 * `{ .class #id }` block, and a `##` heading line. Plain Markdown prose
 * (including words like "cover letter" or "hobbies" in a sentence) and
 * fenced code blocks are never flagged.
 *
 * No CodeMirror, DOM or Vue imports: this module is a plain language
 * service usable from tests, workers and the editor alike. The known sets
 * are local copies of the values in the fx/ed-w01 schema slice (which owns
 * the shared schema); they are re-exported here only so this module stays
 * self-contained until integration wires it to that schema.
 */

export const KNOWN_DIRECTIVES: readonly string[] = ["resume"];

export const KNOWN_ATTRIBUTE_CLASSES: readonly string[] = ["cv-name"];

interface SectionSpec {
    name: string;
    profileKey?: string;
}

const KNOWN_SECTIONS: readonly SectionSpec[] = [
    { name: "Education", profileKey: "education" },
    { name: "Experience", profileKey: "experiences" },
    { name: "Leadership & Activities" },
    { name: "Projects", profileKey: "projects" },
    { name: "Skills & Interests", profileKey: "skills" },
    { name: "Objective", profileKey: "identity" },
    { name: "Skills", profileKey: "skills" },
    { name: "Certifications", profileKey: "certifications" },
    { name: "Languages", profileKey: "languages" },
];

export const KNOWN_SECTION_NAMES: readonly string[] = KNOWN_SECTIONS.map((s) => s.name);

export const KNOWN_PROFILE_KEYS: readonly string[] = [
    ...new Set(KNOWN_SECTIONS.map((s) => s.profileKey).filter((key): key is string => key !== undefined)),
];

export type UnknownKeyCode = "unknown-directive" | "unknown-attribute-class" | "unknown-section";

export interface UnknownKeyDiagnostic {
    code: UnknownKeyCode;
    severity: "warning";
    message: string;
    from: number;
    to: number;
}

function isKnownDirective(name: string): boolean {
    return KNOWN_DIRECTIVES.includes(name);
}

function isKnownAttributeClass(name: string): boolean {
    return KNOWN_ATTRIBUTE_CLASSES.includes(name);
}

function isKnownSection(name: string): boolean {
    const wanted = name.trim().toLowerCase();
    return KNOWN_SECTIONS.some((s) => s.name.toLowerCase() === wanted);
}

/**
 * Diagnose unknown directive names, unknown attribute classes and unknown
 * `##` section headings in CV Markdown. Returns diagnostics sorted by
 * position; `[]` for clean input (including reference-cv.md).
 */
export function diagnoseUnknownKeys(source: string): UnknownKeyDiagnostic[] {
    const found: UnknownKeyDiagnostic[] = [];
    let inFence = false;
    let lineStart = 0;
    for (const rawLine of source.split("\n")) {
        const line = rawLine;
        const trimmedStart = lineStart + (line.length - line.trimStart().length);
        const trimmed = line.slice(trimmedStart - lineStart);
        const isFence = trimmed.startsWith("```") || trimmed.startsWith("~~~");
        if (isFence) {
            inFence = !inFence;
        } else if (!inFence) {
            const directive = /^:::([A-Za-z][A-Za-z0-9_-]*)/.exec(trimmed);
            if (directive && !isKnownDirective(directive[1])) {
                found.push({
                    code: "unknown-directive",
                    severity: "warning",
                    message: `Unknown directive ":::${directive[1]}": the CV grammar only defines :::resume.`,
                    from: trimmedStart + 3,
                    to: trimmedStart + 3 + directive[1].length,
                });
            }
            const heading = /^##(?!#)\s+(.+?)\s*$/.exec(trimmed);
            if (heading) {
                const title = heading[1].replace(/\{[^{}]*\}\s*$/, "").trim();
                if (title !== "" && !isKnownSection(title)) {
                    const titleFrom = line.indexOf(title, trimmedStart + 2) + lineStart;
                    found.push({
                        code: "unknown-section",
                        severity: "warning",
                        message: `Unknown section "${title}": the CV grammar only defines ${KNOWN_SECTION_NAMES.join(", ")}.`,
                        from: titleFrom,
                        to: titleFrom + title.length,
                    });
                }
            }
            const block = /\{([^{}]*)\}\s*$/.exec(line) ?? /\{([^{}]*)$/.exec(line);
            if (block) {
                const innerStart = lineStart + block.index + 1;
                for (const token of block[1].matchAll(/\S+/g)) {
                    const classMatch = /^\.([A-Za-z][A-Za-z0-9_-]*)$/.exec(token[0]);
                    if (classMatch && !isKnownAttributeClass(classMatch[1])) {
                        found.push({
                            code: "unknown-attribute-class",
                            severity: "warning",
                            message: `Unknown attribute class ".${classMatch[1]}": the CV stylesheet only defines .cv-name.`,
                            from: innerStart + token.index,
                            to: innerStart + token.index + token[0].length,
                        });
                    }
                }
            }
        }
        lineStart += line.length + 1;
    }
    return found;
}
