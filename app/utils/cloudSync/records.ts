import { CvTemplate, normalizeCvProfile, type CvTemplateProps } from "@ruxt/shared/cv";
import { JOB_PREFERENCES_KEY, normalizeJobPreferences } from "../jobSnapshot";
import type { LocalRecord, RecordAdapter } from "./contracts";
import { emitLocalChange } from "./localChanges";
import type { SyncSnapshot } from "./types";
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

export type StorageGetter = () => Storage | undefined;
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

/**
 * Give every stored profile a stable id. Profiles saved by early versions have none, which made them invisible
 * to sync. Existing ids and every other field are kept exactly (nothing is normalized or dropped), the ids are
 * written back once so they stay the same on every later read, and nothing is changed when the write is refused:
 * an id that was not persisted would differ on the next read, so such entries stay ineligible instead.
 */
export function upgradeStoredProfileIds(entries: readonly unknown[], newId: () => string = newLocalProfileId): { entries: unknown[]; upgraded: boolean } {
   let upgraded = false;
   const next = entries.map(entry => {
      if (!isObject(entry) || (typeof entry.id === "string" && entry.id)) return entry;
      upgraded = true;
      return { ...entry, id: newId() };
   });
   return { entries: upgraded ? next : [...entries], upgraded };
}

export function createProfileAdapter(storage: StorageGetter = defaultStorage): RecordAdapter {
   const readAll = (): { ok: boolean; entries: unknown[] } => {
      const read = readJson(storage, LOCAL_PROFILES_KEY);
      if (!read.ok) return { ok: false, entries: [] };
      if (read.value === null) return { ok: true, entries: [] };
      if (!Array.isArray(read.value)) return { ok: false, entries: [] };
      const { entries, upgraded } = upgradeStoredProfileIds(read.value);
      if (!upgraded) return { ok: true, entries };
      // Read and write back in one synchronous step so two tabs cannot hand out different ids to one profile.
      return writeJson(storage, LOCAL_PROFILES_KEY, entries) ? { ok: true, entries } : { ok: true, entries: read.value };
   };
   const toRecord = (entry: unknown): LocalRecord | null => {
      // A record without an id (the id upgrade could not be saved) is not eligible until it has one.
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

// ------------------------------------------------------------------------------------------------
// Job automation preferences (one record, fixed identity)
// ------------------------------------------------------------------------------------------------

export const JOB_PREFERENCES_RECORD_ID = "job-preferences";
const JOB_PREFERENCES_TITLE = "Job preferences";

/** Canonical JSON of normalized preferences: fixed key order, and standing answers sorted, so equal data hashes equally. */
export function jobPreferencesSnapshot(raw: unknown): SyncSnapshot {
   const preferences = normalizeJobPreferences(raw);
   const answers = Object.fromEntries(Object.entries(preferences.answers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
   return { title: JOB_PREFERENCES_TITLE, content: JSON.stringify({ schema: "ruxt.job-preferences/1", preferences: { ...preferences, answers } }) };
}

/**
 * The job-automation search preferences and standing answers (target roles, locations, salary, work
 * authorization, ...). The stored object keeps the format the Jobs page reads; an extra `savedAt` records when
 * it was last written. Which CVs the person last selected to send is a per-device convenience that refers to
 * local record ids, so it is deliberately not part of this record.
 */
export function createJobPreferencesAdapter(storage: StorageGetter = defaultStorage): RecordAdapter {
   const toRecord = (): LocalRecord | null => {
      const read = readJson(storage, JOB_PREFERENCES_KEY);
      if (!read.ok || !isObject(read.value)) return null;
      const snapshot = jobPreferencesSnapshot(read.value);
      return { kind: "jobPreferences", id: JOB_PREFERENCES_RECORD_ID, title: snapshot.title, updatedAt: iso(read.value.savedAt), snapshot };
   };
   return {
      kind: "jobPreferences",
      list: () => { const record = toRecord(); return record ? [record] : []; },
      get: id => (id === JOB_PREFERENCES_RECORD_ID ? toRecord() : null),
      write(id, snapshot) {
         if (id !== JOB_PREFERENCES_RECORD_ID) return false;
         const fields = parseContent(snapshot, "ruxt.job-preferences/1");
         if (!fields || !isObject(fields.preferences)) return false;
         // Unreadable existing data is still user data: never replace it.
         const read = readJson(storage, JOB_PREFERENCES_KEY);
         if (!read.ok || (read.value !== null && !isObject(read.value))) return false;
         if (!writeJson(storage, JOB_PREFERENCES_KEY, { ...normalizeJobPreferences(fields.preferences), savedAt: Date.now() })) return false;
         emitLocalChange({ kind: "jobPreferences", id, origin: "cloud" });
         return true;
      },
      // One record per account: there is no second place to keep a copy, so the engine saves recovery instead.
      createCopy: () => null,
      clearConflict: () => {},
      ownsStorageKey: key => key === JOB_PREFERENCES_KEY,
   };
}
