import { NextResponse } from "next/server";
import { appBaseUrl, mcpIssuer } from "@/lib/auth/oidc";

// OAuth protected-resource plumbing for the MCP endpoint (RFC 9728 + RFC 6750). JobFlow is
// the resource server; Authentik (OIDC_ISSUER) is the authorization server. MCP clients
// (Claude) hit /api/mcp, get a 401 whose WWW-Authenticate points at the metadata document,
// read `authorization_servers` from it, then run the OAuth flow against Authentik
// (MCP_OAUTH_ISSUER when a dedicated provider issues MCP tokens, else OIDC_ISSUER).

export const MCP_SCOPES = ["openid", "profile", "email", "offline_access"];

export function mcpResourceUrl(): string {
  return `${appBaseUrl()}/api/mcp`;
}

export function resourceMetadataUrl(): string {
  return `${appBaseUrl()}/.well-known/oauth-protected-resource`;
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [mcpIssuer()],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "JobFlow",
  };
}

// 401 for a missing/invalid/unknown-user bearer token. The challenge is what starts the
// client's OAuth sign-in, so every unauthenticated /api/mcp response must carry it.
export function mcpUnauthorized(): NextResponse {
  return NextResponse.json(
    { error: "unauthorized" },
    {
      status: 401,
      headers: { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl()}"` },
    },
  );
}
