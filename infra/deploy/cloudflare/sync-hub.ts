/**
 * Per-owner push hub for cloud sync: one Durable Object instance per opaque owner key, holding the
 * owner's device WebSockets through the hibernation API. An idle connection costs no Worker or DO
 * CPU: the runtime answers "ping" with "pong" without waking the object, and the object is evicted
 * from memory between notifications.
 *
 * Messages are compact invalidations ({"t":"changed","cursor":n}) and never contain record content.
 * The device that made a change is skipped. Devices fetch actual data through the authenticated sync
 * route, so push is an optimization and never the source of truth.
 */

interface HubSocket {
   send(message: string): void;
   close(code?: number, reason?: string): void;
   serializeAttachment(value: unknown): void;
   deserializeAttachment(): unknown;
}

interface HubState {
   storage: { get<T>(key: string): Promise<T | undefined>; put(key: string, value: unknown): Promise<void> };
   acceptWebSocket(socket: HubSocket, tags?: string[]): void;
   getWebSockets(tag?: string): HubSocket[];
   getTags(socket: HubSocket): string[];
   setWebSocketAutoResponse(pair: unknown): void;
}

declare const WebSocketPair: { new(): { 0: HubSocket; 1: HubSocket } };
declare const WebSocketRequestResponsePair: { new(request: string, response: string): unknown };

/** Sockets per owner across all devices; the oldest is closed beyond this. */
export const SYNC_HUB_MAX_SOCKETS = 20;

interface Attachment { device: string; connectedAt: number }

export class CloudSyncHub {
   constructor(private readonly state: HubState, _env: unknown) {
      // Heartbeats are answered by the runtime without waking (or billing) the hibernated object.
      state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
   }

   async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/connect") return this.connect(request, url);
      if (url.pathname === "/notify" && request.method === "POST") return this.notify(request);
      return new Response("Not found", { status: 404 });
   }

   private async connect(request: Request, url: URL): Promise<Response> {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
      const device = url.searchParams.get("device") ?? "";
      if (!device) return new Response("Device required", { status: 400 });
      // One connection per device: a reconnect replaces the previous socket instead of leaking it.
      for (const socket of this.state.getWebSockets(device)) {
         try { socket.close(4000, "Replaced by a newer connection"); } catch { /* already closed */ }
      }
      const open = this.state.getWebSockets()
         .map(socket => ({ socket, at: (socket.deserializeAttachment() as Attachment | null)?.connectedAt ?? 0 }))
         .sort((a, b) => a.at - b.at);
      for (const { socket } of open.slice(0, Math.max(0, open.length - SYNC_HUB_MAX_SOCKETS + 1))) {
         try { socket.close(4001, "Too many connections"); } catch { /* already closed */ }
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server, [device]);
      server.serializeAttachment({ device, connectedAt: Date.now() } satisfies Attachment);
      // Greet a reconnecting device with the newest cursor announced so far, so it only pulls
      // data when it actually missed a change; no history means no hello.
      const stored = await this.state.storage.get<number>('cursor');
      if (typeof stored === 'number') server.send(JSON.stringify({ t: 'hello', cursor: stored }));
      return new Response(null, { status: 101, webSocket: client } as ResponseInit);
   }

   private async notify(request: Request): Promise<Response> {
      const body = await request.json().catch(() => null) as { cursor?: unknown; origin?: unknown } | null;
      const cursor = Number(body?.cursor);
      if (!Number.isSafeInteger(cursor) || cursor < 0) return new Response("Invalid cursor", { status: 400 });
      // Remember only the newest cursor, so a reconnecting device is greeted with it.
      const stored = await this.state.storage.get<number>('cursor');
      if (typeof stored !== 'number' || stored < cursor) await this.state.storage.put('cursor', cursor);
      const origin = typeof body?.origin === "string" ? body.origin : "";
      const message = JSON.stringify({ t: "changed", cursor });
      let sent = 0;
      for (const socket of this.state.getWebSockets()) {
         if (origin && this.state.getTags(socket).includes(origin)) continue;
         try { socket.send(message); sent += 1; } catch { /* closing */ }
      }
      return Response.json({ sent });
   }

   // Devices only send "ping", which the auto-response answers; anything else is ignored.
   webSocketMessage(): void {}

   webSocketClose(socket: HubSocket, code: number, reason: string): void {
      try { socket.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch { /* already closed */ }
   }

   webSocketError(): void {}
}
