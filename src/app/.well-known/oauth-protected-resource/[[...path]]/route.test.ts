import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("GET /.well-known/oauth-protected-resource", () => {
  it("serves protected-resource metadata without a session", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resource).toBe("http://localhost:3000/api/mcp");
    expect(body.authorization_servers).toEqual([process.env.OIDC_ISSUER]);
    expect(body.bearer_methods_supported).toEqual(["header"]);
  });

  it("serves the same document for the path-suffixed URL (one optional catch-all handler)", async () => {
    const res = await GET();
    expect((await res.json()).resource).toBe("http://localhost:3000/api/mcp");
  });
});
