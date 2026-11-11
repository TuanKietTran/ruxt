/**
 * Delta sync for chunk-manifest snapshots: the per-key entries both chunked KV
 * drivers store (`generation` / `chunks` / `bytes`, plus the Cloudflare driver's
 * optional scalar `meta`). `diffManifests` computes the smallest upsert/remove
 * set that turns one snapshot into another, so a sync only ships changed keys;
 * `applyManifestDelta` applies such a delta without mutating either input.
 * Round-trip invariant: `applyManifestDelta(before, diffManifests(before, after))`
 * deep-equals `after`. Pure: no storage, DOM or runtime imports.
 */
export interface ManifestEntry {
   generation: string;
   chunks: number;
   bytes: number;
   meta?: Record<string, unknown>;
}

export type ManifestSnapshot = Record<string, ManifestEntry>;

export interface ManifestDelta {
   upsert: Record<string, ManifestEntry>;
   remove: string[];
}

const cloneValue = (value: unknown): unknown => {
   if (Array.isArray(value)) return value.map(cloneValue);
   if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
   }
   return value;
};

const cloneEntry = (entry: ManifestEntry): ManifestEntry => ({
   generation: entry.generation,
   chunks: entry.chunks,
   bytes: entry.bytes,
   ...(entry.meta ? { meta: cloneValue(entry.meta) as Record<string, unknown> } : {}),
});

const valuesEqual = (a: unknown, b: unknown): boolean => {
   if (Object.is(a, b)) return true;
   if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b)
         && a.length === b.length
         && a.every((item, index) => valuesEqual(item, b[index]));
   }
   if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
      const aEntries = Object.entries(a as Record<string, unknown>);
      const bRecord = b as Record<string, unknown>;
      return aEntries.length === Object.keys(bRecord).length
         && aEntries.every(([key, item]) => key in bRecord && valuesEqual(item, bRecord[key]));
   }
   return false;
};

const entriesEqual = (a: ManifestEntry, b: ManifestEntry) =>
   a.generation === b.generation && a.chunks === b.chunks && a.bytes === b.bytes && valuesEqual(a.meta, b.meta);

export function diffManifests(before: ManifestSnapshot, after: ManifestSnapshot): ManifestDelta {
   const upsert: Record<string, ManifestEntry> = {};
   for (const key of Object.keys(after).sort()) {
      const previous = before[key];
      if (!previous || !entriesEqual(previous, after[key]!)) upsert[key] = cloneEntry(after[key]!);
   }
   const remove = Object.keys(before).filter((key) => !(key in after)).sort();
   return { upsert, remove };
}

export function applyManifestDelta(before: ManifestSnapshot, delta: ManifestDelta): ManifestSnapshot {
   const removed = new Set(delta.remove);
   const result: ManifestSnapshot = {};
   for (const key of Object.keys(before)) {
      if (!removed.has(key)) result[key] = cloneEntry(before[key]!);
   }
   for (const key of Object.keys(delta.upsert)) result[key] = cloneEntry(delta.upsert[key]!);
   return result;
}

export function isEmptyManifestDelta(delta: ManifestDelta): boolean {
   return delta.remove.length === 0 && Object.keys(delta.upsert).length === 0;
}
