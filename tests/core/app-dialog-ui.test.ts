import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("application dialog accessibility contract (static source checks)", () => {
    it("mounts one reusable root host and exposes promise-based confirm/prompt", () => {
        const app = source("../../app/app.vue");
        const api = source("../../app/composables/useAppDialog.ts");
        const host = source("../../app/components/AppDialogHost.vue");
        expect(app).toContain("<AppDialogHost />");
        expect(api).toContain("confirm: (options: ConfirmDialogOptions) => enqueue<boolean>");
        expect(api).toContain("prompt: (options: PromptDialogOptions) => enqueue<string | undefined>");
        expect(host).toContain('role="dialog" aria-modal="true"');
        expect(host).toContain('event.key === "Escape"');
        expect(host).toContain('event.key !== "Tab"');
        expect(host).toContain("restore?.isConnected) restore.focus()");
        expect(host).toContain('role="alert"');
    });

    it("keeps PDF generation client-only and scoped to an explicit preview root", () => {
        const pdf = source("../../app/utils/exportCvDocument.ts");
        const session = source("../../app/components/CvSessionEditor.vue");
        const page = source("../../app/pages/index.vue");
        expect(pdf).toContain('if (!import.meta.client) throw new Error');
        expect(pdf).toContain('root.querySelectorAll<HTMLElement>(".cv-sheet")');
        expect(pdf).toContain("ownerDocument.fonts?.ready");
        expect(pdf).toContain('downloadBlob(blob, `${safeFilename(options.filename)}.pdf`, ownerDocument)');
        expect(pdf).not.toMatch(/window\.print\s*\(/);
        expect(session).toContain("exportCvPdf({ ...options, root");
        expect(page).toContain("exportCvPdf({ ...options, root");
        expect(session).not.toMatch(/window\.print\s*\(/);
        expect(page).not.toMatch(/window\.print\s*\(/);
    });
});
