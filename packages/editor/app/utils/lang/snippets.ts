// Pure snippet definitions and expansion for the CV markdown editor.
// No DOM, no CodeMirror: editor wiring consumes `expandSnippet` output.
//
// Tab-stop format (VS Code / TextMate style, documented pure format):
//   ${n:placeholder}  tab stop n pre-filled with `placeholder`
//   $n                tab stop n with an empty placeholder
//   $0                final cursor position (always sorted last)
//   \$  \\           literal `$` / literal `\` (no tab stop created)
// A repeated index mirrors: every occurrence is returned as its own
// range in `tabStops`, sharing the index. `from`/`to` are offsets into
// the expanded `text` (placeholder included, syntax removed).
// Snippet bodies use the reference CV shapes (app/data/reference-cv.md)
// verbatim as placeholder defaults, so expanding with defaults yields
// exactly the reference markdown.

export interface SnippetDefinition {
    id: string;
    label: string;
    /** Unique trigger prefix, e.g. for completion lists. */
    prefix: string;
    description: string;
    body: string;
}

export interface SnippetTabStop {
    index: number;
    placeholder: string;
    from: number;
    to: number;
}

export interface ExpandedSnippet {
    text: string;
    tabStops: SnippetTabStop[];
}

const EXPERIENCE_ENTRY = [
    "| **${1:ORGANIZATION NAME}** | ${2:City, Country} |",
    "| :-- | --: |",
    "| ${3:Job Title} | ${4:Month Year} – ${5:Present} |",
    "",
    "- ${6:Start each bullet with a strong action verb and describe what you delivered}",
    "- ${7:Quantify the scope, impact, or outcome wherever possible}",
    "- ${8:Keep each bullet concise and relevant to the position}",
].join("\n");

