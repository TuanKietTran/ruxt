import { CvTemplate, normalizeCvProfile, type CvTemplateProps } from "@ruxt/shared/cv";
import type { LocalRecord, RecordAdapter } from "./contracts";
import { emitLocalChange } from "./localChanges";
import type { SyncKind, SyncSnapshot } from "./types";
import { CV_SESSION_BACKUP_PREFIX } from "../cvSessionBackup";
import { LOCAL_CV_TEMPLATES_KEY } from "../localCvTemplates";
import { LOCAL_PROFILES_KEY, defaultProfileLabel, newLocalProfileId, profileLabel } from "../localProfiles";

/**
 * Record adapters: the browser-local data a user can select for cloud sync, in canonical form.
 *
 * Each adapter reads and writes the same storage the app already uses, so a synchronized record is the
 * same record the editors open. Snapshot content is canonical JSON with a fixed key order; equal content
 * always hashes equally. Writes never drop unreadable or unrelated entries and report refusal instead of
 * throwing, leaving the previous value intact.
 */

type StorageGetter = () => Storage | undefined;
const PLACEHOLDER_TITLE = "Untitled CV";

const defaultStorage: StorageGetter = () => {
   try { return globalThis.localStorage; } catch { return undefined; }
};

const readJson = (storage: StorageGetter, key: string): { ok: boolean; value: unknown } => {
   try {
      const raw = storage()?.getItem(key) ?? null;
      if (raw === null) return { ok: true, value: null };
      return { ok: true, value: JSON.parse(raw) };
   } catch {
      return { ok: false, value: null };
   }
};

const writeJson = (storage: StorageGetter, key: string, value: unknown): boolean => {
   try {
      const target = storage();
      if (!target) return false;
      target.setItem(key, JSON.stringify(value));
      return true;
   } catch {
      return false;
   }
};

const isObject = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const iso = (millis: unknown, fallback = 0) => new Date(Number(millis) || fallback).toISOString();

const parseContent = (snapshot: SyncSnapshot, schema: string): Record<string, any> | null => {
   try {
      const value = JSON.parse(snapshot.content);
      return isObject(value) && value.schema === schema ? value : null;
   } catch {
      return null;
   }
};

// ------------------------------------------------------------------------------------------------
// Sessions
// ------------------------------------------------------------------------------------------------

export function sessionSnapshot(title: string, markdown: string, css: string): SyncSnapshot {
   return { title, content: JSON.stringify({ schema: "ruxt.session/1", markdown, css }) };
}

