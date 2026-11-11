import { describe, expect, it, vi } from "vitest";
import {
   LANG_WORKER_REQUEST_TYPES,
   createLangDocumentStore,
   createLangWorkerDispatcher,
   createLangWorkerRequest,
   createCancelRequest,
   createErrorResponse,
   createOkResponse,
   createSequence,
   isJsonValue,
   isLangWorkerMessage,
   parseLangWorkerMessage,
   serializeLangWorkerMessage,
} from "../packages/editor/app/utils/lang/workerProtocol";

describe("request envelope and sequence", () => {
   it("lists the built-in request types", () => {
      expect(LANG_WORKER_REQUEST_TYPES).toEqual(["didOpen", "didChange", "didClose", "completions", "diagnostics", "hover", "cancel"]);
   });

   it("creates a plain request envelope", () => {
      expect(createLangWorkerRequest(3, "completions", { uri: "file:///cv.md" })).toEqual({
         kind: "request", seq: 3, type: "completions", payload: { uri: "file:///cv.md" },
      });
      expect(createLangWorkerRequest(4, "diagnostics")).toEqual({ kind: "request", seq: 4, type: "diagnostics" });
   });

   it("rejects non-positive or non-integer seq values", () => {
      for (const seq of [0, -1, 1.5, Number.NaN]) expect(() => createLangWorkerRequest(seq, "completions")).toThrow(RangeError);
   });

   it("generates monotonically increasing seq values with peek and reset", () => {
      const seq = createSequence();
      expect(seq.peek()).toBe(1);
      expect(seq.next()).toBe(1);
      expect(seq.next()).toBe(2);
      expect(seq.peek()).toBe(3);
      seq.reset();
      expect(seq.next()).toBe(1);
      const offset = createSequence(41);
      expect(offset.next()).toBe(41);
   });

   it("creates ok and error responses", () => {
      expect(createOkResponse(7)).toEqual({ kind: "response", seq: 7, ok: true, result: null });
      expect(createOkResponse(7, { words: 2 })).toEqual({ kind: "response", seq: 7, ok: true, result: { words: 2 } });
      expect(createErrorResponse(8, "unknown_request", "Nope")).toEqual({
         kind: "response", seq: 8, ok: false, error: { code: "unknown_request", message: "Nope" },
      });
   });
});

describe("cancel", () => {
   it("creates a cancel request naming its target seq", () => {
      expect(createCancelRequest(9, 3)).toEqual({ kind: "request", seq: 9, type: "cancel", payload: { targetSeq: 3 } });
      expect(() => createCancelRequest(9, 0)).toThrow(RangeError);
   });

   it("prevents a cancelled request from reaching its handler", async () => {
      const completions = vi.fn(() => ({ words: 1 }));
      const dispatcher = createLangWorkerDispatcher({ completions });
      const ack = await dispatcher.dispatch(createCancelRequest(1, 5));
      expect(ack).toEqual({ kind: "response", seq: 1, ok: true, result: { cancelled: 5 } });
      expect(dispatcher.isCancelled(5)).toBe(true);
      expect(dispatcher.isCancelled(6)).toBe(false);
      const res = await dispatcher.dispatch(createLangWorkerRequest(5, "completions", { uri: "file:///cv.md" }));
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe("cancelled");
      expect(completions).not.toHaveBeenCalled();
   });
});

describe("document sync store", () => {
   it("opens, changes with monotonic versions, and closes documents", () => {
      const docs = createLangDocumentStore();
      expect(docs.open({ uri: "file:///b.md", text: "bravo", languageId: "markdown" })).toEqual({
         uri: "file:///b.md", text: "bravo", version: 1, languageId: "markdown",
      });
      docs.open({ uri: "file:///a.md", text: "alpha", version: 4 });
      expect(docs.list().map((doc) => doc.uri)).toEqual(["file:///a.md", "file:///b.md"]);
      expect(docs.change("file:///b.md", "bravo 2", 2)?.text).toBe("bravo 2");
      expect(docs.change("file:///b.md", "stale", 2)).toBeNull();
      expect(docs.change("file:///b.md", "stale", 1)).toBeNull();
      expect(docs.change("file:///missing.md", "x", 1)).toBeNull();
      expect(docs.get("file:///b.md")?.version).toBe(2);
      expect(docs.close("file:///b.md")).toBe(true);
      expect(docs.close("file:///b.md")).toBe(false);
      expect(docs.get("file:///b.md")).toBeUndefined();
   });

   it("returns copies so callers cannot mutate stored documents", () => {
      const docs = createLangDocumentStore();
      const opened = docs.open({ uri: "file:///a.md", text: "alpha" });
      opened.text = "hacked";
      expect(docs.get("file:///a.md")?.text).toBe("alpha");
   });
});

