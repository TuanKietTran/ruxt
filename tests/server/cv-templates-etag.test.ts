import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTemplate } from "../helpers/fakes";
import { jsonEtag, matchesIfNoneMatch, sendNotModified } from "../../server/utils/http-cache";

vi.mock("@ruxt/shared/cqrs", () => ({ useMediator: () => ({}) }));
vi.mock("../../server/adapters/cv/template-repo", () => ({ isCatalogTemplate: () => true }));

const publicTemplate = makeTemplate({ id: "public-example", tags: ["public"] });
const changedTemplate = makeTemplate({ id: "public-example", name: "Changed", tags: ["public"] });
const privateTemplate = makeTemplate({ id: "private-example", tags: ["local"], builtIn: false });
const internalTemplate = makeTemplate({ id: "internal-example", tags: ["internal"] });

let responseHeaders: Record<string, string>;
let responseStatus: number | undefined;

const eventFor = (userId: string, ifNoneMatch?: string) => ({
    context: { auth: async () => ({ userId }) },
    headers: ifNoneMatch === undefined ? {} : { "if-none-match": ifNoneMatch },
}) as never;

beforeEach(() => {
    vi.clearAllMocks();
    responseHeaders = {};
    responseStatus = undefined;
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    vi.stubGlobal("createError", (input: object) => Object.assign(new Error(), input));
    vi.stubGlobal("getHeader", (event: { headers?: Record<string, string> }, name: string) => event.headers?.[name]);
    vi.stubGlobal("setPrivateCache", vi.fn());
    vi.stubGlobal("cachePublicJson", async (_event: unknown, load: () => Promise<unknown>) => load());
    vi.stubGlobal("jsonEtag", jsonEtag);
    vi.stubGlobal("matchesIfNoneMatch", matchesIfNoneMatch);
    vi.stubGlobal("sendNotModified", sendNotModified);
    vi.stubGlobal("setResponseHeader", (_event: unknown, name: string, value: string) => { responseHeaders[name] = value; });
    vi.stubGlobal("setResponseHeaders", (_event: unknown, headers: Record<string, string>) => { Object.assign(responseHeaders, headers); });
    vi.stubGlobal("setResponseStatus", (_event: unknown, status: number) => { responseStatus = status; });
});
afterEach(() => vi.unstubAllGlobals());

describe("CV template load ETag / conditional requests", () => {
    it("cv-templates: 200 with a stable ETag, then 304 for If-None-Match, then 200 with a new ETag after a change", async () => {
        vi.stubGlobal("sendApiRequest", async () => [publicTemplate, privateTemplate, internalTemplate]);
        const { default: handler } = await import("../../server/routes/api/cv-templates/index.get");
        const first = await handler(eventFor("user_synthetic_a"));
        expect(first.templates.map((template: { id: string }) => template.id)).toEqual(["public-example"]);
        const etag = responseHeaders.etag;
        expect(etag).toMatch(/^"[^"]+"$/);
        expect(responseStatus).toBeUndefined();
        const conditional = await handler(eventFor("user_synthetic_a", etag));
        expect(conditional).toBeNull();
        expect(responseStatus).toBe(304);
        expect(responseHeaders.etag).toBe(etag);
        vi.stubGlobal("sendApiRequest", async () => [changedTemplate, privateTemplate, internalTemplate]);
        responseStatus = undefined;
        const changed = await handler(eventFor("user_synthetic_a", etag));
        expect(changed.templates).toHaveLength(1);
        expect(responseStatus).toBeUndefined();
        expect(responseHeaders.etag).not.toBe(etag);
        expect(responseHeaders.etag).toMatch(/^"[^"]+"$/);
    });
    it("cv-templates: a weak or listed If-None-Match validator also matches", async () => {
        vi.stubGlobal("sendApiRequest", async () => [publicTemplate]);
        const { default: handler } = await import("../../server/routes/api/cv-templates/index.get");
        await handler(eventFor("user_synthetic_a"));
        const etag = responseHeaders.etag;
        responseStatus = undefined;
        const conditional = await handler(eventFor("user_synthetic_a", `"stale", W/${etag}`));
        expect(conditional).toBeNull();
        expect(responseStatus).toBe(304);
    });
    it("public templates: 200 with an ETag, then 304 for If-None-Match, then 200 with a new ETag after a change", async () => {
        vi.stubGlobal("sendApiRequest", async () => [publicTemplate, privateTemplate, internalTemplate]);
        const { default: handler } = await import("../../server/routes/api/public/templates.get");
        const first = await handler(eventFor("user_synthetic_a"));
        expect(first.templates.map((template: { id: string }) => template.id)).toEqual(["public-example"]);
        const etag = responseHeaders.etag;
        expect(etag).toMatch(/^"[^"]+"$/);
        const conditional = await handler(eventFor("user_synthetic_a", etag));
        expect(conditional).toBeNull();
        expect(responseStatus).toBe(304);
        vi.stubGlobal("sendApiRequest", async () => [changedTemplate, privateTemplate, internalTemplate]);
        const changed = await handler(eventFor("user_synthetic_a", etag));
        expect(changed.templates).toHaveLength(1);
        expect(responseHeaders.etag).not.toBe(etag);
    });
});
