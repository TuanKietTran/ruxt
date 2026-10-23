import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

describe("architecture lint", () => {
   it("enforces the Document Map and tracked-artifact boundaries on the repository", () => {
      const result = spawnSync(process.execPath, ["scripts/lint-architecture.mjs"], {
         cwd: root,
         encoding: "utf8",
      });
      expect(result.status, result.stderr || result.stdout).toBe(0);
      expect(result.stdout).toContain("Architecture lint passed");
   });
});
