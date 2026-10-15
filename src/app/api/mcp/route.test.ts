import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { installTestIssuer, type TestIssuer } from "@/test/oidc";
import { insertApp } from "@/test/req";
import { POST, GET, DELETE } from "./route";

let issuer: TestIssuer;
beforeAll(async () => {
  issuer = await installTestIssuer();
});

const CHALLENGE = 'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"';

function rpc(body: unknown, headers: Record<string, string> = {}, method = "POST") {
  return new NextRequest("http://localhost/api/mcp", {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}

// Read a Streamable HTTP response (JSON or an SSE stream) and return the JSON-RPC messages.
async function messages(res: Response): Promise<{ id?: number; result?: Record<string, unknown>; error?: unknown }[]> {
  const body = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("application/json")) return [JSON.parse(body)].flat();
  return body
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "vitest", version: "0" } },
};

describe("/api/mcp auth", () => {
  it("returns 401 with a resource_metadata challenge without a token", async () => {
    const res = await POST(rpc(initialize));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(CHALLENGE);
  });

  it("ignores the web session cookie", async () => {
    const res = await POST(rpc(initialize, { cookie: globalThis.__testCookie }));
    expect(res.status).toBe(401);
  });

  it("returns 401 for a token with the wrong audience", async () => {
    const token = await issuer.sign({ sub: "test-user-sub" }, { audience: "someone-else" });
    const res = await POST(rpc(initialize, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(CHALLENGE);
  });

  it("returns 401 for a valid token whose user never signed in to the web app", async () => {
    const token = await issuer.sign({ sub: "stranger" });
    const res = await POST(rpc(initialize, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(401);
  });

  it("GET/DELETE challenge without a token and are 405 (stateless server) with one", async () => {
    expect((await GET(rpc(null, {}, "GET"))).status).toBe(401);
    expect((await DELETE(rpc(null, {}, "DELETE"))).status).toBe(401);
    const token = await issuer.sign({ sub: "test-user-sub" });
    const res = await GET(rpc(null, { authorization: `Bearer ${token}` }, "GET"));
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
    expect((await DELETE(rpc(null, { authorization: `Bearer ${token}` }, "DELETE"))).status).toBe(405);
  });
});

describe("/api/mcp JSON-RPC round trip", () => {
  it("initializes, lists tools and calls one as the token's user", async () => {
    await insertApp({ company: "Round Trip Co" });
    const token = await issuer.sign({ sub: "test-user-sub" });
    const auth = { authorization: `Bearer ${token}` };

    const initRes = await POST(rpc(initialize, auth));
    expect(initRes.status).toBe(200);
    const [init] = await messages(initRes);
    expect(init.id).toBe(1);
    expect((init.result?.serverInfo as { name: string }).name).toBe("jobflow");
    expect(init.result?.capabilities).toHaveProperty("tools");

    const proto = { ...auth, "mcp-protocol-version": "2025-06-18" };
    const notified = await POST(rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, proto));
    expect(notified.status).toBe(202);

    const [list] = await messages(await POST(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, proto)));
    const names = (list.result?.tools as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["list_applications", "capture_job", "generate_resume"]));

    const [call] = await messages(
      await POST(rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_applications", arguments: {} } }, proto)),
    );
    const content = call.result?.content as { text: string }[];
    expect(JSON.parse(content[0].text).map((a: { company: string }) => a.company)).toContain("Round Trip Co");
  });
});
