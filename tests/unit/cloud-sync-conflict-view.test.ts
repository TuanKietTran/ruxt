import { describe, expect, it } from "vitest";
import { applyChoices, chooseAll, emptyChoices, reviewConflict, unresolvedCount, type ConflictSides } from "../../app/utils/cloudSync/conflictView";
import { buildSnapshot, parseSnapshotFields } from "../../app/utils/cloudSync/merge";

const session = (title: string, markdown: string, css = ".r{}") => buildSnapshot("session", title, { markdown, css });
const markdownOf = (snapshot: { content: string } | null) => (parseSnapshotFields("session", snapshot!) as { markdown: string }).markdown;

describe("conflict review", () => {
   const base = session("CV", "# Name\n\nSummary one\n\n## Skills\n\n- A\n- B");
   // Both edit the summary line differently (a real conflict); only the cloud edits the skills (clean).
   const local = session("CV", "# Name\n\nSummary from this device\n\n## Skills\n\n- A\n- B");
   const cloud = session("CV", "# Name\n\nSummary from the cloud\n\n## Skills\n\n- A\n- B\n- C");
   const sides: ConflictSides = { base, local, cloud };

   it("cannot compare piece by piece when one side no longer exists", () => {
      expect(reviewConflict("session", { base, local, cloud: null })).toBeNull();
      expect(reviewConflict("session", { base, local: null, cloud })).toBeNull();
   });

   it("keeps non-conflicting changes from both sides and asks only about the pieces both changed", () => {
      const review = reviewConflict("session", sides)!;
      expect(review.merge.conflicts).toBe(1);
      expect(review.merge.snapshot).toBeNull();
      const choices = emptyChoices(review.merge);
      expect(unresolvedCount(review.merge, choices)).toBe(1);
      // Nothing is applied until every conflicting piece has a choice.
      expect(applyChoices("session", sides, review.merge, choices)).toBeNull();

      const markdown = choices.text.markdown!;
      for (const [choice, expected] of [["local", "Summary from this device"], ["cloud", "Summary from the cloud"]] as const) {
         const picked = { ...choices, text: { ...choices.text, markdown: markdown.map(() => choice) } };
         expect(unresolvedCount(review.merge, picked)).toBe(0);
         const merged = markdownOf(applyChoices("session", sides, review.merge, picked));
         expect(merged).toContain(expected);
         expect(merged).toContain("- C");
      }
      const both = markdownOf(applyChoices("session", sides, review.merge, { ...choices, text: { ...choices.text, markdown: markdown.map(() => "both" as const) } }));
      expect(both).toContain("Summary from this device");
      expect(both).toContain("Summary from the cloud");
   });

   it("merges cleanly with no choices when the two sides changed different places", () => {
      const cleanCloud = session("CV", "# Name\n\nSummary one\n\n## Skills\n\n- A\n- B\n- C");
      const review = reviewConflict("session", { base, local: session("CV", "# Name\n\nA better summary\n\n## Skills\n\n- A\n- B"), cloud: cleanCloud })!;
      expect(review.merge.conflicts).toBe(0);
      expect(markdownOf(review.merge.snapshot)).toBe("# Name\n\nA better summary\n\n## Skills\n\n- A\n- B\n- C");
   });

   it("asks which title to keep when both sides renamed it", () => {
      const renamedLocal = session("Mine", "# Name");
      const renamedCloud = session("Theirs", "# Name");
      const review = reviewConflict("session", { base: session("CV", "# Name"), local: renamedLocal, cloud: renamedCloud })!;
      expect(review.merge.title.conflict).toBe(true);
      const choices = emptyChoices(review.merge);
      expect(unresolvedCount(review.merge, choices)).toBe(1);
      expect(applyChoices("session", { base: null, local: renamedLocal, cloud: renamedCloud }, review.merge, { ...choices, title: "cloud" })!.title).toBe("Theirs");
      expect(applyChoices("session", { base: null, local: renamedLocal, cloud: renamedCloud }, review.merge, { ...choices, title: "local" })!.title).toBe("Mine");
   });

   it("treats every difference as a conflict when there is no common ancestor, and the shortcuts resolve them all", () => {
      const noBase: ConflictSides = { base: null, local, cloud };
      const review = reviewConflict("session", noBase)!;
      expect(review.merge.conflicts).toBeGreaterThan(0);
      for (const side of ["local", "cloud", "both"] as const) {
         const choices = chooseAll(review.merge, side);
         expect(unresolvedCount(review.merge, choices)).toBe(0);
         expect(applyChoices("session", noBase, review.merge, choices)).not.toBeNull();
      }
      expect(markdownOf(applyChoices("session", noBase, review.merge, chooseAll(review.merge, "local")))).toBe("# Name\n\nSummary from this device\n\n## Skills\n\n- A\n- B");
   });

   it("resolves structured fields of a template per field", () => {
      const tpl = (name: string, tags: string[]) => buildSnapshot("template", name, { markdownSkeleton: "# X", css: "a{}", capabilities: { pageFormats: ["A4"] }, tags });
      const sidesT: ConflictSides = { base: tpl("T", ["local"]), local: tpl("T", ["local", "mine"]), cloud: tpl("T", ["local", "theirs"]) };
      const review = reviewConflict("template", sidesT)!;
      const choices = emptyChoices(review.merge);
      expect(Object.keys(choices.json)).toEqual(["tags"]);
      expect(unresolvedCount(review.merge, choices)).toBe(1);
      const mine = applyChoices("template", sidesT, review.merge, { ...choices, json: { tags: "local" } })!;
      const theirs = applyChoices("template", sidesT, review.merge, { ...choices, json: { tags: "cloud" } })!;
      expect((parseSnapshotFields("template", mine) as { tags: string[] }).tags).toEqual(["local", "mine"]);
      expect((parseSnapshotFields("template", theirs) as { tags: string[] }).tags).toEqual(["local", "theirs"]);
   });
});
