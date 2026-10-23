# MCP And Automation

Last updated: main@d1ae665 | 2026-09-13

## Scope

This spec covers:

- MCP tool construction in `server/utils/mcp.ts`;
- the Streamable HTTP route in `server/routes/mcp.ts`;
- the CV server utility used directly by MCP tools;
- headless PDF automation in `scripts/render-pdf.mjs`;
- the current extraction scaffold in `app/workers/cv-pipeline/extract.ts`.

CV storage and revisions belong to [cv-documents-realtime.md](cv-documents-realtime.md). Browser export belongs to [cv-editor.md](cv-editor.md). Intended intent-level tools, resources, prompts, jobs, and core handlers belong to [cv-server-workflows.md](cv-server-workflows.md).

## MCP Runtime

The running Nitro server exposes `/mcp` as an MCP Streamable HTTP endpoint. `server/routes/mcp.ts` converts the H3 event to a Web Standard `Request` and delegates to `WebStandardStreamableHTTPServerTransport`.

The route creates a fresh `McpServer` and transport per HTTP request. No session id generator is configured, so the endpoint is stateless and does not retain an MCP session map between requests. The server identifies itself as `cv-sv` version `0.1.0`.

`server/utils/mcp.ts` owns tool definitions and calls `server/adapters/cv/document-store.ts` directly. There is no internal HTTP request, secondary MCP process, or separate MCP persistence. Tool results are pretty-printed JSON in one MCP text content item.

## Tool Contract

- `list_cvs`: returns `{ documents: CvDocumentSummary[] }` from the shared server utility.
- `open_cv`: reads or lazily seeds a document; `id` defaults to `master`.
- `save_cv`: sends optional complete Markdown and/or CSS plus optional positive integer `expectedRevision`; writes use `sourceId: "mcp"`.
- `patch_cv`: opens the document, requires `oldText` to occur exactly once in the selected `markdown` or `css` field, performs one string replacement, and writes. It uses the caller's positive `expectedRevision` when supplied, otherwise the revision just opened.

`patch_cv` is the safer narrow-edit surface because uniqueness is checked and revision protection is enabled by default. `save_cv` protects against concurrent overwrite only when its caller supplies `expectedRevision`.

Accepted MCP writes run through the same validation, per-document write queue, Nitro storage, and process-local publication path as REST writes. Clean connected browser editors receive those updates through CV SSE.

## Client Connection

Start the Nuxt server with `pnpm dev` or a production build/preview, then configure an MCP client for Streamable HTTP at:

```text
http://localhost:3000/mcp
```

The endpoint itself has no package command because it is part of Nitro. Remote deployments use their public application origin plus `/mcp`.

## Headless PDF Script

`scripts/render-pdf.mjs` is a standalone CLI, not an MCP tool and not a package script. Its positional arguments are URL and output path, defaulting to `CV_URL`/`http://localhost:3000/` and `cv.pdf`.

The script launches `playwright-core` Chromium with `CHROMIUM_PATH`, defaulting to the macOS Brave executable. It waits for DOM content, `.cv-sheet`, the hydrated Georgia reference style, and loaded fonts. It currently requires exactly two sheets, then prints A4 with CSS page size, backgrounds, no headers/footers, and zero margins. Browser shutdown runs in `finally`.

## Extraction Scaffold

`app/workers/cv-pipeline/extract.ts` currently exports section aliases and regular expressions for email, phone, URL, LinkedIn, GitHub, and date-range extraction. It has no worker message listener, PDF parser, structured output type, or call site in the current repository.

## Trust And Data

MCP tool output can contain the complete CV, including personal data. It travels over HTTP to the MCP client and must not be logged or committed casually. Nitro CV storage remains the source of truth.

The MCP endpoint has no authentication or authorization. Host/origin allowlists, DNS-rebinding protection, and CORS policy are not configured by the route. Treat `/mcp` as having the same public trust boundary as the CV REST routes until an explicit credential layer is added.

## Current Gaps

- `/mcp` and the underlying CV operations have no authentication, authorization, ownership, or transport credential support.
- `save_cv` permits an empty update and defaults to last-write-wins when no revision is supplied.
- Stateless per-request servers cannot deliver unsolicited server notifications or preserve protocol state across requests.
- MCP does not expose document creation/deletion as explicit operations or PDF/image rendering tools.
- The PDF script is macOS/Brave-biased and hard-codes a two-page reference-CV assertion.
- The extraction file is an unused heuristic scaffold rather than a functional worker pipeline.
