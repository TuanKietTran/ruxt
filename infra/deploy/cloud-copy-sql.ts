import type {
   CloudCopy, CloudCopyCheckpoint, CloudCopyKind, CloudCopyMutation, CloudCopyOwnerState, CloudCopyTombstone,
} from "@ruxt/core/domain/cloud-copy";

/**
 * SQL shared by the D1 and SQLite cloud-copy adapters. Core owns every policy decision; this module
 * only maps an owner's state to rows and plans the row changes between two committed states.
 *
 * Atomicity: each owner has a `cloud_copy_owners` row whose `version` is compared-and-swapped as the
 * first statement of the write batch. A stale writer sets the version to -1, which violates the
 * CHECK constraint and aborts the whole batch, so the transaction is retried from a fresh load.
 */

export const CLOUD_COPY_SCHEMA: readonly string[] = [
   "CREATE TABLE IF NOT EXISTS cloud_retention_acknowledgements (owner_id TEXT PRIMARY KEY NOT NULL, policy_version TEXT NOT NULL, acknowledged_at TEXT NOT NULL)",
   "CREATE TABLE IF NOT EXISTS cloud_copy_owners (owner_id TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL CHECK (version >= 0), change_seq INTEGER NOT NULL DEFAULT 0, tombstone_floor INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)",
   "CREATE TABLE IF NOT EXISTS cloud_copies (owner_id TEXT NOT NULL, kind TEXT NOT NULL, client_item_id TEXT NOT NULL, id TEXT NOT NULL, head_revision INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL, extended_expires_at TEXT, change_seq INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (owner_id, kind, client_item_id))",
   "CREATE INDEX IF NOT EXISTS idx_cloud_copies_owner_seq ON cloud_copies (owner_id, change_seq)",
   "CREATE TABLE IF NOT EXISTS cloud_copy_checkpoints (owner_id TEXT NOT NULL, kind TEXT NOT NULL, client_item_id TEXT NOT NULL, day TEXT NOT NULL, revision INTEGER NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, changed_at TEXT NOT NULL, PRIMARY KEY (owner_id, kind, client_item_id, day, revision))",
   "CREATE TABLE IF NOT EXISTS cloud_copy_mutations (owner_id TEXT NOT NULL, mutation_id TEXT NOT NULL, request_digest TEXT NOT NULL, operation TEXT NOT NULL, kind TEXT NOT NULL, client_item_id TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT, expires_at TEXT, recorded_at TEXT, PRIMARY KEY (owner_id, mutation_id))",
   "CREATE TABLE IF NOT EXISTS cloud_copy_tombstones (owner_id TEXT NOT NULL, kind TEXT NOT NULL, client_item_id TEXT NOT NULL, revision INTEGER NOT NULL, removed_at TEXT NOT NULL, change_seq INTEGER NOT NULL, reason TEXT NOT NULL, PRIMARY KEY (owner_id, kind, client_item_id))",
];

export interface SqlStatement {
   sql: string;
   params: Array<string | number | null>;
}

const stmt = (sql: string, ...params: Array<string | number | null | undefined>): SqlStatement =>
   ({ sql, params: params.map(value => value === undefined ? null : value) });

/** Reads for one owner, in the order {@link rowsToCloudCopyState} expects. */
export function loadCloudCopyStatements(ownerId: string): SqlStatement[] {
   return [
      stmt("SELECT version, change_seq, tombstone_floor FROM cloud_copy_owners WHERE owner_id = ?", ownerId),
      stmt("SELECT * FROM cloud_copies WHERE owner_id = ? ORDER BY change_seq, kind, client_item_id", ownerId),
      stmt("SELECT * FROM cloud_copy_checkpoints WHERE owner_id = ? ORDER BY changed_at DESC, revision DESC", ownerId),
      stmt("SELECT * FROM cloud_copy_mutations WHERE owner_id = ? ORDER BY recorded_at, mutation_id", ownerId),
      stmt("SELECT * FROM cloud_copy_tombstones WHERE owner_id = ? ORDER BY change_seq", ownerId),
   ];
}

export const SYNC_HEAD_SQL = "SELECT o.change_seq AS change_seq, (SELECT MIN(c.updated_at) FROM cloud_copies c WHERE c.owner_id = o.owner_id) AS oldest FROM cloud_copy_owners o WHERE o.owner_id = ?";
export const QUOTA_SQL = "SELECT kind FROM cloud_copies WHERE owner_id = ?";

type Row = Record<string, any>;
const key = (kind: string, clientItemId: string) => JSON.stringify([kind, clientItemId]);

export interface LoadedCloudCopyState {
   state: CloudCopyOwnerState;
   /** 0 when the owner has no row yet. */
   version: number;
}