export const CV_SNIPPETS: readonly SnippetDefinition[] = [
    {
        id: "resume-skeleton",
        label: "Resume skeleton",
        prefix: "resume",
        description: "Full :::resume document with all reference sections.",
        body: [
            ":::resume",
            "",
            "# ${1:YOUR NAME} {.cv-name}",
            "",
            "${2:City, Country} · [${3:email@example.com}](mailto:${3:email@example.com}) · ${4:+1 555 0100} · [${5:linkedin.com/in/your-name}](https://${5:linkedin.com/in/your-name})",
            "",
            "## Education",
            "",
            "| **${6:UNIVERSITY NAME}** | ${7:City, Country} |",
            "| :-- | --: |",
            "| ${8:Degree, Field of Study} · GPA: ${9:X.XX} | ${10:Month Year} – ${11:Month Year} |",
            "",
            "${12:Relevant coursework: Course One, Course Two, Course Three}",
            "",
            "## Experience",
            "",
            "| **${13:ORGANIZATION NAME}** | ${14:City, Country} |",
            "| :-- | --: |",
            "| ${15:Job Title} | ${16:Month Year} – ${17:Present} |",
            "",
            "- ${18:Start each bullet with a strong action verb and describe what you delivered}",
            "- ${19:Quantify the scope, impact, or outcome wherever possible}",
            "",
            "## Leadership & Activities",
            "",
            "| **${20:ORGANIZATION OR PROGRAM}** | ${21:City, Country} |",
            "| :-- | --: |",
            "| ${22:Role} | ${23:Month Year} – ${24:Month Year} |",
            "",
            "- ${25:Explain your contribution and its impact on the organization or community}",
            "",
            "## Projects",
            "",
            "| **${26:PROJECT NAME}** | [${27:project.example}](https://${28:example.com}) |",
            "| :-- | --: |",
            "",
            "${29:One sentence describing the problem, audience, and outcome.}",
            "",
            "- ${30:Highlight your technical or creative contribution}",
            "",
            "## Skills & Interests",
            "",
            "**Technical:** ${31:Language or tool, Language or tool, Platform or framework}",
            "",
            "**Languages:** ${32:Language (proficiency), Language (proficiency)}",
            "",
            "**Interests:** ${33:Interest, Interest, Interest}",
            "",
            ":::",
            "$0",
        ].join("\n"),
    },
    {
        id: "section",
        label: "Section",
        prefix: "section",
        description: "Generic level-2 section heading.",
        body: "## ${1:Section Name}\n\n$0",
    },
    {
        id: "section-education",
        label: "Section: Education",
        prefix: "education",
        description: "Education section with one entry and coursework line.",
        body: [
            "## Education",
            "",
            "| **${1:UNIVERSITY NAME}** | ${2:City, Country} |",
            "| :-- | --: |",
            "| ${3:Degree, Field of Study} · GPA: ${4:X.XX} | ${5:Month Year} – ${6:Month Year} |",
            "",
            "${7:Relevant coursework: Course One, Course Two, Course Three}",
            "$0",
        ].join("\n"),
    },
    {
        id: "section-experience",
        label: "Section: Experience",
        prefix: "experience",
        description: "Experience section with one entry.",
        body: ["## Experience", "", EXPERIENCE_ENTRY, "$0"].join("\n"),
    },
    {
        id: "section-projects",
        label: "Section: Projects",
        prefix: "projects",
        description: "Projects section with one project entry.",
        body: [
            "## Projects",
            "",
            "| **${1:PROJECT NAME}** | [${2:project.example}](https://${3:example.com}) |",
            "| :-- | --: |",
            "",
            "${4:One sentence describing the problem, audience, and outcome.}",
            "",
            "- ${5:Highlight your technical or creative contribution}",
            "- ${6:List a measurable result, constraint, or notable implementation detail}",
            "$0",
        ].join("\n"),
    },
    {
        id: "experience-entry",
        label: "Experience entry",
        prefix: "job",
        description: "Two-row entry table plus achievement bullets.",
        body: [EXPERIENCE_ENTRY, "$0"].join("\n"),
    },
    {
        id: "skills-block",
        label: "Skills & Interests block",
        prefix: "skills",
        description: "Technical / Languages / Interests lines for Skills & Interests.",
        body: [
            "**Technical:** ${1:Language or tool, Language or tool, Platform or framework}",
            "",
            "**Languages:** ${2:Language (proficiency), Language (proficiency)}",
            "",
            "**Interests:** ${3:Interest, Interest, Interest}",
            "$0",
        ].join("\n"),
    },
];

export function getSnippet(id: string): SnippetDefinition | undefined {
    return CV_SNIPPETS.find((s) => s.id === id);
}

/** Expand a snippet body into plain text plus sorted tab-stop ranges. */
export function expandSnippet(body: string): ExpandedSnippet {
    let text = "";
    const tabStops: SnippetTabStop[] = [];
    let i = 0;
    while (i < body.length) {
        const ch = body[i]!;
        if (ch === "\\" && (body[i + 1] === "$" || body[i + 1] === "\\")) {
            text += body[i + 1];
            i += 2;
            continue;
        }
        if (ch === "$") {
            const braced = /^\$\{(\d+):([^}]*)\}/.exec(body.slice(i));
            if (braced) {
                const placeholder = braced[2]!;
                tabStops.push({ index: Number(braced[1]), placeholder, from: text.length, to: text.length + placeholder.length });
                text += placeholder;
                i += braced[0].length;
                continue;
            }
            const bare = /^\$(\d+)/.exec(body.slice(i));
            if (bare) {
                tabStops.push({ index: Number(bare[1]), placeholder: "", from: text.length, to: text.length });
                i += bare[0].length;
                continue;
            }
        }
        text += ch;
        i += 1;
    }
    tabStops.sort((a, b) => (a.index === 0 ? Number.MAX_SAFE_INTEGER : a.index) - (b.index === 0 ? Number.MAX_SAFE_INTEGER : b.index) || a.from - b.from);
    return { text, tabStops };
}
