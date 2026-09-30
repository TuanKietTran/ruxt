import { describe, expect, it } from "vitest";
import { shouldRestoreCvBackup } from "../../app/composables/useCvDocument";

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
