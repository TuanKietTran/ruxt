import type { SyncKind, SyncSnapshot } from "./types";
import { buildSnapshot, mergeSnapshots, parseSnapshotFields, renderMerge, type SnapshotMerge } from "./merge";

/**
 * The state behind the conflict review: what the merge found, and which side the user chose for every
 * conflicting piece. Pure, so the same rules apply wherever it is rendered and every branch is testable.
 */
export type Side = "local" | "cloud";
export type HunkChoice = Side | "both";

export interface ConflictSides {
   local: SyncSnapshot | null;
   cloud: SyncSnapshot | null;
   base: SyncSnapshot | null;
}

export interface ConflictChoices {
   title: Side | null;
   /** One entry per conflicting hunk of each text field, in order; null until the user chooses. */
   text: Record<string, Array<HunkChoice | null>>;
   /** One entry per field of structured data that both sides changed. */
   json: Record<string, Side | null>;
}

export interface ConflictReview {
   merge: SnapshotMerge;
   /** Both sides exist and can be compared piece by piece. */
   comparable: boolean;
}

/** Compare the three versions. A side that no longer exists cannot be merged, only kept or dropped. */
export function reviewConflict(kind: SyncKind, sides: ConflictSides): ConflictReview | null {
   if (!sides.local || !sides.cloud) return null;
   return { merge: mergeSnapshots(kind, sides.base, sides.local, sides.cloud), comparable: true };
}

/** Nothing is chosen for the user: every conflicting piece starts unresolved. */
export function emptyChoices(merge: SnapshotMerge): ConflictChoices {
   const text: ConflictChoices["text"] = {};
   for (const entry of merge.text) {
      text[entry.field] = entry.result.hunks.filter(hunk => hunk.kind === "conflict").map(() => null);
   }
   const json: ConflictChoices["json"] = {};
   for (const entry of merge.json) if (entry.conflicts.length) json[entry.field] = null;
   return { title: merge.title.conflict ? null : "local", text, json };
}

/** How many conflicting pieces still need a choice. */
export function unresolvedCount(merge: SnapshotMerge, choices: ConflictChoices): number {
   let count = merge.title.conflict && !choices.title ? 1 : 0;
   for (const entry of merge.text) count += (choices.text[entry.field] ?? []).filter(choice => choice === null).length;
   for (const field of Object.keys(choices.json)) if (!choices.json[field]) count += 1;
   return count;
}

/**
 * The merged version for the chosen sides, or null while anything is unresolved. Unconflicted changes
 * from both sides are always kept; only the pieces both sides changed differently follow the choices.
 */
export function applyChoices(kind: SyncKind, sides: ConflictSides, merge: SnapshotMerge, choices: ConflictChoices): SyncSnapshot | null {
   if (!sides.local || !sides.cloud || unresolvedCount(merge, choices) > 0) return null;
   const title = merge.title.conflict ? (choices.title === "cloud" ? merge.title.cloud : merge.title.local) : merge.title.value;
   const localFields = parseSnapshotFields(kind, sides.local) ?? {};
   const cloudFields = parseSnapshotFields(kind, sides.cloud) ?? {};
   const fields: Record<string, unknown> = {};
   for (const entry of merge.text) {
      fields[entry.field] = renderMerge(entry.result.hunks, (choices.text[entry.field] ?? []).map(choice => choice ?? "local"));
   }
   for (const entry of merge.json) {
      if (!entry.conflicts.length) { fields[entry.field] = entry.merged; continue; }
      fields[entry.field] = (choices.json[entry.field] === "cloud" ? cloudFields : localFields)[entry.field];
   }
   return buildSnapshot(kind, title, fields);
}

/** Resolve every conflicting piece the same way (for the "take all of mine / all of theirs" shortcuts). */
export function chooseAll(merge: SnapshotMerge, side: Side | "both"): ConflictChoices {
   const base = emptyChoices(merge);
   const text: ConflictChoices["text"] = {};
   for (const [field, list] of Object.entries(base.text)) text[field] = list.map(() => side);
   const json: ConflictChoices["json"] = {};
   for (const field of Object.keys(base.json)) json[field] = side === "both" ? "local" : side;
   return { title: side === "cloud" ? "cloud" : "local", text, json };
}
