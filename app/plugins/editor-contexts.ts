import { DEFAULT_EDITOR_CONTEXT, registerEditorContext } from "~/utils/editorContexts";

// Built-in editor contexts. Order here is activity-bar order.
export default defineNuxtPlugin(() => {
    registerEditorContext({
        id: DEFAULT_EDITOR_CONTEXT,
        label: "CV editor",
        icon: "▤",
        home: "/",
        features: ["formatting", "export", "import", "templates", "documentStats"],
    });
    registerEditorContext({
        id: "profiles",
        label: "Profile editor",
        icon: "♙",
        home: "/p",
        features: [],
    });
});
