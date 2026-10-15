import type { McpTool } from "./tool";
import { captureJob, getApplication, listApplicationsTool, updateApplicationTool } from "./tools/applications";
import { addInterviewTool, updateInterviewTool } from "./tools/interviews";
import { needsAttention } from "./tools/attention";
import { draftMessage, generateResume } from "./tools/documents";
import { addJournalEntryTool, listJobsTool, listJournalTool } from "./tools/jobs";

// Every MCP tool JobFlow exposes. Later features append their tools here.
export const TOOLS: McpTool[] = [
  captureJob,
  listApplicationsTool,
  getApplication,
  updateApplicationTool,
  addInterviewTool,
  updateInterviewTool,
  needsAttention,
  generateResume,
  draftMessage,
  listJobsTool,
  addJournalEntryTool,
  listJournalTool,
];

export function getTool(name: string): McpTool {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  return tool;
}

// Validate raw arguments against the tool's schema and run it as `userId`. Used by tests
// (and anything else that needs a tool without the MCP protocol around it).
export async function callTool(name: string, userId: string, args: unknown = {}): Promise<unknown> {
  const tool = getTool(name);
  return tool.handler(userId, tool.inputSchema.parse(args ?? {}));
}
