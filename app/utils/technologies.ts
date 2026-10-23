/** Split a typed technologies string on commas and line breaks. Every non-empty token is kept, however short ("Go", "C", "R"). */
export const parseTechnologies = (value: string): string[] =>
    value.split(/[,\n]/).map(item => item.trim()).filter(Boolean);

/** The list after committing exactly what is in the entry box: existing chips first, then the box's tokens. */
export const commitTechnologies = (chips: readonly string[], box: string): string[] => [...chips, ...parseTechnologies(box)];
