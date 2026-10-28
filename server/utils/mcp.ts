import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const UNAVAILABLE = "CV documents are stored in the browser and are not available through MCP yet.";
const unavailable = async () => ({
    isError: true,
    content: [{ type: "text" as const, text: UNAVAILABLE }],
});

/**
 * Create an isolated MCP protocol server for one stateless HTTP request. The route requires a signed-in
 * caller; the CV tools keep their names and report a clear error until they read owner-scoped cloud sessions.
 */
export function createCvMcpServer(): McpServer {
    const server = new McpServer({ name: "cv-sv", version: "0.1.0" });
    const id = { id: z.string().default("master") };
    server.registerTool("list_cvs", { description: "List CV documents (unavailable: CVs are browser-local)" }, unavailable);
    server.registerTool("open_cv", { description: "Read a CV document (unavailable: CVs are browser-local)", inputSchema: id }, unavailable);
    server.registerTool("save_cv", {
        description: "Save a CV document (unavailable: CVs are browser-local)",
        inputSchema: { ...id, markdown: z.string().optional(), css: z.string().optional(), expectedRevision: z.number().int().positive().optional() },
    }, unavailable);
    server.registerTool("patch_cv", {
        description: "Patch a CV document (unavailable: CVs are browser-local)",
        inputSchema: { ...id, target: z.enum(["markdown", "css"]), oldText: z.string().min(1), newText: z.string(), expectedRevision: z.number().int().positive().optional() },
    }, unavailable);
    server.registerTool("switch_cv_profile", {
        description: "Re-render a CV with another profile (unavailable: CVs are browser-local)",
        inputSchema: { ...id, profile: z.record(z.string(), z.unknown()), templateId: z.string().optional(), templateVersion: z.number().int().positive().optional() },
    }, unavailable);
    server.registerTool("detect_cv_profile", { description: "Detect a CV profile (unavailable: CVs are browser-local)", inputSchema: id }, unavailable);
    server.registerTool("apply_cv_profile", {
        description: "Apply a profile to several CVs (unavailable: CVs are browser-local)",
        inputSchema: { ids: z.array(z.string()).min(1).max(50), profile: z.record(z.string(), z.unknown()) },
    }, unavailable);
    return server;
}
