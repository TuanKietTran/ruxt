export type EditorChromeSaveKind = "saved" | "saving" | "error";

export interface EditorChromeSaveStatus {
    kind: EditorChromeSaveKind;
    label: string;
    onRetry?: () => void;
}

export interface EditorChromeAction {
    id: string;
    label: string;
    primary?: boolean;
    danger?: boolean;
    dividerBefore?: boolean;
    disabled?: boolean;
    ariaLabel?: string;
    action: () => void | Promise<void>;
}

export interface EditorChromeState {
    title: string;
    titleEditable?: boolean;
    onTitleCommit?: (title: string) => void | Promise<void>;
    saveStatus?: EditorChromeSaveStatus;
    actions: EditorChromeAction[];
}

const editorChromeKey = "ruxt-editor-chrome";

/**
 * Publish target for the global .editor-header: an editor page publishes
 * { title, saveStatus, actions } and the layout header renders it.
 * Pages must call publish() on the client (e.g. in a watcher or onMounted)
 * and clear() on unmount / route change so /settings and /about show
 * nothing stale. Backed by useState, so it is SSR-safe and shared between
 * the page and the NuxtLayout rendering the header.
 */
export function useEditorChrome() {
    const chrome = useState<EditorChromeState | null>(editorChromeKey, () => null);

    const publish = (state: EditorChromeState) => {
        // The state holds callbacks, which the SSR payload serializer cannot stringify
        // (DevalueError: Cannot stringify a function). Publish on the client only.
        if (import.meta.server) return;
        chrome.value = state;
    };

    const clear = () => {
        chrome.value = null;
    };

    return { chrome, publish, clear };
}