export function rowsToCloudCopyState(ownerId: string, rows: [Row[], Row[], Row[], Row[], Row[]]): LoadedCloudCopyState {
   const [owners, copyRows, checkpointRows, mutationRows, tombstoneRows] = rows;
   const owner = owners[0];
   if (!owner) return { version: 0, state: { ownerId: null, copies: [], mutations: [], changeSeq: 0, tombstones: [], tombstoneFloor: 0 } };
   const checkpoints = new Map<string, CloudCopyCheckpoint[]>();
   for (const row of checkpointRows) {
      const list = checkpoints.get(key(row.kind, row.client_item_id)) ?? [];
      list.push({ day: row.day, revision: Number(row.revision), snapshot: { title: row.title, content: row.content }, changedAt: row.changed_at });
      checkpoints.set(key(row.kind, row.client_item_id), list);
   }
   const copies: CloudCopy[] = copyRows.map(row => ({
      id: row.id, ownerId, kind: row.kind as CloudCopyKind, clientItemId: row.client_item_id,
      headRevision: Number(row.head_revision), snapshot: { title: row.title, content: row.content },
      updatedAt: row.updated_at, checkpoints: checkpoints.get(key(row.kind, row.client_item_id)) ?? [],
      ...(row.extended_expires_at ? { extendedExpiresAt: row.extended_expires_at } : {}),
      changeSeq: Number(row.change_seq),
   }));
   const mutations: CloudCopyMutation[] = mutationRows.map(row => ({
      ownerId, mutationId: row.mutation_id, requestDigest: row.request_digest, operation: row.operation,
      kind: row.kind, clientItemId: row.client_item_id, revision: Number(row.revision),
      ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
      ...(row.expires_at ? { expiresAt: row.expires_at } : {}),
      ...(row.recorded_at ? { recordedAt: row.recorded_at } : {}),
   }));
   const tombstones: CloudCopyTombstone[] = tombstoneRows.map(row => ({
      kind: row.kind, clientItemId: row.client_item_id, revision: Number(row.revision),
      removedAt: row.removed_at, changeSeq: Number(row.change_seq), reason: row.reason,
   }));
   return {
      version: Number(owner.version),
      state: {
         ownerId, copies, mutations, tombstones,
         changeSeq: Number(owner.change_seq), tombstoneFloor: Number(owner.tombstone_floor),
      },
   };
}

const checkpointKey = (checkpoint: CloudCopyCheckpoint) => `${checkpoint.day}\u0000${checkpoint.revision}\u0000${checkpoint.changedAt}`;
const copyChanged = (left: CloudCopy, right: CloudCopy) => left.id !== right.id || left.headRevision !== right.headRevision
   || left.updatedAt !== right.updatedAt || (left.extendedExpiresAt ?? null) !== (right.extendedExpiresAt ?? null)
   || (left.changeSeq ?? 0) !== (right.changeSeq ?? 0)
   || left.snapshot.title !== right.snapshot.title || left.snapshot.content !== right.snapshot.content;

