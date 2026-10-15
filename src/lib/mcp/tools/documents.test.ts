import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ generateDraft: vi.fn() }));
vi.mock("@/lib/resume-service", () => ({ createResumeForApplication: vi.fn() }));

import { db, schema } from "@/db";
import { generateDraft } from "@/lib/llm";
import { createResumeForApplication } from "@/lib/resume-service";
import { insertApp, seedUser } from "@/test/req";
import { NotFoundError } from "@/lib/services/errors";
import { callTool } from "../registry";

const uid = () => globalThis.__testUserId;
const mockDraft = vi.mocked(generateDraft);
const mockCreate = vi.mocked(createResumeForApplication);

beforeEach(() => {
  mockDraft.mockReset();
  mockCreate.mockReset();
});

describe("generate_resume", () => {
  it("returns the new version with absolute download URLs", async () => {
    const appId = await insertApp();
    const [r] = await db
      .insert(schema.resumes)
      .values({ userId: uid(), applicationId: appId, version: 2, contentJson: "{}", pageCount: 2, pdfData: Buffer.from("x"), docxData: Buffer.from("y") })
      .returning();
    mockCreate.mockResolvedValue(r.id);
    const out = await callTool("generate_resume", uid(), { applicationId: appId });
    expect(mockCreate).toHaveBeenCalledWith(uid(), appId);
    expect(out).toMatchObject({
      resumeId: r.id,
      version: 2,
      pageCount: 2,
      downloads: {
        pdf: `http://localhost:3000/api/resumes/${r.id}/download?fmt=pdf`,
        docx: `http://localhost:3000/api/resumes/${r.id}/download?fmt=docx`,
      },
      applicationUrl: `http://localhost:3000/applications/${appId}`,
    });
  });

  it("maps a not-found application (e.g. another user's) to NotFoundError", async () => {
    const other = await seedUser("resume-other");
    const theirs = await insertApp({ userId: other.id });
    mockCreate.mockRejectedValue(new Error("Application not found"));
    await expect(callTool("generate_resume", uid(), { applicationId: theirs })).rejects.toBeInstanceOf(NotFoundError);
    expect(mockCreate).toHaveBeenCalledWith(uid(), theirs);
  });
});

describe("draft_message", () => {
  it("generates and stores a draft", async () => {
    mockDraft.mockResolvedValue("Thanks for reaching out!");
    const appId = await insertApp();
    const out = await callTool("draft_message", uid(), { applicationId: appId, type: "follow_up", extra: "keep short" });
    expect(out).toMatchObject({ content: "Thanks for reaching out!", type: "follow_up" });
    expect(mockDraft).toHaveBeenCalledWith(expect.objectContaining({ type: "follow_up", extra: "keep short" }));
  });

  it("refuses another user's application", async () => {
    const other = await seedUser("draft-tool-other");
    const theirs = await insertApp({ userId: other.id });
    await expect(callTool("draft_message", uid(), { applicationId: theirs })).rejects.toBeInstanceOf(NotFoundError);
    expect(mockDraft).not.toHaveBeenCalled();
  });
});
