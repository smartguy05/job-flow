import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ generateDraft: vi.fn() }));

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { generateDraft } from "@/lib/llm";
import { insertApp, seedUser } from "@/test/req";
import { NotFoundError, ValidationError } from "./errors";
import { createDraft } from "./drafts";

const mockDraft = vi.mocked(generateDraft);
const uid = () => globalThis.__testUserId;

beforeEach(() => {
  mockDraft.mockReset();
  mockDraft.mockResolvedValue("Dear team,");
});

describe("createDraft", () => {
  it("generates, stores and logs a draft (default type reply)", async () => {
    const id = await insertApp();
    const d = await createDraft(uid(), id, {});
    expect(d).toMatchObject({ content: "Dear team,", type: "reply" });
    const rows = await db.select().from(schema.messageDrafts).where(eq(schema.messageDrafts.applicationId, id));
    expect(rows).toHaveLength(1);
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, id));
    expect(events.map((e) => e.detail)).toContain("Generated reply draft");
  });

  it("passes type, extra and the user's own contact name to the LLM", async () => {
    const [c] = await db.insert(schema.contacts).values({ userId: uid(), name: "Sarah" }).returning();
    const id = await insertApp({ contactId: c.id, jdSnapshot: "Build things" });
    await createDraft(uid(), id, { type: "cover_letter", extra: "mention Go" });
    expect(mockDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: uid(),
        type: "cover_letter",
        contactName: "Sarah",
        extra: "mention Go",
        job: expect.objectContaining({ company: "Globex Corp", jdSnapshot: "Build things" }),
      }),
    );
  });

  it("rejects an unknown type", async () => {
    const id = await insertApp();
    await expect(createDraft(uid(), id, { type: "poem" as never })).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses another user's application", async () => {
    const other = await seedUser("drafts-other");
    const id = await insertApp({ userId: other.id });
    await expect(createDraft(uid(), id, {})).rejects.toBeInstanceOf(NotFoundError);
    expect(mockDraft).not.toHaveBeenCalled();
  });
});
