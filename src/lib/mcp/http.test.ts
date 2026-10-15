import { describe, it, expect } from "vitest";
import { mcpResourceUrl, mcpUnauthorized, protectedResourceMetadata, resourceMetadataUrl } from "./http";

describe("MCP OAuth discovery helpers", () => {
  it("derives the resource and metadata URLs from APP_BASE_URL", () => {
    // vitest.setup.ts: APP_BASE_URL=http://localhost:3000
    expect(mcpResourceUrl()).toBe("http://localhost:3000/api/mcp");
    expect(resourceMetadataUrl()).toBe("http://localhost:3000/.well-known/oauth-protected-resource");
  });

  it("builds RFC 9728 protected-resource metadata pointing at the OIDC issuer", () => {
    const m = protectedResourceMetadata();
    expect(m.resource).toBe("http://localhost:3000/api/mcp");
    expect(m.authorization_servers).toEqual([process.env.OIDC_ISSUER]);
    expect(m.bearer_methods_supported).toEqual(["header"]);
    expect(m.scopes_supported).toEqual(expect.arrayContaining(["openid", "profile", "email", "offline_access"]));
  });

  it("returns a 401 carrying a WWW-Authenticate resource_metadata challenge", async () => {
    const res = mcpUnauthorized();
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"',
    );
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("advertises MCP_OAUTH_ISSUER when a dedicated provider is configured", () => {
    process.env.MCP_OAUTH_ISSUER = "https://authentik.test/application/o/jobflow-mcp/";
    try {
      expect(protectedResourceMetadata().authorization_servers).toEqual([process.env.MCP_OAUTH_ISSUER]);
    } finally {
      delete process.env.MCP_OAUTH_ISSUER;
    }
  });
});
