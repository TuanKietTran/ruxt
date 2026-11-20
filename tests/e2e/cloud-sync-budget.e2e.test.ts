import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SimClock, SimDevice, SimServer } from "../helpers/cloud-sync-sim";
import type { DeviceTransport } from "../helpers/cloud-sync-sim";
import type { RecordKey } from "../../app/utils/cloudSync/contracts";
import { SyncHttpError, type SyncRequestDto, type SyncResponseDto } from "../../app/utils/cloudSync/types";

/**
 * The real client engine against a REAL running server (E2E_BASE_URL): real HTTP, real session cookie
 * authentication, real persistence. Client time is simulated so hour-long scenarios run in seconds; the
 * server sees real requests. Push is used when the server returns a ticket (Cloudflare runtime), otherwise
 * the engine falls back to timed reconciliation (node runtime). Writes SYNC_E2E_REPORT when set.
 */
const BASE = process.env.E2E_BASE_URL ?? "";
const HOUR = 3_600_000;
const results: Record<string, unknown> = { base: BASE };

async function signIn(): Promise<{ cookie: string; ownerId: string }> {
   const email = `budget-${Math.random().toString(36).slice(2, 10)}@example.test`;
   const password = `Budget-${Math.random().toString(36).slice(2)}-Aa1!`;
   await fetch(`${BASE}/api/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
   const login = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
   const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0]!;
   if (!cookie.startsWith("auth_session=")) throw new Error(`login failed: ${login.status}`);
   const me = await (await fetch(`${BASE}/api/auth/me`, { headers: { cookie } })).json() as { id: string };
   const call = (path: string, init: RequestInit = {}) => fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } });
   await call("/api/cloud-data/retention-acknowledgement", { method: "POST" });
   for (const category of ["cloudSessions", "cloudTemplates", "cloudProfiles"]) {
      await call("/api/cloud-data/consent", { method: "PUT", body: JSON.stringify({ category, granted: true }) });
   }
   return { cookie, ownerId: me.id };
}

function httpTransport(cookie: string): DeviceTransport & { requests: number } {
   const transport = {
      requests: 0,
      origin: BASE,
      async sync(body: SyncRequestDto): Promise<SyncResponseDto> {
         transport.requests += 1;
         const response = await fetch(`${BASE}/api/cloud-data/sync`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify(body) });
         if (!response.ok) throw new SyncHttpError(response.status, await response.text());
         return response.json() as Promise<SyncResponseDto>;
      },
      async history(kind: string, id: string) {
         const response = await fetch(`${BASE}/api/cloud-data/copies/${kind}/${encodeURIComponent(id)}`, { headers: { cookie } });
         if (!response.ok) throw new SyncHttpError(response.status, await response.text());
         return response.json();
      },
      createSocket: (url: string) => new WebSocket(url) as any,
   };
   return transport;
}

describe.skipIf(!BASE)("request budget against a running server", () => {
   it("measures the scenarios", async () => {
      const clock = new SimClock();
      const local = new SimServer(clock); // only provides the clock and the in-process fallback; never used for requests here
      const { cookie, ownerId } = await signIn();
      const transports = [httpTransport(cookie), httpTransport(cookie), httpTransport(cookie)];
      const devices = transports.map((transport, index) => {
         const device = new SimDevice(local, ownerId, `real-${index}`);
         device.transportOverride = transport;
         return device;
      });
      const settle = async (ms: number) => { await clock.advance(ms); await new Promise(resolve => setTimeout(resolve, 300)); await clock.advance(0); };
      for (const device of devices) await device.openTab();
      await settle(2_000);
      results.initialRequestsPerDevice = transports.map(transport => transport.requests);
      const pushAvailable = devices[0]!.leader!.view?.push === "connected";
      results.push = devices[0]!.leader!.view?.push;

      const keys: RecordKey[] = [];
      for (let index = 0; index < 10; index += 1) { devices[0]!.editSession(`r${index}`, `content ${index}`); keys.push(`session:r${index}` as RecordKey); }
      await devices[0]!.leader!.upload(keys);
      for (const device of devices.slice(1)) await device.leader!.download(keys);
      await settle(5_000);

      const count = () => transports.reduce((sum, transport) => sum + transport.requests, 0);
      let before = count();
      await settle(HOUR);
      results.idleHourAllDevices = count() - before;

      before = count();
      const uploaderBefore = transports[0]!.requests;
      for (let index = 0; index < 20; index += 1) { devices[0]!.editSession(`r${index % 10}`, `rapid ${index}`); await settle(200); }
      await settle(60_000);
      results.rapid20EditsUploader = transports[0]!.requests - uploaderBefore;
      if (!pushAvailable) { await settle(HOUR); }
      results.rapid20EditsAllDevicesUntilConverged = count() - before;
      const converged = devices.every(device => (device.readSession("r9") as any)?.markdown === "rapid 19");
      results.converged = converged;

      before = count();
      devices[1]!.online = false;
      for (let hour = 0; hour < 24; hour += 1) { devices[1]!.editSession(`r${hour % 3}`, `offline ${hour}`); await settle(HOUR); }
      const offlineDevice = transports[1]!.requests;
      devices[1]!.online = true;
      devices[1]!.leader!.onOnline();
      await settle(30_000);
      results.offline24hReconnectRequests = transports[1]!.requests - offlineDevice;
      results.totalRequests = count();

      if (process.env.SYNC_E2E_REPORT) writeFileSync(process.env.SYNC_E2E_REPORT, JSON.stringify(results, null, 2));
      console.log(JSON.stringify(results, null, 2));
      expect(results.rapid20EditsUploader).toBe(1);
      expect(converged || !pushAvailable).toBe(true);
      expect(results.offline24hReconnectRequests).toBe(1);
      for (const device of devices) for (const tab of [...device.tabs]) tab.close();
   }, 300_000);
});
