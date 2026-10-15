import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ classifyEmail: vi.fn() }));

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { classifyEmail } from "@/lib/llm";
import { insertApp, seedUser } from "@/test/req";
import { NotFoundError } from "@/lib/services/errors";
import { callTool, getTool } from "../registry";

const mockClassify = vi.mocked(classifyEmail);
const uid = () => globalThis.__testUserId;

beforeEach(() => {
  mockClassify.mockReset();
  mockClassify.mockResolvedValue({
    kind: "rejection", company: null, roleTitle: null, interviewAt: null, summary: "No", suggestedNextAction: null,
  });
});

const msg = (messageId: string, from: string) => ({
  messageId, from, subject: "Re: application", date: "2026-10-02", body: "Unfortunately...",
});

describe("ingest_email", () => {
  it("proposes by default and applies only with apply + a confident match", async () => {
    const id = await insertApp({ company: "Toolco", companyNormalized: "toolco" });
    const proposed = (await callTool("ingest_email", uid(), msg("t-1", "hr@toolco.com"))) as {
      applied: boolean; match: { applicationId: number }; proposedActions: { type: string }[];
    };
    expect(proposed.applied).toBe(false);
    expect(proposed.match.applicationId).toBe(id);
    expect(proposed.proposedActions.map((a) => a.type)).toEqual(["set_status", "log_event"]);

    const applied = (await callTool("ingest_email", uid(), { ...msg("t-1", "hr@toolco.com"), apply: true })) as {
      applied: boolean;
    };
    expect(applied.applied).toBe(true);
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id));
    expect(app.status).toBe("closed_lost");
  });

  it("validates its input", async () => {
    await expect(callTool("ingest_email", uid(), { messageId: "", from: "x", subject: "", body: "" })).rejects.toThrow();
    expect(getTool("ingest_email").annotations?.readOnlyHint).toBe(false);
  });

  it("does not see another user's applications", async () => {
    const other = await seedUser("emails-tool-other");
    await insertApp({ userId: other.id, company: "Secretco", companyNormalized: "secretco" });
    const out = (await callTool("ingest_email", uid(), { ...msg("t-2", "hr@secretco.com"), apply: true })) as {
      candidates: unknown[]; applied: boolean;
    };
    expect(out.candidates).toEqual([]);
    expect(out.applied).toBe(false);
  });
});

describe("apply_email_actions", () => {
  it("applies validated actions to the chosen application", async () => {
    const id = await insertApp({ company: "Pickme", companyNormalized: "pickme" });
    await callTool("ingest_email", uid(), msg("t-3", "someone@elsewhere.example"));
    const out = (await callTool("apply_email_actions", uid(), {
      messageId: "t-3",
      applicationId: id,
      actions: [{ type: "set_status", status: "closed_lost" }],
    })) as { applied: boolean };
    expect(out.applied).toBe(true);
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, id));
    expect(app.status).toBe("closed_lost");
  });

  it("rejects unknown action types and another user's application", async () => {
    const other = await seedUser("emails-tool-other-2");
    const theirs = await insertApp({ userId: other.id });
    await callTool("ingest_email", uid(), msg("t-4", "a@b.example"));
    await expect(
      callTool("apply_email_actions", uid(), { messageId: "t-4", applicationId: theirs, actions: [{ type: "drop_table" }] }),
    ).rejects.toThrow();
    await expect(
      callTool("apply_email_actions", uid(), { messageId: "t-4", applicationId: theirs, actions: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
