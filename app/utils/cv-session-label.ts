export interface CvSessionLabelInput {
    id?: string;
    name?: string;
    title?: string;
    headline?: string;
    role?: string;
    updatedAt?: string | Date;
    createdAt?: string | Date;
}

export function cvSessionLabel(session: CvSessionLabelInput): string {
    const explicitName = session.name?.trim() || session.title?.trim();
    const fallbackName = session.id === "master" ? "Current CV" : session.id?.replaceAll("-", " ").replace(/\b\w/g, character => character.toUpperCase());
    const name = explicitName || fallbackName || "Untitled session";
    const headline = session.headline?.trim() || session.role?.trim();
    const rawDate = session.updatedAt ?? session.createdAt;
    const date = rawDate ? new Date(rawDate) : null;
    const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : undefined;
    return [name, headline, dateLabel].filter((part): part is string => Boolean(part)).join(" - ");
}
