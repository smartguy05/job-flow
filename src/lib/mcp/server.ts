import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { NotFoundError, ValidationError } from "@/lib/services/errors";
import { TOOLS } from "./registry";
import type { McpTool } from "./tool";

const INSTRUCTIONS =
  "JobFlow is the user's personal job-application tracker and employment history. Use these tools to capture " +
  "jobs, review and update applications and interviews, find follow-ups, generate tailored resumes and draft " +
  "messages, and keep a work journal. Every tool acts only on the signed-in user's own data. Confirm with the " +
  "user before saving captured jobs or changing an application's status.";

function textResult(data: unknown, isError = false): CallToolResult {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }], ...(isError ? { isError } : {}) };
}

async function run(tool: McpTool, userId: string, args: unknown): Promise<CallToolResult> {
  try {
    return textResult((await tool.handler(userId, args as never)) ?? { ok: true });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ValidationError) return textResult(`${e.name}: ${e.message}`, true);
    console.error(`[mcp] ${tool.name} failed`, e);
    return textResult(`Error: ${(e as Error).message}`, true);
  }
}

// A fresh MCP server bound to one authenticated user. The /api/mcp route builds one per
// request (stateless Streamable HTTP), so `userId` can never leak between callers.
export function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: "jobflow", title: "JobFlow", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations },
      ((args: unknown) => run(tool, userId, args)) as never,
    );
  }
  return server;
}
