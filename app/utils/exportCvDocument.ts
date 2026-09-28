import { extractCvProfile } from "@core/domain/cv";
import type { CvProfileProps } from "@core/domain/cv";
import { renderCvMarkdownToHtml } from "@ruxt/editor/utils/cvMarkdown";
import { safeFilename, downloadBlob } from "./exportCvImage";

export type CvDocumentExportFormat = "md" | "html" | "jsonresume" | "yaml" | "docx";

export interface JsonResume {
    basics: {
        name: string;
        label?: string;
        email?: string;
        phone?: string;
        url?: string;
        summary?: string;
        location?: { address?: string };
        profiles: { network: string; url: string }[];
    };
    work: { name: string; position: string; location?: string; startDate?: string; endDate?: string; highlights: string[] }[];
    education: { institution: string; studyType?: string; location?: string; startDate?: string; endDate?: string; courses?: string[] }[];
    skills: { name: string; keywords: string[] }[];
    projects: { name: string; description?: string; url?: string; keywords: string[] }[];
    certificates: { name: string }[];
    languages: { language: string }[];
}

export function toJsonResume(profile: CvProfileProps): JsonResume {
    const email = profile.contacts.find((contact) => contact.kind === "email")?.value;
    const phone = profile.contacts.find((contact) => contact.kind === "phone")?.value;
    const website = profile.contacts.find((contact) => contact.kind === "website")?.value;
    const profiles = profile.contacts
        .filter((contact) => contact.kind === "linkedin" || contact.kind === "github")
        .map((contact) => ({ network: contact.kind, url: contact.value }));

    return {
        basics: {
            name: profile.identity.fullName,
            label: profile.identity.headline || undefined,
            email,
            phone,
            url: website,
            summary: profile.identity.summary || undefined,
            location: profile.identity.location ? { address: profile.identity.location } : undefined,
            profiles,
        },
        work: profile.experiences.map((experience) => ({
            name: experience.company,
            position: experience.title,
            location: experience.location || undefined,
            startDate: experience.start || undefined,
            endDate: experience.end || undefined,
            highlights: experience.highlights,
        })),
        education: profile.education.map((education) => ({
            institution: education.school,
            studyType: education.degree || undefined,
            location: education.location || undefined,
            startDate: education.start || undefined,
            endDate: education.end || undefined,
            courses: education.details ? [education.details] : undefined,
        })),
        skills: profile.skills.map((group) => ({ name: group.name, keywords: group.skills })),
        projects: profile.projects.map((project) => ({
            name: project.name,
            description: project.description || undefined,
            url: project.url || undefined,
            keywords: project.technologies,
        })),
        certificates: profile.certifications.map((certification) => ({ name: certification.name })),
        languages: profile.languages.map((language) => ({ language })),
    };
}

async function buildCvDocx(profile: CvProfileProps): Promise<Blob> {
    const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
    const children: InstanceType<typeof Paragraph>[] = [];

    children.push(new Paragraph({ text: profile.identity.fullName, heading: HeadingLevel.TITLE }));
    if (profile.identity.headline) children.push(new Paragraph({ text: profile.identity.headline }));
    if (profile.identity.location) children.push(new Paragraph({ text: profile.identity.location }));
    if (profile.identity.summary) children.push(new Paragraph({ text: profile.identity.summary }));

    const metaLine = (location: string, start: string, end: string) =>
        [location, [start, end].filter(Boolean).join(" – ")].filter(Boolean).join(" · ");

    const addSection = (title: string, rows: InstanceType<typeof Paragraph>[]) => {
        if (!rows.length) return;
        children.push(new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }));
        children.push(...rows);
    };

    addSection("Experience", profile.experiences.flatMap((experience) => [
        new Paragraph({ children: [new TextRun({ text: `${experience.title} — ${experience.company}`, bold: true })] }),
        new Paragraph({ text: metaLine(experience.location, experience.start, experience.end) }),
        ...experience.highlights.map((highlight) => new Paragraph({ text: highlight, bullet: { level: 0 } })),
    ]));

    addSection("Education", profile.education.flatMap((education) => [
        new Paragraph({ children: [new TextRun({ text: `${education.degree} — ${education.school}`, bold: true })] }),
        new Paragraph({ text: metaLine(education.location, education.start, education.end) }),
        ...(education.details ? [new Paragraph({ text: education.details })] : []),
    ]));

    addSection("Skills", profile.skills.map((group) => new Paragraph({ text: `${group.name}: ${group.skills.join(", ")}` })));

    addSection("Projects", profile.projects.flatMap((project) => [
        new Paragraph({ children: [new TextRun({ text: project.name, bold: true })] }),
        ...(project.description ? [new Paragraph({ text: project.description })] : []),
        ...(project.technologies.length ? [new Paragraph({ text: project.technologies.join(", ") })] : []),
    ]));

    addSection("Certifications", profile.certifications.map((certification) => new Paragraph({ text: certification.name })));
    if (profile.languages.length) addSection("Languages", [new Paragraph({ text: profile.languages.join(", ") })]);

    const doc = new Document({ sections: [{ children }] });
    return Packer.toBlob(doc);
}

export async function exportCvBundle(
    format: CvDocumentExportFormat,
    name: string,
    markdown: string,
    css: string,
): Promise<void> {
    const base = safeFilename(name);

    switch (format) {
        case "md": {
            const { default: JSZip } = await import("jszip");
            const zip = new JSZip();
            zip.file("content.md", markdown);
            zip.file("style.css", css);
            downloadBlob(await zip.generateAsync({ type: "blob" }), `${base}.zip`);
            break;
        }
        case "html": {
            const body = renderCvMarkdownToHtml(markdown);
            const document = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${base}</title>\n<style>${css}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
            downloadBlob(new Blob([document], { type: "text/html;charset=utf-8" }), `${base}.html`);
            break;
        }
        case "jsonresume": {
            const resume = toJsonResume(extractCvProfile(markdown));
            downloadBlob(new Blob([JSON.stringify(resume, null, 2)], { type: "application/json" }), `${base}.json`);
            break;
        }
        case "yaml": {
            const resume = toJsonResume(extractCvProfile(markdown));
            const { default: yaml } = await import("js-yaml");
            downloadBlob(new Blob([yaml.dump(resume)], { type: "application/yaml" }), `${base}.yaml`);
            break;
        }
        case "docx": {
            const blob = await buildCvDocx(extractCvProfile(markdown));
            downloadBlob(blob, `${base}.docx`);
            break;
        }
    }
}
