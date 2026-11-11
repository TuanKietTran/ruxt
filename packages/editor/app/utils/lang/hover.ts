/**
 * Hover documentation for the CV Markdown dialect (pure, no DOM).
 *
 * Given source text and a character offset, returns the source range of
 * the token under the offset plus Markdown documentation for it, or
 * `null` when the offset is not on a documented token.
 *
 * Documented tokens, in precedence order:
 * 1. `.class` / `#id` tokens inside a trailing `{ .class #id }` attribute
 *    block (the pattern `useCodeMirror` highlights and `cvMarkdown`
 *    applies to headings and paragraphs; sanitize keeps className/id).
 * 2. Container directive names (`:::resume`, closing `:::`), which
 *    `cvMarkdown` renders as `<div class="<name>">`.
 * 3. Section headings: the `#` name heading and `##` sections used by
 *    `app/data/reference-cv.md`, styled by `app/data/reference-cv.css`.
 */

export interface HoverDoc {
    from: number;
    to: number;
    markdown: string;
}

// Attribute-block shape cvMarkdown parses: one or more `.class` / `#id`
// tokens inside braces. cvMarkdown trims inside the braces, so a space
// after `{` is allowed (useCodeMirror's highlight pattern is stricter).
const attributeBlockPattern = /\{\s*(?:[.#][\w-]+(?:\s+|(?=\}))){1,}\}/g;
const attributeTokenPattern = /[.#][\w-]+/g;
// Same directive shape useCodeMirror highlights: :::name{attrs} at line end.
const directivePattern = /(:{3,})([\w-]+)?(\{[^{}]*\})?\s*$/;
const headingPattern = /^(#{1,6})([ \t]+)(.*)$/;
const trailingAttributePattern = /\s*\{[^{}]*\}\s*$/;

const RESUME_DOC = [
    "**`:::resume` — CV container directive**",
    "",
    "Wraps the whole CV. It renders as `<div class=\"resume\">`, so the",
    "`reference-cv.css` sheet styles apply to everything inside it:",
    "an A4 page in Georgia. Close it with a matching `:::` line.",
    "",
    "```markdown",
    ":::resume",
    "",
    "# YOUR NAME {.cv-name}",
    "",
    ":::",
    "```",
].join("\n");

const CLOSING_DOC = [
    "**`:::` — closing directive fence**",
    "",
    "Closes the container directive opened above it (for example the",
    "`:::resume` sheet). Content after this line renders outside the",
    "container and outside the `.resume` sheet styles.",
].join("\n");

const directiveDoc = (name: string): string => [
    `**\`:::${name}\` — container directive**`,
    "",
    `A container directive renders as \`<div class="${name}">\`, with`,
    "the directive name as its class, and ends at a matching `:::` line.",
    "Only `resume` has template styling in `reference-cv.css`; any other",
    "name needs a matching class in the CV CSS to be styled.",
].join("\n");

const CV_NAME_DOC = [
    "**`.cv-name` — name heading class**",
    "",
    "Put it in a trailing attribute block on the `#` name heading:",
    "`# YOUR NAME {.cv-name}`.",
    "",
    "In `reference-cv.css` it styles the name centered at 16pt with a",
    "bottom border, and the contact line directly after it is centered",
    "too.",
].join("\n");

const classDoc = (token: string): string => [
    `**\`${token}\` — class attribute**`,
    "",
    `A trailing \`{ ${token} }\` block on a heading or paragraph sets`,
    "its class. The renderer keeps `class` and `id` attributes, so the",
    `class takes effect wherever \`${token}\` is defined in the CV CSS.`,
    "The reference template ships only `.cv-name` (plus the `.resume`",
    "container class from `:::resume`).",
].join("\n");

const idDoc = (token: string): string => [
    `**\`${token}\` — id attribute**`,
    "",
    `A trailing \`{ ${token} }\` block on a heading or paragraph sets`,
    "its `id` attribute. The renderer keeps `class` and `id` attributes,",
    `so the element can be targeted as \`${token}\` in the CV CSS or`,
    "linked to directly.",
].join("\n");

const SECTION_DOCS: Record<string, string> = {
    education: [
        "**Education — CV section**",
        "",
        "Schooling, in the reference layout as a two-column table: the",
        "university name and city on the first row, then the degree, field",
        "of study and GPA on the left with the dates right-aligned.",
        "A `Relevant coursework:` line can follow the table.",
    ].join("\n"),
    experience: [
        "**Experience — CV section**",
        "",
        "Jobs, most recent first, each as a two-column table (organization",
        "and city, then job title with dates right-aligned) followed by",
        "bullets. Start each bullet with a strong action verb and quantify",
        "the scope, impact, or outcome wherever possible.",
    ].join("\n"),
    "leadership & activities": [
        "**Leadership & Activities — CV section**",
        "",
        "Organizations or programs and your role in them, in the same",
        "table-plus-bullets layout as Experience. Explain your",
        "contribution and its impact on the organization or community.",
    ].join("\n"),
    projects: [
        "**Projects — CV section**",
        "",
        "Each project gets a table header (project name and link), one",
        "sentence describing the problem, audience, and outcome, then",
        "bullets on your technical or creative contribution and any",
        "measurable result or notable implementation detail.",
    ].join("\n"),
    "skills & interests": [
        "**Skills & Interests — CV section**",
        "",
        "Three labelled lines, as in the reference CV:",
        "",
        "- **Technical:** Language or tool, Platform or framework",
        "- **Languages:** Language (proficiency)",
        "- **Interests:** Interest, Interest, Interest",
    ].join("\n"),
};

const genericSectionDoc = (title: string): string => [
    `**${title} — resume section**`,
    "",
    "An `##` heading inside `:::resume` starts a section. In",
    "`reference-cv.css` resume `h2` headings are 12pt, centered and",
    "underlined. The reference CV uses Education, Experience,",
    "Leadership & Activities, Projects, and Skills & Interests; other",
    "titles render as sections too, with the same heading style.",
].join("\n");

const nameHeadingDoc = (title: string): string => [
    `**${title} — name heading**`,
    "",
    "The `#` heading at the top of the CV is your name. Add `{.cv-name}`",
    "at the end of the line to style it with the `.cv-name` class:",
    "centered at 16pt with a bottom border, as in the reference CV.",
].join("\n");

const subHeadingDoc = (title: string): string => [
    `**${title} — sub-heading**`,
    "",
    "A level-3 or deeper heading inside the CV body. Sections use `##`;",
    "deeper headings render as plain Markdown headings inside the",
    "`.resume` sheet, with no dedicated reference-template style.",
].join("\n");

const inRange = (offset: number, from: number, to: number, lineEnd: number): boolean =>
    (offset >= from && offset < to) || (offset === to && to === lineEnd);

export function hoverAt(text: string, offset: number): HoverDoc | null {
    if (!text || !Number.isInteger(offset) || offset < 0 || offset > text.length) return null;

    const probe = Math.min(offset, text.length - 1);
    const lineFrom = text.lastIndexOf("\n", probe) + 1;
    const nextBreak = text.indexOf("\n", probe);
    const lineTo = nextBreak === -1 ? text.length : nextBreak;
    const line = text.slice(lineFrom, lineTo);

    // 1. `.class` / `#id` tokens inside an attribute block.
    for (const block of line.matchAll(attributeBlockPattern)) {
        const blockFrom = lineFrom + (block.index ?? 0);
        for (const token of block[0].matchAll(attributeTokenPattern)) {
            const from = blockFrom + (token.index ?? 0);
            const to = from + token[0].length;
            if (!inRange(offset, from, to, lineTo)) continue;
            if (token[0] === ".cv-name") return { from, to, markdown: CV_NAME_DOC };
            return { from, to, markdown: token[0].startsWith(".") ? classDoc(token[0]) : idDoc(token[0]) };
        }
    }

    // 2. Container directives: :::name or the closing :::.
    const directive = line.match(directivePattern);
    if (directive && directive.index !== undefined) {
        const matchFrom = lineFrom + directive.index;
        const matchTo = matchFrom + directive[0].length;
        if (inRange(offset, matchFrom, matchTo, lineTo) || offset === matchTo) {
            const name = directive[2];
            if (!name) return { from: matchFrom, to: matchFrom + directive[1].length, markdown: CLOSING_DOC };
            const from = matchFrom + directive[1].length;
            const to = from + name.length;
            return { from, to, markdown: name === "resume" ? RESUME_DOC : directiveDoc(name) };
        }
    }

    // 3. Headings: `#` name heading and `##` sections.
    const heading = line.match(headingPattern);
    if (heading) {
        const hashesTo = lineFrom + heading[1].length;
        const textFrom = hashesTo + heading[2].length;
        const title = heading[3].replace(trailingAttributePattern, "").trimEnd();
        if (title) {
            const textTo = textFrom + title.length;
            if (inRange(offset, lineFrom, hashesTo, lineTo) || inRange(offset, textFrom, textTo, lineTo)) {
                const level = heading[1].length;
                if (level === 1) return { from: textFrom, to: textTo, markdown: nameHeadingDoc(title) };
                if (level === 2) {
                    const known = SECTION_DOCS[title.toLowerCase()];
                    return { from: textFrom, to: textTo, markdown: known ?? genericSectionDoc(title) };
                }
                return { from: textFrom, to: textTo, markdown: subHeadingDoc(title) };
            }
        }
    }

    return null;
}

export default hoverAt;
