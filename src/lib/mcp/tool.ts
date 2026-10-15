import type { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

// One MCP tool: a zod input schema plus a handler that takes the authenticated user's id
// first (like the services it wraps) and returns plain JSON-serializable data. Handlers
// throw NotFoundError / ValidationError; the server turns those into `isError` results.
// Keeping handlers free of MCP types lets tests call them directly with a userId.
export type McpTool<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  annotations?: ToolAnnotations;
  handler: (userId: string, args: z.output<S>) => Promise<unknown>;
};

export function defineTool<S extends z.ZodObject>(tool: McpTool<S>): McpTool {
  return tool as unknown as McpTool;
}

export const READ_ONLY: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
export const WRITES: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
