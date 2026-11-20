import { createRequire } from "node:module";
import { resolve } from "node:path";
import { afterAll } from "vitest";
import { SqliteCloudCopyRepo } from "../../infra/deploy/onprem/cloud-copy-repo-sqlite";
import { CLOUD_COPY_SCHEMA } from "../../infra/deploy/cloud-copy-sql";
import { cloudCopyRepositoryContract } from "../helpers/cloud-copy-contract";

const Database = createRequire(resolve(process.cwd(), "infra/package.json"))("better-sqlite3");
const open: any[] = [];
afterAll(() => { for (const db of open) db.close(); });

cloudCopyRepositoryContract("SQLite", () => {
   const db = new Database(":memory:");
   open.push(db);
   for (const statement of CLOUD_COPY_SCHEMA) db.exec(statement);
   return new SqliteCloudCopyRepo(() => db);
});