/** Row changes that turn `previous` into `next`, led by the owner compare-and-swap. */
export function planCloudCopyWrites(
   ownerId: string,
   version: number,
   previous: CloudCopyOwnerState,
   next: CloudCopyOwnerState,
   now: string,
): SqlStatement[] {
   const statements: SqlStatement[] = [];
   const changeSeq = next.changeSeq ?? 0;
   const floor = next.tombstoneFloor ?? 0;
   statements.push(version === 0
      ? stmt("INSERT INTO cloud_copy_owners (owner_id, version, change_seq, tombstone_floor, updated_at) VALUES (?, 1, ?, ?, ?)", ownerId, changeSeq, floor, now)
      : stmt("UPDATE cloud_copy_owners SET version = CASE WHEN version = ? THEN ? ELSE -1 END, change_seq = ?, tombstone_floor = ?, updated_at = ? WHERE owner_id = ?",
         version, version + 1, changeSeq, floor, now, ownerId));

   const before = new Map(previous.copies.map(copy => [key(copy.kind, copy.clientItemId), copy]));
   const after = new Map(next.copies.map(copy => [key(copy.kind, copy.clientItemId), copy]));
   for (const [identity, copy] of after) {
      if (copy.ownerId !== ownerId) throw new Error("Cloud-copy owner state mismatch");
      const prior = before.get(identity);
      if (!prior || copyChanged(prior, copy)) {
         statements.push(stmt(
            "INSERT INTO cloud_copies (owner_id, kind, client_item_id, id, head_revision, title, content, updated_at, extended_expires_at, change_seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) "
            + "ON CONFLICT (owner_id, kind, client_item_id) DO UPDATE SET id = excluded.id, head_revision = excluded.head_revision, title = excluded.title, content = excluded.content, updated_at = excluded.updated_at, extended_expires_at = excluded.extended_expires_at, change_seq = excluded.change_seq",
            ownerId, copy.kind, copy.clientItemId, copy.id, copy.headRevision, copy.snapshot.title, copy.snapshot.content,
            copy.updatedAt, copy.extendedExpiresAt ?? null, copy.changeSeq ?? 0,
         ));
      }
      const priorCheckpoints = new Map((prior?.checkpoints ?? []).map(item => [checkpointKey(item), item]));
      const nextCheckpoints = new Map(copy.checkpoints.map(item => [checkpointKey(item), item]));
      for (const [id, checkpoint] of nextCheckpoints) {
         if (priorCheckpoints.has(id)) continue;
         statements.push(stmt(
            "INSERT OR REPLACE INTO cloud_copy_checkpoints (owner_id, kind, client_item_id, day, revision, title, content, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            ownerId, copy.kind, copy.clientItemId, checkpoint.day, checkpoint.revision, checkpoint.snapshot.title, checkpoint.snapshot.content, checkpoint.changedAt,
         ));
      }
      for (const [id, checkpoint] of priorCheckpoints) {
         if (nextCheckpoints.has(id)) continue;
         statements.push(stmt(
            "DELETE FROM cloud_copy_checkpoints WHERE owner_id = ? AND kind = ? AND client_item_id = ? AND day = ? AND revision = ?",
            ownerId, copy.kind, copy.clientItemId, checkpoint.day, checkpoint.revision,
         ));
      }
   }
   for (const [identity, copy] of before) {
      if (after.has(identity)) continue;
      statements.push(stmt("DELETE FROM cloud_copies WHERE owner_id = ? AND kind = ? AND client_item_id = ?", ownerId, copy.kind, copy.clientItemId));
      statements.push(stmt("DELETE FROM cloud_copy_checkpoints WHERE owner_id = ? AND kind = ? AND client_item_id = ?", ownerId, copy.kind, copy.clientItemId));
   }

   const priorMutations = new Set(previous.mutations.map(item => item.mutationId));
   const nextMutations = new Set(next.mutations.map(item => item.mutationId));
   for (const mutation of next.mutations) {
      if (mutation.ownerId !== ownerId) throw new Error("Cloud-copy owner state mismatch");
      if (priorMutations.has(mutation.mutationId)) continue;
      statements.push(stmt(
         "INSERT INTO cloud_copy_mutations (owner_id, mutation_id, request_digest, operation, kind, client_item_id, revision, updated_at, expires_at, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
         ownerId, mutation.mutationId, mutation.requestDigest, mutation.operation, mutation.kind, mutation.clientItemId,
         mutation.revision, mutation.updatedAt ?? null, mutation.expiresAt ?? null, mutation.recordedAt ?? null,
      ));
   }
   const pruned = [...priorMutations].filter(id => !nextMutations.has(id));
   for (let index = 0; index < pruned.length; index += 90) {
      const chunk = pruned.slice(index, index + 90);
      statements.push(stmt(`DELETE FROM cloud_copy_mutations WHERE owner_id = ? AND mutation_id IN (${chunk.map(() => "?").join(", ")})`, ownerId, ...chunk));
   }

   const priorMarkers = new Map((previous.tombstones ?? []).map(item => [key(item.kind, item.clientItemId), item]));
   const nextMarkers = new Map((next.tombstones ?? []).map(item => [key(item.kind, item.clientItemId), item]));
   for (const [identity, marker] of nextMarkers) {
      const prior = priorMarkers.get(identity);
      if (prior && prior.changeSeq === marker.changeSeq && prior.revision === marker.revision && prior.reason === marker.reason && prior.removedAt === marker.removedAt) continue;
      statements.push(stmt(
         "INSERT OR REPLACE INTO cloud_copy_tombstones (owner_id, kind, client_item_id, revision, removed_at, change_seq, reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
         ownerId, marker.kind, marker.clientItemId, marker.revision, marker.removedAt, marker.changeSeq, marker.reason,
      ));
   }
   for (const [identity, marker] of priorMarkers) {
      if (nextMarkers.has(identity)) continue;
      statements.push(stmt("DELETE FROM cloud_copy_tombstones WHERE owner_id = ? AND kind = ? AND client_item_id = ?", ownerId, marker.kind, marker.clientItemId));
   }
   return statements;
}

/** True for constraint failures caused by a concurrent owner commit (retry from a fresh load). */
export function isOwnerContention(error: unknown): boolean {
   const message = error instanceof Error ? `${error.message} ${(error as any).cause?.message ?? ""}` : String(error);
   return /constraint/i.test(message);
}
