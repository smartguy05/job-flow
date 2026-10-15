import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { installTestIssuer, type TestIssuer } from "@/test/oidc";
import { mcpIssuer, verifyAccessToken } from "./oidc";

let issuer: TestIssuer;

beforeAll(async () => {
  issuer = await installTestIssuer();
});

afterEach(() => {
  delete process.env.MCP_OAUTH_AUDIENCE;
  delete process.env.MCP_OAUTH_ISSUER;
});

describe("verifyAccessToken", () => {
  it("accepts a valid token whose audience is the OIDC client id and returns its sub", async () => {
    const token = await issuer.sign({ sub: "abc123" });
    await expect(verifyAccessToken(token)).resolves.toEqual({ sub: "abc123" });
  });

  it("rejects a token for a different audience", async () => {
    const token = await issuer.sign({ sub: "abc123" }, { audience: "some-other-client" });
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("uses MCP_OAUTH_AUDIENCE instead of the client id when set", async () => {
    process.env.MCP_OAUTH_AUDIENCE = "jobflow-mcp";
    const good = await issuer.sign({ sub: "abc123" }, { audience: "jobflow-mcp" });
    await expect(verifyAccessToken(good)).resolves.toEqual({ sub: "abc123" });
    const webClient = await issuer.sign({ sub: "abc123" });
    await expect(verifyAccessToken(webClient)).rejects.toThrow();
  });

  it("accepts a comma-separated MCP_OAUTH_AUDIENCE list", async () => {
    process.env.MCP_OAUTH_AUDIENCE = "jobflow-mcp, test-client";
    const token = await issuer.sign({ sub: "abc123" });
    await expect(verifyAccessToken(token)).resolves.toEqual({ sub: "abc123" });
  });

  it("rejects an expired token", async () => {
    const token = await issuer.sign({ sub: "abc123" }, { expiresIn: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects a token with no exp claim (never-expiring tokens are not accepted)", async () => {
    const token = await issuer.sign({ sub: "abc123" }, { expiresIn: null });
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects a token from the wrong issuer", async () => {
    const token = await issuer.sign({ sub: "abc123" }, { issuer: "https://evil.test/application/o/jobflow/" });
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it("rejects a token without a sub", async () => {
    const token = await issuer.sign({});
    await expect(verifyAccessToken(token)).rejects.toThrow(/sub/);
  });

  it("rejects garbage", async () => {
    await expect(verifyAccessToken("not-a-jwt")).rejects.toThrow();
  });

  it("verifies against a dedicated MCP provider when MCP_OAUTH_ISSUER is set", async () => {
    const mcp = await installTestIssuer("https://authentik.test/application/o/jobflow-mcp/");
    process.env.MCP_OAUTH_ISSUER = mcp.issuer;
    process.env.MCP_OAUTH_AUDIENCE = "mcp-client";
    expect(mcpIssuer()).toBe(mcp.issuer);
    const good = await mcp.sign({ sub: "abc123" }, { audience: "mcp-client" });
    await expect(verifyAccessToken(good)).resolves.toEqual({ sub: "abc123" });
    // A web-provider token (other issuer + key) is no longer accepted.
    const web = await issuer.sign({ sub: "abc123" }, { audience: "mcp-client" });
    await expect(verifyAccessToken(web)).rejects.toThrow();
  });

  it("defaults the MCP issuer to OIDC_ISSUER", () => {
    expect(mcpIssuer()).toBe(process.env.OIDC_ISSUER);
  });
});
