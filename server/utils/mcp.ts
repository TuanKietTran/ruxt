import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { useMediator } from "@core/cqrs";
import { listCvDocumentsQuery } from "@core/handlers/list-cv-documents";
import { getCvDocumentQuery } from "@core/handlers/get-cv-document";
import { saveCvSourceCommand } from "@core/handlers/save-cv-source";
import { patchCvSourceCommand } from "@core/handlers/patch-cv-source";
import { switchCvProfileCommand } from "@core/handlers/switch-cv-profile";
import { detectCvProfileQuery } from "@core/handlers/detect-cv-profile";
import { applyCvProfileCommand, MAX_CV_PROFILE_APPLY_TARGETS } from "@core/handlers/apply-cv-profile";
import { assertAutomationAccess, meterAutomation } from "./auth-user";

const textResult = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

/** Create an isolated MCP protocol server for one stateless HTTP request. */
export function createCvMcpServer(ownerId?: string): McpServer {
    const server = new McpServer({ name: "cv-sv", version: "0.1.0" });
    const mediator = useMediator();
    const guard = async (capability: "read" | "write" | "profile", requestId?: string) => {
        if (ownerId) await assertAutomationAccess(ownerId, capability, requestId);
    };
    const metered = async (requestId?: string) => {
        if (ownerId) await meterAutomation(ownerId, requestId ?? crypto.randomUUID());
    };

    server.registerTool("list_cvs", {
        description: "List CV documents and their current revisions",
    }, async () => { await guard("read"); const result = await mediator.send(listCvDocumentsQuery()); await metered(); return textResult({ documents: result }); });

    server.registerTool("open_cv", {
        description: "Read the Markdown, CSS and revision of a CV document",
        inputSchema: { id: z.string().default("master") },
    }, async ({ id }) => { await guard("read"); const result = await mediator.send(getCvDocumentQuery({ id })); await metered(); return textResult(result); });

    server.registerTool("save_cv", {
        description: "Save complete Markdown and/or CSS. Pass expectedRevision to prevent overwriting concurrent edits.",
        inputSchema: {
            id: z.string().default("master"),
            markdown: z.string().optional(),
            css: z.string().optional(),
            expectedRevision: z.number().int().positive().optional(),
            requestId: z.string().optional(),
        },
    }, async ({ id, markdown, css, expectedRevision, requestId }) => {
        await guard("write", requestId);
        const result = await mediator.send(saveCvSourceCommand({ id, markdown, css, expectedRevision, sourceId: "mcp" }));
        await metered(requestId);
        return textResult(result);
    });

    server.registerTool("patch_cv", {
        description: "Replace one unique piece of Markdown or CSS and publish the edit to connected browsers.",
        inputSchema: {
            id: z.string().default("master"),
            target: z.enum(["markdown", "css"]),
            oldText: z.string().min(1),
            newText: z.string(),
            expectedRevision: z.number().int().positive().optional(),
            requestId: z.string().optional(),
        },
    }, async ({ id, target, oldText, newText, expectedRevision, requestId }) => {
        await guard("write", requestId);
        const result = await mediator.send(patchCvSourceCommand({ id, target, oldText, newText, expectedRevision, sourceId: "mcp" }));
        await metered(requestId);
        return textResult(result);
    });

    server.registerTool("switch_cv_profile", {
        description: "Re-render a CV with another profile, keeping the session's layout or switching to a public template. Pass expectedRevision to prevent overwriting concurrent edits.",
        inputSchema: {
            id: z.string().default("master"),
            profile: z.record(z.string(), z.unknown()),
            templateId: z.string().optional(),
            templateVersion: z.number().int().positive().optional(),
            expectedRevision: z.number().int().positive().optional(),
        },
    }, async ({ id, profile, templateId, templateVersion, expectedRevision }) => { await guard("profile"); const result = await mediator.send(switchCvProfileCommand({
            documentId: id,
            profile,
            template: templateId ? { id: templateId, version: templateVersion } : undefined,
            expectedRevision,
            publicOnly: true,
            sourceId: "mcp",
        })); await metered(); return textResult(result); });

    server.registerTool("detect_cv_profile", {
        description: "Extract the profile (identity, contacts, experience, education, projects, skills, certifications, languages) from a CV and report where each value appears in its Markdown.",
        inputSchema: { id: z.string().default("master") },
    }, async ({ id }) => { await guard("profile"); const result = await mediator.send(detectCvProfileQuery({ documentId: id })); await metered(); return textResult(result); });

    server.registerTool("apply_cv_profile", {
        description: "Re-render several CVs with one profile, keeping each CV's layout or switching all of them to a public template. Each CV succeeds or fails independently.",
        inputSchema: {
            ids: z.array(z.string()).min(1).max(MAX_CV_PROFILE_APPLY_TARGETS),
            profile: z.record(z.string(), z.unknown()),
            templateId: z.string().optional(),
            templateVersion: z.number().int().positive().optional(),
        },
    }, async ({ ids, profile, templateId, templateVersion }) => { await guard("profile"); const result = await mediator.send(applyCvProfileCommand({
            documentIds: ids,
            profile,
            template: templateId ? { id: templateId, version: templateVersion } : undefined,
            publicOnly: true,
            sourceId: "mcp",
        })); await metered(); return textResult(result); });

    return server;
}
