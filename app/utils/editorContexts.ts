/**
 * Editor contexts are the products that share the editor layout (CV editor, profile editor, …). Each
 * registers its activity-bar entry and the layout features it uses, and a page selects its context with
 * `definePageMeta({ editorContext: "<id>" })`. The layout renders from the active registration instead
 * of branching on route paths, so a new context needs a registration, not layout edits.
 */
export type EditorFeature =
    /** Markdown formatting toolbar and indicator toggle in the header. */
    | "formatting"
    /** Header Export button for the current CV. */
    | "export"
    /** Header Import button (only shown when the authenticated feature is on). */
    | "import"
    /** Read-only template viewer opened from `?t=<id>&v=<version>`. */
    | "templates"
    /** Document save state, revision, cursor, word, page, and paper stats in the status bar. */
    | "documentStats";

export interface EditorContext {
    id: string;
    /** Accessible label for the activity-bar entry. */
    label: string;
    /** Activity-bar glyph. */
    icon: string;
    /** Route opened from the activity bar before this context remembers a location of its own. */
    home: string;
    features: readonly EditorFeature[];
}

export const DEFAULT_EDITOR_CONTEXT = "cv";

const registry = new Map<string, EditorContext>();

/** Register (or replace) a context. Registration order is activity-bar order. */
export function registerEditorContext(context: EditorContext): void {
    registry.set(context.id, Object.freeze({ ...context, features: [...context.features] }));
}

export const listEditorContexts = (): EditorContext[] => [...registry.values()];

/** The registered context with `id`, falling back to the default CV context. */
export function resolveEditorContext(id: unknown): EditorContext {
    const context = (typeof id === "string" && registry.get(id)) || registry.get(DEFAULT_EDITOR_CONTEXT);
    if (!context) throw new Error(`Editor context "${DEFAULT_EDITOR_CONTEXT}" is not registered`);
    return context;
}

export const hasEditorFeature = (context: EditorContext, feature: EditorFeature) => context.features.includes(feature);

declare module "#app" {
    interface PageMeta {
        /** Id of the registered editor context this page renders in; defaults to the CV editor. */
        editorContext?: string;
    }
}
