import { describe, expect, it } from "vitest";
import {
   createTemplateDraft,
   templateDraftFromFiles,
   templateDraftFromJson,
} from "../../admin/app/utils/template-draft";

const file = (name: string, contents: string) => ({ name, text: async () => contents }) as File;

describe("admin template editor drafts", () => {
   it("starts with a renderable A4 template", () => {
      const draft = createTemplateDraft();
      expect(draft.markdownSkeleton).toContain(":::resume");
      expect(draft.css).toContain("210mm");
      expect(draft).toMatchObject({ pageFormats: "A4", atsFriendly: true, supportsPhoto: false });
   });

   it("imports the shared template JSON shape", () => {
      expect(templateDraftFromJson({
         id: "editorial",
         name: "Editorial",
         markdownSkeleton: "# Name",
         css: ".resume {}",
         tags: ["modern", "serif"],
         capabilities: { pageFormats: ["A4", "Letter"], supportsPhoto: true, atsFriendly: false },
      })).toEqual({
         id: "editorial",
         name: "Editorial",
         markdownSkeleton: "# Name",
         css: ".resume {}",
         tags: "modern, serif",
         pageFormats: "A4, Letter",
         supportsPhoto: true,
         atsFriendly: false,
      });
   });

   it("combines Markdown and CSS source files and rejects unknown files", async () => {
      await expect(templateDraftFromFiles([
         file("content.md", "# Imported"),
         file("style.css", ".resume { color: navy; }"),
      ])).resolves.toEqual({ markdownSkeleton: "# Imported", css: ".resume { color: navy; }" });
      await expect(templateDraftFromFiles([file("notes.txt", "ignored")])).rejects.toThrow(/Markdown, CSS, or JSON/);
   });

   it("rejects arrays as template bundles", () => {
      expect(() => templateDraftFromJson([])).toThrow(/template object/);
   });
});