export function createSessionAdapter(storage: StorageGetter = defaultStorage): RecordAdapter {
   const keyOf = (id: string) => CV_SESSION_BACKUP_PREFIX + id;
   const toRecord = (id: string, value: unknown): LocalRecord | null => {
      if (!isObject(value) || typeof value.markdown !== "string" || typeof value.css !== "string") return null;
      const title = typeof value.title === "string" && value.title.trim() ? value.title : PLACEHOLDER_TITLE;
      return {
         kind: "session", id, title, updatedAt: iso(value.savedAt),
         snapshot: sessionSnapshot(title, value.markdown, value.css),
         ...(value.syncConflict === true ? { syncConflict: true } : {}),
      };
   };
   const adapter: RecordAdapter = {
      kind: "session",
      list() {
         const target = storage();
         const records: LocalRecord[] = [];
         try {
            for (let index = 0; target && index < target.length; index += 1) {
               const key = target.key(index);
               if (!key?.startsWith(CV_SESSION_BACKUP_PREFIX)) continue;
               const record = adapter.get(key.slice(CV_SESSION_BACKUP_PREFIX.length));
               if (record) records.push(record);
            }
         } catch { /* storage blocked */ }
         return records;
      },
      get(id) {
         const read = readJson(storage, keyOf(id));
         return read.ok ? toRecord(id, read.value) : null;
      },
      write(id, snapshot) {
         const fields = parseContent(snapshot, "ruxt.session/1");
         if (!fields || typeof fields.markdown !== "string" || typeof fields.css !== "string") return false;
         const read = readJson(storage, keyOf(id));
         // Unreadable existing data is still user data: never replace it.
         if (!read.ok || (read.value !== null && !isObject(read.value))) return false;
         const previous = (read.value ?? {}) as Record<string, any>;
         const { syncConflict: _cleared, ...kept } = previous;
         const title = snapshot.title.trim() ? snapshot.title : (typeof previous.title === "string" ? previous.title : PLACEHOLDER_TITLE);
         const next = {
            ...kept, markdown: fields.markdown, css: fields.css, title,
            revision: (Number(previous.revision) || 0) + 1, pending: false, savedAt: Date.now(), cloudApplied: true,
         };
         if (!writeJson(storage, keyOf(id), next)) return false;
         emitLocalChange({ kind: "session", id, origin: "cloud" });
         return true;
      },
      createCopy(snapshot, title) {
         const fields = parseContent(snapshot, "ruxt.session/1");
         if (!fields || typeof fields.markdown !== "string" || typeof fields.css !== "string") return null;
         const id = globalThis.crypto.randomUUID();
         const value = { markdown: fields.markdown, css: fields.css, title, revision: 1, pending: false, savedAt: Date.now() };
         if (!writeJson(storage, keyOf(id), value)) return null;
         emitLocalChange({ kind: "session", id, origin: "local" });
         return id;
      },
      clearConflict(id) {
         const read = readJson(storage, keyOf(id));
         if (!read.ok || !isObject(read.value) || read.value.syncConflict !== true) return;
         const { syncConflict: _cleared, ...kept } = read.value;
         writeJson(storage, keyOf(id), kept);
      },
      ownsStorageKey: key => key.startsWith(CV_SESSION_BACKUP_PREFIX),
   };
   return adapter;
}

// ------------------------------------------------------------------------------------------------
// User templates (built-in templates are never eligible)
// ------------------------------------------------------------------------------------------------

const templateContent = (props: Pick<CvTemplateProps, "markdownSkeleton" | "css" | "capabilities" | "tags">) => JSON.stringify({
   schema: "ruxt.template/1", markdownSkeleton: props.markdownSkeleton, css: props.css, capabilities: props.capabilities, tags: props.tags,
});

export function createTemplateAdapter(storage: StorageGetter = defaultStorage): RecordAdapter {
   const readAll = (): { ok: boolean; entries: unknown[] } => {
      const read = readJson(storage, LOCAL_CV_TEMPLATES_KEY);
      if (!read.ok) return { ok: false, entries: [] };
      if (read.value === null) return { ok: true, entries: [] };
      return Array.isArray(read.value) ? { ok: true, entries: read.value } : { ok: false, entries: [] };
   };
   const toRecord = (entry: unknown): LocalRecord | null => {
      if (!isObject(entry) || entry.builtIn === true) return null;
      try {
         const props = CvTemplate.create(entry as CvTemplateProps).toJSON();
         return {
            kind: "template", id: props.id, title: props.name, updatedAt: props.createdAt,
            snapshot: { title: props.name, content: templateContent(props) },
         };
      } catch {
         return null;
      }
   };
   const save = (id: string, snapshot: SyncSnapshot, isCopy: boolean): string | null => {
      const fields = parseContent(snapshot, "ruxt.template/1");
      if (!fields) return null;
      const all = readAll();
      if (!all.ok) return null;
      const index = all.entries.findIndex(entry => isObject(entry) && entry.id === id);
      const previous = index >= 0 ? all.entries[index] as Record<string, any> : null;
      if (previous?.builtIn === true) return null;
      let props: CvTemplateProps;
      try {
         props = CvTemplate.create({
            id, version: (Number(previous?.version) || 0) + 1, name: snapshot.title.trim() || String(previous?.name ?? "Template"),
            markdownSkeleton: fields.markdownSkeleton, css: fields.css, capabilities: fields.capabilities, builtIn: false,
            tags: Array.isArray(fields.tags) ? fields.tags : ["local"], createdAt: previous?.createdAt ?? new Date().toISOString(),
         } as CvTemplateProps).toJSON();
      } catch {
         return null;
      }
      const entries = [...all.entries];
      if (index >= 0) entries[index] = props; else entries.push(props);
      if (!writeJson(storage, LOCAL_CV_TEMPLATES_KEY, entries)) return null;
      emitLocalChange({ kind: "template", id, origin: isCopy ? "local" : "cloud" });
      return id;
   };
   return {
      kind: "template",
      list: () => readAll().entries.flatMap(entry => toRecord(entry) ?? []),
      get: id => toRecord(readAll().entries.find(entry => isObject(entry) && entry.id === id)),
      write: (id, snapshot) => save(id, snapshot, false) !== null,
      createCopy: (snapshot, title) => save(`template-${globalThis.crypto.randomUUID()}`, { ...snapshot, title }, true),
      clearConflict: () => {},
      ownsStorageKey: key => key === LOCAL_CV_TEMPLATES_KEY,
   };
}

