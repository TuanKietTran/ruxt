import { describe, expect, it } from "vitest";
import {
   DEFAULT_EDITOR_CONTEXT,
   hasEditorFeature,
   listEditorContexts,
   registerEditorContext,
   resolveEditorContext,
} from "../../app/utils/editorContexts";

describe("editor context registry", () => {
   registerEditorContext({ id: DEFAULT_EDITOR_CONTEXT, label: "CV editor", icon: "lucide:file-text", home: "/", features: ["formatting", "export"] });
   registerEditorContext({ id: "profiles", label: "Profile editor", icon: "lucide:id-card", home: "/p", features: [] });

   it("lists contexts in registration order", () => {
      expect(listEditorContexts().map(context => context.id)).toEqual([DEFAULT_EDITOR_CONTEXT, "profiles"]);
   });

   it("resolves a page's context and falls back to the CV editor", () => {
      expect(resolveEditorContext("profiles").id).toBe("profiles");
      expect(resolveEditorContext(undefined).id).toBe(DEFAULT_EDITOR_CONTEXT);
      expect(resolveEditorContext("unknown").id).toBe(DEFAULT_EDITOR_CONTEXT);
   });

   it("exposes only the features a context declares", () => {
      expect(hasEditorFeature(resolveEditorContext("profiles"), "formatting")).toBe(false);
      expect(hasEditorFeature(resolveEditorContext(DEFAULT_EDITOR_CONTEXT), "formatting")).toBe(true);
   });

   it("replaces a context registered again under the same id without reordering", () => {
      registerEditorContext({ id: "profiles", label: "Profiles", icon: "lucide:id-card", home: "/p", features: ["export"] });
      expect(listEditorContexts().map(context => context.id)).toEqual([DEFAULT_EDITOR_CONTEXT, "profiles"]);
      expect(hasEditorFeature(resolveEditorContext("profiles"), "export")).toBe(true);
   });
});
