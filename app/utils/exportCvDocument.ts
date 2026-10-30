import { extractCvProfile } from "@ruxt/shared/cv";
import type { CvProfileProps } from "@ruxt/shared/cv";
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

export type CvPdfPaper = "a4" | "letter" | "legal";
export interface CvPdfExportOptions {
    filename: string;
    paper: CvPdfPaper;
    orientation: "portrait" | "landscape";
    margins: { top: number; right: number; bottom: number; left: number };
    pages: string;
}
export interface CvPdfRenderOptions extends CvPdfExportOptions {
    root: HTMLElement;
    onProgress?: (completed: number, total: number) => void;
}

export function parseCvPdfPageSelection(value: string, total: number): number[] {
    if (!Number.isInteger(total) || total < 1) throw new Error("No rendered CV pages are available to export.");
    if (!value.trim()) return Array.from({ length: total }, (_, index) => index + 1);
    if (!/^[\d,\s-]+$/.test(value)) throw new Error("Enter page numbers or ranges, for example 1-3,5.");
    const selected = new Set<number>();
    const parts = value.split(",").map(item => item.trim());
    if (parts.some(part => !part)) throw new Error("Enter page numbers or ranges, for example 1-3,5.");
    for (const part of parts) {
        const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
        if (!match) throw new Error("Enter page numbers or ranges, for example 1-3,5.");
        const start = Number(match[1]); const end = Number(match[2] ?? match[1]);
        if (start < 1 || end < start || end > total) throw new Error(`Choose pages from 1 to ${total}.`);
        for (let page = start; page <= end; page++) selected.add(page);
    }
    if (!selected.size) throw new Error("Choose at least one page.");
    return [...selected].sort((a, b) => a - b);
}

export async function exportCvPdf(options: CvPdfRenderOptions): Promise<void> {
    if (!import.meta.client) throw new Error("PDF export is only available in the browser.");
    const { root } = options;
    if (!root.isConnected) throw new Error("The CV preview is no longer available. Reopen the export dialog and retry.");
    const ownerDocument = root.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) throw new Error("The CV preview browser context is unavailable.");
    const sourceSheets = [...root.querySelectorAll<HTMLElement>(".cv-sheet")];
    const pageNumbers = parseCvPdfPageSelection(options.pages, sourceSheets.length);
    if (![options.margins.top, options.margins.right, options.margins.bottom, options.margins.left].every(value => Number.isFinite(value) && value >= 0 && value <= 50)) {
        throw new Error("Margins must be between 0 and 50 mm.");
    }
    await ownerDocument.fonts?.ready;
    await Promise.all([...root.querySelectorAll("img")].map(image => image.decode().catch(() => {})));
    const { default: html2canvas } = await import("html2canvas");
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: options.orientation, unit: "mm", format: options.paper, compress: true });
    const staging = ownerDocument.createElement("div");
    staging.setAttribute("aria-hidden", "true");
    staging.style.cssText = "position:fixed;left:-100000px;top:0;z-index:-2147483647;pointer-events:none;";
    ownerDocument.body.append(staging);
    try {
        for (let index = 0; index < pageNumbers.length; index++) {
            const pageNumber = pageNumbers[index]!;
            const original = sourceSheets[pageNumber - 1];
            if (!original) throw new Error(`CV page ${pageNumber} is no longer available.`);
            const sheet = original.cloneNode(true) as HTMLElement;
            const originals = [original, ...original.querySelectorAll<HTMLElement>("*")];
            const copies = [sheet, ...sheet.querySelectorAll<HTMLElement>("*")];
            originals.forEach((element, elementIndex) => {
                const copy = copies[elementIndex];
                if (!copy) return;
                const computed = ownerWindow.getComputedStyle(element);
                for (const property of computed) copy.style.setProperty(property, computed.getPropertyValue(property));
            });
            sheet.style.transform = "none";
            sheet.style.zoom = "1";
            sheet.style.margin = "0";
            staging.replaceChildren(sheet);
            await Promise.all([...sheet.querySelectorAll("img")].map(image => image.decode().catch(() => {})));
            const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
            const pageSize = pdf.internal.pageSize;
            const pageWidth = pageSize.getWidth(); const pageHeight = pageSize.getHeight();
            const contentWidth = pageWidth - options.margins.left - options.margins.right;
            const contentHeight = pageHeight - options.margins.top - options.margins.bottom;
            if (contentWidth <= 0 || contentHeight <= 0) throw new Error("Margins leave no printable page area.");
            const ratio = Math.min(contentWidth / canvas.width, contentHeight / canvas.height);
            const width = canvas.width * ratio; const height = canvas.height * ratio;
            if (index > 0) pdf.addPage(options.paper, options.orientation);
            pdf.addImage(canvas.toDataURL("image/jpeg", 0.96), "JPEG", options.margins.left, options.margins.top, width, height, undefined, "FAST");
            options.onProgress?.(index + 1, pageNumbers.length);
        }
        const blob = pdf.output("blob");
        downloadBlob(blob, `${safeFilename(options.filename)}.pdf`, ownerDocument);
    } finally {
        staging.remove();
    }
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
