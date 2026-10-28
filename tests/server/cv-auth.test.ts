import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCvMcpServer } from "../../server/utils/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

beforeEach(() => {
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    vi.stubGlobal("getRequestURL", (event: { path: string }) => new URL(event.path, "http://localhost"));
    vi.stubGlobal("getAuthSession", async () => ({ data: {} }));
    vi.stubGlobal("createError", (input: object) => Object.assign(new Error(), input));
});
afterEach(() => vi.unstubAllGlobals());

describe("retired CV API auth boundary", () => {
    it("requires authentication for every method, removed path and conditional read", async () => {
        const { default: middleware } = await import("../../server/middleware/cv-auth");
        for (const path of ["/api/cvs", "/api/cvs/legacy", "/api/cvs/legacy/events", "/api/cvs/legacy/fork", "/api/cvs/legacy/profile", "/api/cvs/legacy/profile/preview", "/api/cvs/legacy/profile/detect", "/api/cvs/unknown/path", "/api/cv-profiles/apply"]) {
            for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
                await expect(middleware({ path, method, context: {}, headers: { "if-none-match": '"1"' } } as never)).rejects.toMatchObject({ statusCode: 401 });
            }
            for (const userId of ["user_synthetic_a", "user_synthetic_b"]) {
                await expect(middleware({ path, context: { auth: async () => ({ userId }) } } as never)).resolves.toBeUndefined();
            }
        }
        await expect(middleware({ path: "/api/public/templates", context: {} } as never)).resolves.toBeUndefined();
    });

    it("rejects cross-template overrides before any command or storage call", async () => {
        const { default: handler } = await import("../../server/routes/api/cv-templates/index.post");
        const dispatch = vi.fn();
        vi.stubGlobal("sendApiRequest", dispatch);
        vi.stubGlobal("readBody", async () => ({ overrideId: "synthetic-existing-template", markdownSkeleton: "# Synthetic", css: "" }));
        await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 });
        for (const userId of ["user_synthetic_a", "user_synthetic_b"]) {
            await expect(handler({ context: { auth: async () => ({ userId }) } } as never)).rejects.toMatchObject({ statusCode: 403 });
        }
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("rejects server import commits without accessing legacy documents", async () => {
        const { default: handler } = await import("../../server/routes/api/cv-imports/[id]/commit.post");
        await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 });
        await expect(handler({ context: { auth: async () => ({ userId: "user_synthetic" }) } } as never)).rejects.toMatchObject({ statusCode: 404 });
    });

    it("gates MCP before opening a protocol transport", async () => {
        const { default: handler } = await import("../../server/routes/mcp");
        await expect(handler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 401 });
    });

    it("all advertised MCP CV tools return an unavailable error without storage access", async () => {
        const storage = vi.fn(() => { throw new Error("must not open storage"); });
        vi.stubGlobal("useStorage", storage);
        const server = createCvMcpServer();
        const client = new Client({ name: "synthetic-test", version: "1" });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
        try {
            const tools = await client.listTools();
            expect(tools.tools).toHaveLength(7);
            for (const tool of tools.tools) {
                const result = await client.callTool({ name: tool.name, arguments: { id: "synthetic", target: "markdown", oldText: "x", newText: "y", profile: {}, ids: ["synthetic"] } });
                expect(result.isError).toBe(true);
                expect(JSON.stringify(result.content)).toContain("browser");
            }
            expect(storage).not.toHaveBeenCalled();
        } finally { await client.close(); await server.close(); }
    });
});
