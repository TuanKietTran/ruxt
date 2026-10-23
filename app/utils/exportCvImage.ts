export type CvImageFormat = "png" | "jpeg";

export const safeFilename = (name: string) =>
    name.trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "cv";

export interface CvImageExportOptions {
    scale?: number;
    quality?: number;
    root?: HTMLElement | null;
}

const canvasToBlob = (canvas: HTMLCanvasElement, format: CvImageFormat, quality: number) =>
    new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Image encoding failed")),
        format === "png" ? "image/png" : "image/jpeg",
        quality,
    ));

export const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
};

export async function exportCvImages(
    format: CvImageFormat,
    name = "cv",
    _css = "",
    options: CvImageExportOptions = {},
): Promise<void> {
    const { default: html2canvas } = await import("html2canvas");
    await document.fonts?.ready;
    const root = options.root ?? document.querySelector<HTMLElement>(".code-preview");
    if (!root) throw new Error("No CV pages are available to export");
    await Promise.all([...root.querySelectorAll("img")].map(image => image.decode().catch(() => {})));
    // Resource completion and preview zoom/layout can schedule pagination for the next frame.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (!root.querySelector(".cv-sheet")) throw new Error("No CV pages are available to export");

    // Capture an unzoomed snapshot. Changing live preview zoom invalidates pagination and can
    // detach the sheet references while html2canvas imports/clones them, or between pages.
    const snapshot = root.cloneNode(true) as HTMLElement;
    // The snapshot lives outside the workspace. Resolve inherited theme variables and any
    // ancestor-dependent selectors now so colours, typography and dimensions remain identical.
    const originals = root.querySelectorAll<HTMLElement>(".cv-sheet, .cv-sheet *");
    const copies = snapshot.querySelectorAll<HTMLElement>(".cv-sheet, .cv-sheet *");
    originals.forEach((element, index) => {
        const copy = copies[index];
        if (!copy) return;
        const style = getComputedStyle(element);
        for (const property of style) copy.style.setProperty(property, style.getPropertyValue(property));
    });
    snapshot.querySelectorAll(".cv-pagination-measure").forEach(element => element.remove());
    snapshot.style.zoom = "1";
    const staging = document.createElement("div");
    staging.setAttribute("aria-hidden", "true");
    staging.style.cssText = "position:absolute;left:0;top:0;z-index:-2147483647;pointer-events:none;width:max-content;";
    staging.append(snapshot);
    document.body.append(staging);
    const sheets = [...snapshot.querySelectorAll<HTMLElement>(".cv-sheet")];
    const extension = format === "png" ? "png" : "jpg";
    const base = safeFilename(name);

    try {
        const blobs: Blob[] = [];
        for (const sheet of sheets) {
            const canvas = await html2canvas(sheet, {
                scale: Math.min(3, Math.max(1, options.scale ?? 2)),
                backgroundColor: "#ffffff",
                useCORS: true,
                logging: false,
            });
            blobs.push(await canvasToBlob(canvas, format, Math.min(1, Math.max(0.5, options.quality ?? 0.95))));
        }

        if (blobs.length > 1) {
            const { default: JSZip } = await import("jszip");
            const zip = new JSZip();
            blobs.forEach((blob, index) => zip.file(`${base}-page-${index + 1}.${extension}`, blob));
            downloadBlob(await zip.generateAsync({ type: "blob" }), `${base}.zip`);
        } else {
            downloadBlob(blobs[0]!, `${base}.${extension}`);
        }
    } finally {
        staging.remove();
    }
}
