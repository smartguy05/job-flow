import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getBearerUser } from "@/lib/auth";
import { mcpUnauthorized } from "@/lib/mcp/http";
import { buildMcpServer } from "@/lib/mcp/server";

// MCP server (Streamable HTTP, stateless). Exempt from the session middleware: every request
// must carry an Authentik-issued OAuth access token (`Authorization: Bearer`), verified here.
// A fresh server + transport per request keeps it stateless and bound to the token's user.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // generate_resume can take minutes

export async function POST(req: Request) {
  const user = await getBearerUser(req);
  if (!user) return mcpUnauthorized();
  const server = buildMcpServer(user.id);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(req);
}

// Stateless: no standalone SSE stream (GET) or session to terminate (DELETE). Unauthenticated
// callers still get the OAuth challenge so discovery works from any method.
async function notAllowed(req: Request) {
  if (!(await getBearerUser(req))) return mcpUnauthorized();
  return NextResponse.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export const GET = notAllowed;
export const DELETE = notAllowed;
