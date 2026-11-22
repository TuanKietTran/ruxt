import type { SyncKind } from "./types";

/**
 * In-tab notifications that a browser-local record changed, so the sync engine can schedule a batched
 * upload without polling. Other tabs learn about the same writes from `storage` events. `id` "*" means
 * "some record of this kind" (stores that rewrite a whole array). `origin: "cloud"` marks writes made
 * by the sync engine itself, which open editors adopt only while they hold no unsaved edits.
 */
export type LocalChangeOrigin = "local" | "cloud";
export interface LocalChange {
   kind: SyncKind;
   id: string;
   origin: LocalChangeOrigin;
}

const EVENT = "ruxt:local-change";
const target = (): EventTarget | undefined => (typeof window === "undefined" ? undefined : window);

export function emitLocalChange(change: LocalChange): void {
   try { target()?.dispatchEvent(new CustomEvent<LocalChange>(EVENT, { detail: change })); } catch { /* no DOM */ }
}

export function onLocalChange(listener: (change: LocalChange) => void): () => void {
   const host = target();
   if (!host) return () => {};
   const handler = (event: Event) => listener((event as CustomEvent<LocalChange>).detail);
   host.addEventListener(EVENT, handler);
   return () => host.removeEventListener(EVENT, handler);
}

/** Editors currently open in this tab, with a probe for unsaved edits. */
const editors = new Map<string, Set<() => boolean>>();
const editorKey = (kind: SyncKind, id: string) => `${kind}:${id}`;

export function registerOpenEditor(kind: SyncKind, id: string, isDirty: () => boolean): () => void {
   const key = editorKey(kind, id);
   const probes = editors.get(key) ?? new Set();
   probes.add(isDirty);
   editors.set(key, probes);
   return () => {
      probes.delete(isDirty);
      if (!probes.size) editors.delete(key);
   };
}

/** True when an editor in this tab holds unsaved edits for the record; sync must not replace it then. */
export function isEditorDirty(kind: SyncKind, id: string): boolean {
   for (const probe of editors.get(editorKey(kind, id)) ?? []) {
      try { if (probe()) return true; } catch { return true; }
   }
   return false;
}

export function isEditorOpen(kind: SyncKind, id: string): boolean {
   return editors.has(editorKey(kind, id));
}
