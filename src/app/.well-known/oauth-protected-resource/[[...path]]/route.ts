import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";

// RFC 9728 protected-resource metadata for the MCP endpoint. Public (exempt in middleware).
// The optional catch-all also answers the path-suffixed form
// (/.well-known/oauth-protected-resource/api/mcp) that some MCP clients probe first.
export async function GET() {
  return NextResponse.json(protectedResourceMetadata(), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
