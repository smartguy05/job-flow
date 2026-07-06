import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ generateDraft: vi.fn() }));

import { POST } from "./route";
import { generateDraft } from "@/lib/llm";
import { req, ctx, insertApp } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const mockDraft = vi.mocked(generateDraft);

beforeEach(() => {
  mockDraft.mockReset();
  mockDraft.mockResolvedValue("Hi Sarah, I'm interested.");
});

describe("POST /api/applications/[id]/drafts", () => {
  it("generates and stores a draft", async () => {
    const id = await insertApp();
    const res = await POST(req(`/api/applications/${id}/drafts`, "POST", { type: "reply" }), ctx(id));
    const body = await res.json();
    expect(body.content).toContain("Sarah");
    expect(body.type).toBe("reply");
    const stored = await db.select().from(schema.messageDrafts).where(eq(schema.messageDrafts.applicationId, id));
    expect(stored).toHaveLength(1);
  });

  it("passes the recruiter's name from the linked contact", async () => {
    const [contact] = await db
      .insert(schema.contacts)
      .values({ userId: globalThis.__testUserId, name: "Dana" })
      .returning({ id: schema.contacts.id });
    const id = await insertApp({ contactId: contact.id });
    await POST(req(`/api/applications/${id}/drafts`, "POST", { type: "cover_letter" }), ctx(id));
    expect(mockDraft.mock.calls[0][0].contactName).toBe("Dana");
  });

  it("returns 404 for an unknown application", async () => {
    const res = await POST(req(`/api/applications/999/drafts`, "POST", { type: "reply" }), ctx(999));
    expect(res.status).toBe(404);
  });
});
