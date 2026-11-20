import { afterAll, beforeAll, beforeEach } from "vitest";
import { D1CloudCopyRepo } from "../../infra/deploy/cloudflare/cloud-copy-repo-d1";
import { cloudCopyRepositoryContract } from "../helpers/cloud-copy-contract";
import { createBindings, migrationStatements } from "./miniflare";

let mf: ReturnType<typeof createBindings>;
let db: Awaited<ReturnType<ReturnType<typeof createBindings>["getD1Database"]>>;
const tables = ["cloud_copy_owners", "cloud_copies", "cloud_copy_checkpoints", "cloud_copy_mutations", "cloud_copy_tombstones"];

beforeAll(async () => {
   mf = createBindings();
   db = await mf.getD1Database("RUXT_DB");
   await db.batch(migrationStatements().map(sql => db.prepare(sql)));
});
afterAll(async () => { await mf.dispose(); });
beforeEach(async () => { await db.batch(tables.map(table => db.prepare(`DELETE FROM ${table}`))); });

// Real workerd D1: the owner compare-and-swap must abort concurrent batches and retry from a fresh load.
cloudCopyRepositoryContract("Cloudflare D1 (workerd)", () => new D1CloudCopyRepo(() => db as any));
