import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());
it("marks account responses, including errors, private/no-store without changing public catalogs", async () => {
    const headers = vi.fn();
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    vi.stubGlobal("getRequestURL", (event: { path: string }) => new URL(event.path, "http://localhost"));
    vi.stubGlobal("setResponseHeaders", headers);
    const { default: handler } = await import("../../server/middleware/account-cache");
    for (const path of ["/api/auth/me", "/api/preferences", "/api/cloud-data/consent", "/api/cvs/example", "/api/cv-imports/example/preview", "/api/cv-applications/example", "/api/cv-artifacts/example", "/mcp"]) {
        handler({ path } as never);
        expect(headers).toHaveBeenLastCalledWith({ path }, { "cache-control": "private, no-store", vary: "Cookie, Authorization" });
    }
    headers.mockClear();
    handler({ path: "/api/public/templates" } as never);
    expect(headers).not.toHaveBeenCalled();
});
