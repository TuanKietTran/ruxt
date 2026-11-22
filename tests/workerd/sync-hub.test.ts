import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions, type MiniflareOptions } from "miniflare";
import { cloudSyncOwnerKey, mintSyncTicket } from "../../infra/crypto/cloud-sync-ticket";
import { COMPATIBILITY_DATE } from "./miniflare";

// The esbuild that wrangler itself bundles Workers with (no extra dependency).
const { build } = createRequire(createRequire(import.meta.url).resolve("wrangler/package.json"))("esbuild") as typeof import("esbuild");
const SECRET = "contract-test-ticket-secret-with-32-plus-characters";
const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url)).replace(/\\/g, "/");
let mf: Miniflare;

/** The same modules the production Worker entry uses, plus a test-only route that calls the notify helper. */
async function bundle(): Promise<string> {
   const result = await build({
      stdin: {
         contents: `
            import { CloudSyncHub } from "${path("../../infra/deploy/cloudflare/sync-hub.ts")}";
            import { handleSyncEvents, notifySyncHub } from "${path("../../infra/deploy/cloudflare/sync-events.ts")}";
            import { verifySyncTicket } from "${path("../../infra/crypto/cloud-sync-ticket.ts")}";
            export { CloudSyncHub };
            export default {
               async fetch(request, env) {
                  const url = new URL(request.url);
                  if (url.pathname === "/api/cloud-data/events") return handleSyncEvents(request, env, verifySyncTicket);
                  if (url.pathname === "/test/notify") {
                     const body = await request.json();
                     await notifySyncHub(env, body.key, body.cursor, body.origin);
                     return new Response("ok");
                  }
                  return new Response("not found", { status: 404 });
               },
            };`,
         resolveDir: path("."),
         loader: "ts",
      },
      bundle: true, format: "esm", platform: "neutral", target: "es2022", write: false,
   });
   return result.outputFiles[0]!.text;
}

beforeAll(async () => {
   mf = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: await bundle(),
      compatibilityDate: COMPATIBILITY_DATE,
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { SYNC_HUB: { className: "CloudSyncHub", useSQLite: true } },
      bindings: { NUXT_SESSION_SECRET: SECRET },
   } as any) as MiniflareOptions);
});
afterAll(async () => { await mf?.dispose(); });

const ticketFor = async (owner: string, device: string, ttlSeconds = 300) =>
   mintSyncTicket(SECRET, { k: await cloudSyncOwnerKey(SECRET, owner), d: device, e: Math.floor(Date.now() / 1000) + ttlSeconds });

async function connect(owner: string, device: string) {
   const response = await mf.dispatchFetch(`http://localhost/api/cloud-data/events?ticket=${encodeURIComponent(await ticketFor(owner, device))}`, {
      headers: { Upgrade: "websocket" },
   });
   expect(response.status).toBe(101);
   const socket = response.webSocket!;
   const messages: string[] = [];
   const closes: number[] = [];
   socket.addEventListener("message", event => messages.push(String(event.data)));
   socket.addEventListener("close", event => closes.push(event.code));
   socket.accept();
   return { socket, messages, closes };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 150));
const notify = async (owner: string, cursor: number, origin: string) => {
   await mf.dispatchFetch("http://localhost/test/notify", { method: "POST", body: JSON.stringify({ key: await cloudSyncOwnerKey(SECRET, owner), cursor, origin }) });
   await settle();
};

describe("cloud sync push hub on workerd", () => {
   it("refuses connections without a valid upgrade and ticket", async () => {
      expect((await mf.dispatchFetch("http://localhost/api/cloud-data/events")).status).toBe(426);
      const upgrade = { headers: { Upgrade: "websocket" } };
      expect((await mf.dispatchFetch("http://localhost/api/cloud-data/events", upgrade)).status).toBe(401);
      expect((await mf.dispatchFetch("http://localhost/api/cloud-data/events?ticket=forged.signature", upgrade)).status).toBe(401);
      const expired = await ticketFor("owner-a", "device-expired", -5);
      expect((await mf.dispatchFetch(`http://localhost/api/cloud-data/events?ticket=${encodeURIComponent(expired)}`, upgrade)).status).toBe(401);
      const tampered = (await ticketFor("owner-a", "device-tampered")).replace(/^./, c => (c === "A" ? "B" : "A"));
      expect((await mf.dispatchFetch(`http://localhost/api/cloud-data/events?ticket=${encodeURIComponent(tampered)}`, upgrade)).status).toBe(401);
   });

   it("notifies the owner's other devices only, with no record content", async () => {
      const laptop = await connect("owner-a", "device-laptop");
      const phone = await connect("owner-a", "device-phone");
      const stranger = await connect("owner-b", "device-stranger");
      await notify("owner-a", 7, "device-laptop");
      expect(phone.messages).toEqual([JSON.stringify({ t: "changed", cursor: 7 })]);
      expect(laptop.messages).toEqual([]);
      expect(stranger.messages).toEqual([]);
      for (const { socket } of [laptop, phone, stranger]) socket.close(1000);
   });

   it("answers heartbeats without application traffic", async () => {
      const device = await connect("owner-c", "device-heartbeat");
      device.socket.send("ping");
      await settle();
      expect(device.messages).toEqual(["pong"]);
      device.socket.close(1000);
   });

   it("replaces a device's previous connection instead of leaking it", async () => {
      const first = await connect("owner-d", "device-reconnect");
      const second = await connect("owner-d", "device-reconnect");
      await settle();
      // The hub closes the replaced socket (code 4000); miniflare's client wrapper does not surface a
      // server-initiated close promptly, so assert the observable effect: it receives nothing more.
      await notify("owner-d", 3, "device-other");
      expect(second.messages).toEqual([JSON.stringify({ t: "changed", cursor: 3 })]);
      expect(first.messages).toEqual([]);
      second.socket.close(1000);
   });

   it('greets a new connection with no hello when the owner has no history', async () => {
      const device = await connect('owner-hello-none', 'device-first');
      await settle();
      expect(device.messages).toEqual([]);
      device.socket.close(1000);
   });

   it('greets a newly connected device with the latest cursor first', async () => {
      await notify('owner-hello', 9, 'device-other');
      const device = await connect('owner-hello', 'device-new');
      await settle();
      expect(device.messages).toEqual([JSON.stringify({ t: 'hello', cursor: 9 })]);
      await notify('owner-hello', 10, 'device-other');
      expect(device.messages).toEqual([
         JSON.stringify({ t: 'hello', cursor: 9 }),
         JSON.stringify({ t: 'changed', cursor: 10 }),
      ]);
      device.socket.close(1000);
   });

   it('never lowers the stored cursor, and raises it on a higher notify', async () => {
      await notify('owner-hello-cursor', 9, 'device-other');
      const first = await connect('owner-hello-cursor', 'device-first');
      await settle();
      expect(first.messages).toEqual([JSON.stringify({ t: 'hello', cursor: 9 })]);
      await notify('owner-hello-cursor', 5, 'device-other');
      const second = await connect('owner-hello-cursor', 'device-second');
      await settle();
      expect(second.messages).toEqual([JSON.stringify({ t: 'hello', cursor: 9 })]);
      await notify('owner-hello-cursor', 12, 'device-other');
      const third = await connect('owner-hello-cursor', 'device-third');
      await settle();
      expect(third.messages).toEqual([JSON.stringify({ t: 'hello', cursor: 12 })]);
      for (const { socket } of [first, second, third]) socket.close(1000);
   });
});
