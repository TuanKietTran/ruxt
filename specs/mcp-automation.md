# MCP and automation

## Transport

/mcp requires requireAuthUser and creates a fresh MCP server and Web Standard Streamable HTTP transport per request. It has no session-id generator or persistent session map.

The retained tools are list_cvs, open_cv, save_cv, patch_cv, switch_cv_profile, detect_cv_profile, and apply_cv_profile. All return an error explaining that documents are browser-local. They do not read the retired server store.

Owner-scoped cloud access must exist before re-enabling document tools. Stateless requests do not provide unsolicited notifications across requests.

## Headless export

scripts/render-pdf.mjs takes an editor URL and output path. CV_URL defaults to http://localhost:3000/; CHROMIUM_PATH selects an installed Chromium-compatible browser. playwright-core does not download one.

The script waits for preview sheets/fonts, prints A4 with backgrounds and zero margins, and closes the browser in finally. It currently assumes a two-sheet reference document and has a macOS Brave default path.

## Boundaries

Browser-local sessions are not available to a fresh automation browser profile automatically. Exported files are user data. The unused app/workers/cv-pipeline/extract.ts scaffold is separate from the server Python import pipeline.

See [CV workflows](cv-server-workflows.md) for proposed automation and [local sessions](cv-documents-realtime.md) for persistence.