// ------------------------------------------------------------------------------------------------
// Local profiles
// ------------------------------------------------------------------------------------------------

export function createProfileAdapter(storage: StorageGetter = defaultStorage): RecordAdapter {
   const readAll = (): { ok: boolean; entries: unknown[] } => {
      const read = readJson(storage, LOCAL_PROFILES_KEY);
      if (!read.ok) return { ok: false, entries: [] };
      if (read.value === null) return { ok: true, entries: [] };
      return Array.isArray(read.value) ? { ok: true, entries: read.value } : { ok: false, entries: [] };
   };
   const toRecord = (entry: unknown): LocalRecord | null => {
      // Legacy records without an id get one when the profile page upgrades them; until then they are not eligible.
      if (!isObject(entry) || typeof entry.id !== "string" || !entry.id) return null;
      try {
         const profile = normalizeCvProfile(entry);
         const title = profileLabel({ ...profile, label: entry.label });
         return {
            kind: "profile", id: entry.id, title, updatedAt: iso(entry.updatedAt ?? entry.createdAt),
            snapshot: { title, content: JSON.stringify({ schema: "ruxt.profile/1", profile }) },
         };
      } catch {
         return null;
      }
   };
   const save = (id: string, snapshot: SyncSnapshot, isCopy: boolean): string | null => {
      const fields = parseContent(snapshot, "ruxt.profile/1");
      if (!fields || !isObject(fields.profile)) return null;
      const all = readAll();
      if (!all.ok) return null;
      let profile;
      try { profile = normalizeCvProfile(fields.profile); } catch { return null; }
      const index = all.entries.findIndex(entry => isObject(entry) && entry.id === id);
      const previous = index >= 0 ? all.entries[index] as Record<string, any> : null;
      const now = Date.now();
      const saved = {
         ...profile, label: snapshot.title.trim() || defaultProfileLabel(profile), id,
         createdAt: Number(previous?.createdAt) || now, updatedAt: now,
      };
      const entries = [...all.entries];
      if (index >= 0) entries[index] = saved; else entries.push(saved);
      if (!writeJson(storage, LOCAL_PROFILES_KEY, entries)) return null;
      emitLocalChange({ kind: "profile", id, origin: isCopy ? "local" : "cloud" });
      return id;
   };
   return {
      kind: "profile",
      list: () => readAll().entries.flatMap(entry => toRecord(entry) ?? []),
      get: id => toRecord(readAll().entries.find(entry => isObject(entry) && entry.id === id)),
      write: (id, snapshot) => save(id, snapshot, false) !== null,
      createCopy: (snapshot, title) => save(newLocalProfileId(), { ...snapshot, title }, true),
      clearConflict: () => {},
      ownsStorageKey: key => key === LOCAL_PROFILES_KEY,
   };
}

export function createRecordAdapters(storage: StorageGetter = defaultStorage): Record<SyncKind, RecordAdapter> {
   return {
      session: createSessionAdapter(storage),
      template: createTemplateAdapter(storage),
      profile: createProfileAdapter(storage),
   };
}
