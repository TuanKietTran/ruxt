import { beforeEach, describe, expect, it } from "vitest";
import { cvSessionsToRecover, mergeCvSessions, shouldRestoreCvBackup } from "@core/domain/cv";
import {
   clearCvNewSessionDraft,
   clearCvSessionBackup,
   listCvSessionBackups,
   readCvNewSessionDraft,
   readCvSessionBackup,
   writeCvNewSessionDraft,
   writeCvSessionBackup,
} from "../../app/utils/cvSessionBackup";

const server = { markdown: "# Ada\n\nSaved", css: ".cv {}", revision: 4 };
const backup = (overrides: Partial<{ markdown: string; css: string; revision: number; pending: boolean }> = {}) =>
   ({ markdown: "# Ada\n\nSaved", css: ".cv {}", revision: 4, pending: false, ...overrides });

describe("shouldRestoreCvBackup", () => {
   it("keeps the server copy when there is nothing newer locally", () => {
      expect(shouldRestoreCvBackup(null, server)).toBe(false);
      expect(shouldRestoreCvBackup(backup(), server)).toBe(false);
      expect(shouldRestoreCvBackup(backup({ markdown: "# Ada\n\nOld", revision: 3 }), server)).toBe(false);
   });

   it("restores when the server lost the session", () => {
      expect(shouldRestoreCvBackup(backup(), null)).toBe(true);
      expect(shouldRestoreCvBackup(backup(), undefined)).toBe(true);
   });

   it("restores when the server copy is older than this browser's (a reseeded or stale instance)", () => {
      expect(shouldRestoreCvBackup(backup({ revision: 9 }), { markdown: "# cv\n\nStart writing your CV.\n", css: "", revision: 1 })).toBe(true);
   });

   it("restores an unsaved edit made on top of the current revision", () => {
      expect(shouldRestoreCvBackup(backup({ markdown: "# Ada\n\nSaved and edited", pending: true }), server)).toBe(true);
      expect(shouldRestoreCvBackup(backup({ pending: true }), server)).toBe(false);
   });

   it("never overwrites a newer revision saved elsewhere with a pending local edit", () => {
      expect(shouldRestoreCvBackup(backup({ markdown: "local", revision: 3, pending: true }), server)).toBe(false);
   });
});


class MemoryStorage {
   private items = new Map<string, string>();
   get length() { return this.items.size; }
   key(index: number) { return [...this.items.keys()][index] ?? null; }
   getItem(key: string) { return this.items.get(key) ?? null; }
   setItem(key: string, value: string) { this.items.set(key, String(value)); }
   removeItem(key: string) { this.items.delete(key); }
   clear() { this.items.clear(); }
}

const idA = "0b6f3c2e-1d4a-4e8b-9c7d-2a1b3c4d5e6f";
const idB = "9f8e7d6c5b4a39281706f5e4d3c2b1a0";

describe("session backups survive storage loss", () => {
   beforeEach(() => {
      (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
   });

   it("indexes every backed-up session with a title taken from its heading", () => {
      writeCvSessionBackup(idA, { markdown: "# Ada Lovelace {.cv-name}\n\nBody", css: "", revision: 3, pending: false });
      writeCvSessionBackup(idB, { markdown: "# Grace", css: "", revision: 1, pending: true });
      localStorage.setItem("unrelated", "x");
      const entries = listCvSessionBackups();
      expect(entries.map(entry => [entry.id, entry.title, entry.pending])).toEqual(expect.arrayContaining([
         [idA, "Ada Lovelace", false],
         [idB, "Grace", true],
      ]));
      expect(entries).toHaveLength(2);
      expect(readCvSessionBackup(idA)?.savedAt).toBeTypeOf("number");
   });

   it("reads backups written before titles were stored", () => {
      localStorage.setItem(`cv-sv:session-backup:${idA}`, JSON.stringify({ markdown: "# Old", css: "", revision: 2, pending: false }));
      expect(listCvSessionBackups()).toEqual([expect.objectContaining({ id: idA, revision: 2, title: undefined })]);
   });

   it("lists sessions the server lost and marks them for recovery", () => {
      writeCvSessionBackup(idA, { markdown: "# Ada", css: "", revision: 3, pending: false });
      writeCvSessionBackup(idB, { markdown: "# Grace", css: "", revision: 1, pending: false });
      writeCvSessionBackup("master", { markdown: "# Master", css: "", revision: 1, pending: false });
      const server = [{ id: idB, title: "Grace", revision: 5, updatedAt: "2026-10-01T00:00:00.000Z" }];
      const merged = mergeCvSessions(server, listCvSessionBackups());
      expect(merged.map(session => [session.id, "localOnly" in session])).toEqual(expect.arrayContaining([[idA, true], [idB, false]]));
      expect(merged.find(session => session.id === "master")).toBeUndefined();
      expect(cvSessionsToRecover(server, listCvSessionBackups()).map(backup => backup.id)).toEqual([idA]);
   });

   it("lists every backup when the server returns nothing, and forgets deleted sessions", () => {
      writeCvSessionBackup(idA, { markdown: "# Ada", css: "", revision: 3, pending: false });
      expect(mergeCvSessions([], listCvSessionBackups()).map(session => session.id)).toEqual([idA]);
      clearCvSessionBackup(idA);
      expect(mergeCvSessions([], listCvSessionBackups())).toEqual([]);
   });

   it("keeps the unregistered new-session draft until it is cleared", () => {
      expect(readCvNewSessionDraft()).toBeNull();
      writeCvNewSessionDraft({ markdown: "# Draft", css: ".x{}" });
      expect(readCvNewSessionDraft()).toMatchObject({ markdown: "# Draft", css: ".x{}" });
      clearCvNewSessionDraft();
      expect(readCvNewSessionDraft()).toBeNull();
   });
});
