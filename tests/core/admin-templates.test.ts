import { describe, expect, it } from "vitest";
import {
   TemplateAdminError,
   createTemplate,
   createTemplateVersion,
   deleteTemplateVersion,
   listTemplates,
   setTemplatePublished,
   type TemplateStorage,
} from "../../admin/server/lib/templates";

class MemoryStorage implements TemplateStorage {
   items = new Map<string, unknown>();
   async getKeys(base: string) { return [...this.items.keys()].filter(key => key.startsWith(base)); }
   async getItem<T>(key: string) { return (this.items.get(key) as T | undefined) ?? null; }
   async setItem(key: string, value: unknown) { this.items.set(key, structuredClone(value)); }
   async removeItem(key: string) { this.items.delete(key); }
}

const draft = { name: "Clean", markdownSkeleton: "# Name", css: "body {}", tags: ["ats"] };

describe("admin template lifecycle", () => {
   it("creates immutable drafts and moves public visibility between versions", async () => {
      const storage = new MemoryStorage();
      const first = await createTemplate(storage, { id: "clean", ...draft }, () => "2026-01-01T00:00:00.000Z");
      expect(first).toMatchObject({ id: "clean", version: 1, tags: ["ats"], builtIn: false });

      await setTemplatePublished(storage, "clean", 1, true);
      const second = await createTemplateVersion(storage, "clean", { css: "body { color: red }" }, () => "2026-01-02T00:00:00.000Z");
      expect(second).toMatchObject({ version: 2, tags: ["ats"] });

      await setTemplatePublished(storage, "clean", 2, true);
      const summary = (await listTemplates(storage))[0]!;
      expect(summary.publishedVersion).toBe(2);
      expect(summary.versions.map(version => version.published)).toEqual([false, true]);
   });

   it("protects published and built-in versions from deletion", async () => {
      const storage = new MemoryStorage();
      await createTemplate(storage, { id: "clean", ...draft });
      await setTemplatePublished(storage, "clean", 1, true);
      await expect(deleteTemplateVersion(storage, "clean", 1)).rejects.toMatchObject({ statusCode: 409 });

      storage.items.set("templates:built-in:v1", {
         id: "built-in", version: 1, ...draft, capabilities: { pageFormats: ["A4"], supportsPhoto: false, atsFriendly: true },
         builtIn: true, createdAt: "2026-01-01T00:00:00.000Z",
      });
      await expect(deleteTemplateVersion(storage, "built-in", 1)).rejects.toBeInstanceOf(TemplateAdminError);
   });

   it("rejects reserved visibility tags and internal publication", async () => {
      const storage = new MemoryStorage();
      await expect(createTemplate(storage, { id: "clean", ...draft, tags: ["public"] })).rejects.toMatchObject({ statusCode: 400 });
      await createTemplate(storage, { id: "pipeline-default", ...draft });
      await expect(setTemplatePublished(storage, "pipeline-default", 1, true)).rejects.toMatchObject({ statusCode: 409 });
   });
});
