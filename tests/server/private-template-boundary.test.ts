import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTemplate } from "../helpers/fakes";

vi.mock("@ruxt/shared/cqrs", () => ({ useMediator: () => ({}) }));
vi.mock("../../server/services/cv-import-worker", () => ({ runCvImport: vi.fn() }));
const { putSource } = vi.hoisted(() => ({ putSource: vi.fn() }));
vi.mock("../../server/adapters/cv/pipeline-repos", () => ({ cvArtifactRepo: { putSource } }));
const eventFor = (userId: string) => ({ context: { auth: async () => ({ userId }) } }) as never;
const publicTemplate = makeTemplate({ id: "public-example", tags: ["public"] });
const privateTemplate = makeTemplate({ id: "private-example", tags: ["local"], builtIn: false });
const internalTemplate = makeTemplate({ id: "internal-example", tags: ["internal"] });

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("defineEventHandler", (handler: unknown) => handler);
    vi.stubGlobal("createError", (input: object) => Object.assign(new Error(), input));
    vi.stubGlobal("setPrivateCache", vi.fn());
    vi.stubGlobal("getRouterParam", () => "private-example");
    vi.stubGlobal("readBody", async () => ({ newId: "synthetic-copy", name: "Example", markdownSkeleton: "# Example", css: "" }));
});
afterEach(() => vi.unstubAllGlobals());

describe("private ownerless templates fail closed", () => {
    it("never lists private or internal templates to either account", async () => {
        vi.stubGlobal("sendApiRequest", async () => [publicTemplate, privateTemplate, internalTemplate]);
        const { default: handler } = await import("../../server/routes/api/cv-templates/index.get");
        for (const userId of ["user_synthetic_a", "user_synthetic_b"]) {
            const response = await handler(eventFor(userId));
            expect(response.templates.map(template => template.id)).toEqual(["public-example"]);
        }
    });

    it("refuses ownerless server save and clone for either account", async () => {
        const dispatch = vi.fn();
        vi.stubGlobal("sendApiRequest", dispatch);
        const { default: save } = await import("../../server/routes/api/cv-templates/index.post");
        const { default: clone } = await import("../../server/routes/api/cv-templates/[id]/clone.post");
        for (const userId of ["user_synthetic_a", "user_synthetic_b"]) {
            await expect(save(eventFor(userId))).rejects.toMatchObject({ statusCode: 403 });
            await expect(clone(eventFor(userId))).rejects.toMatchObject({ statusCode: 404 });
        }
        expect(dispatch).not.toHaveBeenCalled();
    });

    it("the repository also hides private records and refuses writes for indirect workflows", async () => {
        const pipeline = makeTemplate({ id: "pipeline-default", version: 1, tags: ["internal"] });
        const items = new Map([publicTemplate, privateTemplate, internalTemplate, pipeline].map(template => [`templates:${template.id}:v${template.version}`, template.toJSON()]));
        const write = vi.fn();
        vi.stubGlobal("useRuntimeConfig", () => ({ app: { buildId: "synthetic" } }));
        vi.stubGlobal("useStorage", () => ({
            getItem: async (key: string) => key === "template-seeds:build" ? "synthetic" : items.get(key),
            getKeys: async () => [...items.keys()], setItem: write,
        }));
        const { cvTemplateRepo } = await import("../../server/adapters/cv/template-repo");
        expect((await cvTemplateRepo.list()).map(template => template.id)).toEqual(["public-example"]);
        expect(await cvTemplateRepo.get("private-example", 1)).toBeNull();
        expect(await cvTemplateRepo.get("private-example")).toBeNull();
        expect(await cvTemplateRepo.get("internal-example", 1)).toBeNull();
        expect((await cvTemplateRepo.get("pipeline-default", 1))?.id).toBe("pipeline-default");
        await expect(cvTemplateRepo.save(privateTemplate)).rejects.toThrow("browser-local");
        expect(write).not.toHaveBeenCalled();
    });

    it("rejects private and arbitrary internal import sources before artifact writes", async () => {
        vi.stubGlobal("getHeader", () => undefined);
        vi.stubGlobal("readMultipartFormData", async () => [
            { name: "file", filename: "synthetic.pdf", type: "application/pdf", data: Buffer.from("synthetic") },
            { name: "templateId", data: Buffer.from("private-example") },
        ]);
        const { default: handler } = await import("../../server/routes/api/cv-imports/index.post");
        for (const template of [privateTemplate, internalTemplate]) {
            vi.stubGlobal("sendApiRequest", async (_mediator: unknown, request: { requestName: string }) => {
                if (request.requestName === "GetCvCapabilities") return { available: true, maxUploadBytes: 1000 };
                if (request.requestName === "GetCvTemplate") return template;
                throw new Error("Unexpected dispatch");
            });
            for (const userId of ["user_synthetic_a", "user_synthetic_b"]) {
                await expect(handler(eventFor(userId))).rejects.toMatchObject({ statusCode: 404 });
            }
        }
        expect(putSource).not.toHaveBeenCalled();
    });
});
