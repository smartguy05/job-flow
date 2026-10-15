import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { insertApp, seedUser } from "@/test/req";
import { buildMcpServer } from "./server";
import { TOOLS } from "./registry";

async function connect(userId: string) {
  const server = buildMcpServer(userId);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);
  return client;
}

const text = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content[0]).text;

describe("buildMcpServer", () => {
  it("registers every tool with a description and an object input schema", async () => {
    const client = await connect(globalThis.__testUserId);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "capture_job", "list_applications", "get_application", "update_application", "add_interview",
        "update_interview", "needs_attention", "generate_resume", "draft_message", "list_jobs",
        "add_journal_entry", "list_journal", "ingest_email", "apply_email_actions",
      ]),
    );
    for (const t of tools) {
      expect(t.description, t.name).toBeTruthy();
      expect(t.inputSchema.type, t.name).toBe("object");
    }
    expect(tools.find((t) => t.name === "list_applications")?.annotations?.readOnlyHint).toBe(true);
  });

  it("binds tools to the connected user (results are JSON text)", async () => {
    const other = await seedUser("server-other");
    await insertApp({ company: "Mine Inc" });
    await insertApp({ userId: other.id, company: "Theirs Inc" });
    const mine = await connect(globalThis.__testUserId);
    const theirs = await connect(other.id);
    const a = JSON.parse(text(await mine.callTool({ name: "list_applications", arguments: {} })));
    const b = JSON.parse(text(await theirs.callTool({ name: "list_applications", arguments: {} })));
    expect(a.map((x: { company: string }) => x.company)).toEqual(["Mine Inc"]);
    expect(b.map((x: { company: string }) => x.company)).toEqual(["Theirs Inc"]);
  });

  it("returns domain errors as isError tool results", async () => {
    const client = await connect(globalThis.__testUserId);
    const res = await client.callTool({ name: "get_application", arguments: { id: 999999 } });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/not found/i);
  });

  it("rejects invalid arguments", async () => {
    const client = await connect(globalThis.__testUserId);
    const res = await client.callTool({ name: "get_application", arguments: { id: "abc" } });
    expect(res.isError).toBe(true);
  });

  it("exposes the triage_job_emails prompt", async () => {
    const client = await connect(globalThis.__testUserId);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("triage_job_emails");
    const triage = prompts.find((p) => p.name === "triage_job_emails")!;
    expect(triage.description).toBeTruthy();
    const res = await client.getPrompt({ name: "triage_job_emails", arguments: { days: "3" } });
    const body = (res.messages[0].content as { type: string; text: string }).text;
    expect(body).toContain("newer_than:3d");
    expect(body).toContain("ingest_email");
    expect(body).toContain("apply_email_actions");
  });
});