describe("document sync through the dispatcher", () => {
   it("applies didOpen, didChange and didClose to its store", async () => {
      const dispatcher = createLangWorkerDispatcher();
      const opened = await dispatcher.dispatch(createLangWorkerRequest(1, "didOpen", { uri: "file:///cv.md", text: "# Ada", version: 1 }));
      expect(opened).toEqual({ kind: "response", seq: 1, ok: true, result: { uri: "file:///cv.md", version: 1 } });
      const changed = await dispatcher.dispatch(createLangWorkerRequest(2, "didChange", { uri: "file:///cv.md", text: "# Ada L", version: 2 }));
      expect(changed.ok).toBe(true);
      expect(dispatcher.documents.get("file:///cv.md")?.text).toBe("# Ada L");
      const stale = await dispatcher.dispatch(createLangWorkerRequest(3, "didChange", { uri: "file:///cv.md", text: "old", version: 2 }));
      expect(stale.ok).toBe(false);
      expect(stale.error?.code).toBe("stale_version");
      const unopened = await dispatcher.dispatch(createLangWorkerRequest(4, "didChange", { uri: "file:///no.md", text: "x", version: 1 }));
      expect(unopened.error?.code).toBe("document_not_open");
      const closed = await dispatcher.dispatch(createLangWorkerRequest(5, "didClose", { uri: "file:///cv.md" }));
      expect(closed).toEqual({ kind: "response", seq: 5, ok: true, result: { uri: "file:///cv.md", closed: true } });
      expect(dispatcher.documents.get("file:///cv.md")).toBeUndefined();
   });

   it("rejects a didOpen payload without uri or text", async () => {
      const dispatcher = createLangWorkerDispatcher();
      const res = await dispatcher.dispatch(createLangWorkerRequest(1, "didOpen", { uri: "file:///cv.md" }));
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe("invalid_payload");
   });
});

describe("serialize-safe messages", () => {
   it("round-trips requests and responses through JSON unchanged", () => {
      const request = createLangWorkerRequest(2, "completions", { uri: "file:///cv.md", flags: [true, null], limit: 3 });
      expect(JSON.parse(serializeLangWorkerMessage(request))).toEqual(request);
      expect(parseLangWorkerMessage(serializeLangWorkerMessage(request))).toEqual(request);
      const response = createOkResponse(2, { words: 4 });
      expect(parseLangWorkerMessage(JSON.stringify(response))).toEqual(response);
      expect(parseLangWorkerMessage(response)).toEqual(response);
   });

   it("recognises only well-formed messages", () => {
      expect(isLangWorkerMessage(createLangWorkerRequest(1, "completions"))).toBe(true);
      expect(isLangWorkerMessage(createErrorResponse(1, "x", "y"))).toBe(true);
      expect(isLangWorkerMessage(null)).toBe(false);
      expect(isLangWorkerMessage({ kind: "request", seq: 0, type: "completions" })).toBe(false);
      expect(isLangWorkerMessage({ kind: "request", seq: 1, type: "" })).toBe(false);
      expect(isLangWorkerMessage({ kind: "response", seq: 1, ok: "yes" })).toBe(false);
      expect(isLangWorkerMessage({ kind: "other", seq: 1 })).toBe(false);
   });

   it("rejects values JSON cannot carry losslessly", () => {
      expect(isJsonValue({ a: [1, "x", true, null] })).toBe(true);
      expect(isJsonValue(undefined)).toBe(false);
      expect(isJsonValue(() => 1)).toBe(false);
      expect(isJsonValue(10n)).toBe(false);
      expect(isJsonValue(Number.NaN)).toBe(false);
      expect(isJsonValue(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isJsonValue(new Date())).toBe(false);
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      expect(isJsonValue(circular)).toBe(false);
   });

   it("throws on serializing a non-serializable payload and parses bad input to null", () => {
      const bad = { kind: "request", seq: 1, type: "completions", payload: { fn: () => 1 } } as never;
      expect(() => serializeLangWorkerMessage(bad)).toThrow(TypeError);
      expect(parseLangWorkerMessage("{not json")).toBeNull();
      expect(parseLangWorkerMessage("{\"kind\":\"request\",\"seq\":0}")).toBeNull();
      expect(parseLangWorkerMessage(42)).toBeNull();
   });
});

describe("dispatcher stub", () => {
   it("routes a request to its handler with document context", async () => {
      const dispatcher = createLangWorkerDispatcher({
         completions: (payload, ctx) => {
            const uri = typeof payload === "object" && payload !== null && "uri" in payload ? String((payload as { uri: unknown }).uri) : "";
            const text = ctx.documents.get(uri)?.text ?? "";
            return { words: text ? text.split(/\s+/).length : 0 };
         },
      });
      await dispatcher.dispatch(createLangWorkerRequest(1, "didOpen", { uri: "file:///cv.md", text: "one two three", version: 1 }));
      const res = await dispatcher.dispatch(createLangWorkerRequest(2, "completions", { uri: "file:///cv.md" }));
      expect(res).toEqual({ kind: "response", seq: 2, ok: true, result: { words: 3 } });
   });

   it("supports async handlers", async () => {
      const dispatcher = createLangWorkerDispatcher({ diagnostics: async () => ({ issues: [] }) });
      expect(await dispatcher.dispatch(createLangWorkerRequest(1, "diagnostics"))).toEqual({
         kind: "response", seq: 1, ok: true, result: { issues: [] },
      });
   });

   it("answers unknown, throwing, unserializable and invalid work with error responses", async () => {
      const dispatcher = createLangWorkerDispatcher({
         completions: () => { throw new Error("boom"); },
         diagnostics: () => ({ at: new Date() }) as never,
      });
      expect((await dispatcher.dispatch(createLangWorkerRequest(1, "hover"))).error?.code).toBe("unknown_request");
      const thrown = await dispatcher.dispatch(createLangWorkerRequest(2, "completions"));
      expect(thrown.error).toEqual({ code: "handler_error", message: "boom" });
      expect((await dispatcher.dispatch(createLangWorkerRequest(3, "diagnostics"))).error?.code).toBe("unserializable_result");
      const invalid = await dispatcher.dispatch({ kind: "request", seq: 0, type: "completions" } as never);
      expect(invalid).toEqual({ kind: "response", seq: 0, ok: false, error: { code: "invalid_message", message: expect.any(String) } });
   });
});
