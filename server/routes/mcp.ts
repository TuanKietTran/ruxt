import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createCvMcpServer } from "../utils/mcp";
import { requireAuthUser } from "../utils/auth-user";

/** MCP Streamable HTTP endpoint. Stateless mode creates no server-side MCP session. */
export default defineEventHandler(async (event) => {
    await requireAuthUser(event);
    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
    });
    const server = createCvMcpServer();
    await server.connect(transport);
    return transport.handleRequest(toWebRequest(event));
});
