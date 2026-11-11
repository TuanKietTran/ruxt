/**
 * Pure schema for the CV document grammar the editor already parses.
 *
 * Grounded in the repo, not invented:
 * - `cvMarkdown.ts` renders remark-directive container directives as
 *   `<div class=directive-name+attrs>` and parses a trailing `{ .class #id }`
 *   block on headings and paragraphs (sanitize allows className/id only).
 * - `reference-cv.md` is one `:::resume` container using the `{.cv-name}`
 *   name heading and the first five sections below, in that order.
 * - Profile keys are the `CvProfileProps` shape used by the core profile
 *   grammar (`tests/core/cv-profile-*.test.ts`, `@ruxt/shared/cv`).
 *
 * No CodeMirror, DOM or Vue imports: this module is a plain language
 * service usable from tests, workers and the editor alike.
 */

export const DIRECTIVE_MARKER = ":::";

export interface DirectiveSpec {
    name: string;
    kind: "container";
    description: string;
}

/** The only container directive used anywhere in the repo. */
export const CV_DIRECTIVES: readonly DirectiveSpec[] = [
    { name: "resume", kind: "container", description: "Resume sheet container; rendered as a div carrying the directive name as a class." },
];

export const DIRECTIVE_NAMES: readonly string[] = CV_DIRECTIVES.map((d) => d.name);

export function isKnownDirective(name: string): boolean {
    return CV_DIRECTIVES.some((d) => d.name === name);
}

export interface AttributeClassSpec {
    name: string;
    appliesTo: "heading" | "paragraph";
    description: string;
}

/**
 * Classes with a defined meaning in a trailing `{ .class }` block.
 * Preview-only classes such as `.cv-sheet` are stylesheet internals and
 * are deliberately not document grammar.
 */
export const ATTRIBUTE_CLASSES: readonly AttributeClassSpec[] = [
    { name: "cv-name", appliesTo: "heading", description: "Marks the level-1 heading carrying the candidate's name." },
];

export const ATTRIBUTE_CLASS_NAMES: readonly string[] = ATTRIBUTE_CLASSES.map((c) => c.name);

/** The grammar accepts any `#id`, but the repo names no known ids. */
export const KNOWN_ATTRIBUTE_IDS: readonly string[] = [];

export function isKnownAttributeClass(name: string): boolean {
    return ATTRIBUTE_CLASSES.some((c) => c.name === name);
}

export interface AttributeBlock {
    classes: string[];
    id?: string;
}

/**
 * Parse the inside of a `{ ... }` attribute block exactly like
 * `cvMarkdown.ts`: `.token` collects a class, `#token` sets the id,
 * every other token is ignored.
 */
export function parseAttributeTokens(content: string): AttributeBlock {
    const classes: string[] = [];
    let id: string | undefined;
    for (const token of content.trim().split(/\s+/)) {
        if (token.startsWith(".") && token.length > 1) classes.push(token.slice(1));
        else if (token.startsWith("#") && token.length > 1) id = token.slice(1);
    }
    return id === undefined ? { classes } : { classes, id };
}

export type CvProfileKey =
    | "version"
    | "identity"
    | "contacts"
    | "experiences"
    | "skills"
    | "certifications"
    | "education"
    | "projects"
    | "languages";

/** Top-level `CvProfileProps` keys, in the shared type's order. */
export const PROFILE_KEYS: readonly CvProfileKey[] = [
    "version", "identity", "contacts", "experiences", "skills",
    "certifications", "education", "projects", "languages",
];

/** Field keys of each object-shaped profile section. */
export const PROFILE_FIELD_KEYS = {
    identity: ["fullName", "headline", "summary", "location"],
    contacts: ["kind", "label", "value"],
    experiences: ["title", "company", "location", "start", "end", "highlights"],
    skills: ["name", "skills"],
    certifications: ["name", "issuer", "start", "end"],
    education: ["degree", "school", "location", "start", "end", "details"],
    projects: ["name", "url", "description", "technologies"],
} as const;

export const CONTACT_KINDS: readonly string[] = ["email", "phone", "linkedin", "github", "website", "other"];

export interface SectionSpec {
    name: string;
    level: 2;
    /** The profile key this section fills, when it has one. */
    profileKey?: CvProfileKey;
}

/**
 * Known level-2 sections. The first five are `reference-cv.md` in order;
 * the rest appear in profile fixtures/skeletons in the repo
 * (Objective/Skills in cv-profile-detect, Certifications appended by
 * compose, Languages from the profile shape).
 */
export const CV_SECTIONS: readonly SectionSpec[] = [
    { name: "Education", level: 2, profileKey: "education" },
    { name: "Experience", level: 2, profileKey: "experiences" },
    { name: "Leadership & Activities", level: 2 },
    { name: "Projects", level: 2, profileKey: "projects" },
    { name: "Skills & Interests", level: 2, profileKey: "skills" },
    { name: "Objective", level: 2, profileKey: "identity" },
    { name: "Skills", level: 2, profileKey: "skills" },
    { name: "Certifications", level: 2, profileKey: "certifications" },
    { name: "Languages", level: 2, profileKey: "languages" },
];

export const SECTION_NAMES: readonly string[] = CV_SECTIONS.map((s) => s.name);

export function sectionByName(name: string): SectionSpec | undefined {
    const wanted = name.trim().toLowerCase();
    return CV_SECTIONS.find((s) => s.name.toLowerCase() === wanted);
}

export function isKnownSection(name: string): boolean {
    return sectionByName(name) !== undefined;
}

export function sectionForProfileKey(key: CvProfileKey): SectionSpec | undefined {
    return CV_SECTIONS.find((s) => s.profileKey === key);
}
