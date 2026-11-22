/**
 * Cloudflare Worker entry: the Nitro application plus the cloud-sync push hub.
 *
 * `pnpm cf:build` writes the Nitro Worker to .output/server; wrangler bundles this file (see
 * wrangler.json `main`). WebSocket upgrades on /api/cloud-data/events are verified here (signed
 * ticket from the authenticated sync route) and handed to the owner's Durable Object; every other
 * request goes to Nitro unchanged.
 */
// The Nitro output exists only after `pnpm cf:build`; wrangler resolves it at bundle time.
// @ts-ignore -- generated module without declarations
import nitro from "../../../.output/server/index.mjs";
import { verifySyncTicket } from "../../crypto/cloud-sync-ticket";
import { handleSyncEvents, type SyncHubEnv } from "./sync-events";

export { CloudSyncHub } from "./sync-hub";

interface WorkerEnv extends SyncHubEnv { [binding: string]: unknown }
interface NitroWorker { fetch(request: Request, env: WorkerEnv, context: unknown): Promise<Response> }

const app = nitro as NitroWorker & Record<string, unknown>;

export default {
   ...app,
   async fetch(request: Request, env: WorkerEnv, context: unknown): Promise<Response> {
      if (new URL(request.url).pathname === "/api/cloud-data/events") return handleSyncEvents(request, env, verifySyncTicket);
      return app.fetch(request, env, context);
   },
};
