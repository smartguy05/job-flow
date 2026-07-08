import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./llm", () => ({ generateResumeContent: vi.fn(), adjustForLength: vi.fn() }));
vi.mock("./render-resume", () => ({ renderResume: vi.fn() }));

import { generateResumeContent, adjustForLength } from "./llm";
import { renderResume } from "./render-resume";
import { createResumeForApplication, rerenderResume } from "./resume-service";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { makeResumeContent } from "@/test/fixtures";

const mockGen = vi.mocked(generateResumeContent);
const mockAdjust = vi.mocked(adjustForLength);
const mockRender = vi.mocked(renderResume);

const userId = () => globalThis.__testUserId;

async function makeApp() {
  const [row] = await db
    .insert(schema.applications)
    .values({
      userId: globalThis.__testUserId,
      company: "Globex Corp",
      companyNormalized: "globex",
      roleTitle: "AI Engineer",
      status: "applied",
      jdSnapshot: "jd text",
      lastActivityAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: schema.applications.id });
  return row;
}

function render(pageCount: number, lastPageFill = 0.85) {
  return { docx: Buffer.from("docx"), pdf: Buffer.from("pdf"), pageCount, lastPageFill };
}

beforeEach(() => {
  mockGen.mockReset();
  mockAdjust.mockReset();
  mockRender.mockReset();
  mockGen.mockResolvedValue(makeResumeContent());
  mockAdjust.mockResolvedValue(makeResumeContent({ summary: "adjusted" }));
});

describe("createResumeForApplication", () => {
  it("persists a v1 draft and logs an event when the first render is 2 pages", async () => {
    const app = await makeApp();
    mockRender.mockResolvedValue(render(2));

    const resumeId = await createResumeForApplication(userId(), app.id);
    const [resume] = await db.select().from(schema.resumes).where(eq(schema.resumes.id, resumeId)).limit(1);
    expect(resume.version).toBe(1);
    expect(resume.status).toBe("draft");
    expect(resume.pageCount).toBe(2);
    expect(resume.fitWarning).toBeNull();
    expect(mockAdjust).not.toHaveBeenCalled();

    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, app.id));
    expect(events.some((e) => e.type === "resume_generated")).toBe(true);
  });

  it("runs the expand path once when the first render is 1 page then hits 2", async () => {
    const app = await makeApp();
    mockRender.mockResolvedValueOnce(render(1)).mockResolvedValueOnce(render(2));

    const resumeId = await createResumeForApplication(userId(), app.id);
    expect(mockAdjust).toHaveBeenCalledOnce();
    expect(mockAdjust.mock.calls[0][2]).toBe("expand");
    const [resume] = await db.select().from(schema.resumes).where(eq(schema.resumes.id, resumeId)).limit(1);
    expect(resume.pageCount).toBe(2);
    expect(resume.fitWarning).toBeNull();
  });

  it("runs the condense path when over length", async () => {
    const app = await makeApp();
    mockRender.mockResolvedValueOnce(render(3)).mockResolvedValueOnce(render(2));
    await createResumeForApplication(userId(), app.id);
    expect(mockAdjust.mock.calls[0][2]).toBe("condense");
  });

  it("expands when 2 pages but the last page is under-filled, then settles", async () => {
    const app = await makeApp();
    mockRender.mockResolvedValueOnce(render(2, 0.45)).mockResolvedValueOnce(render(2, 0.9));

    const resumeId = await createResumeForApplication(userId(), app.id);
    expect(mockAdjust).toHaveBeenCalledOnce();
    expect(mockAdjust.mock.calls[0][2]).toBe("expand");
    expect(mockAdjust.mock.calls[0][4]).toBe(0.45); // fill ratio is passed through
    const [resume] = await db.select().from(schema.resumes).where(eq(schema.resumes.id, resumeId)).limit(1);
    expect(resume.pageCount).toBe(2);
    expect(resume.fitWarning).toBeNull();
  });

  it("does not adjust when the first render is 2 full pages", async () => {
    const app = await makeApp();
    mockRender.mockResolvedValue(render(2, 0.9));
    const resumeId = await createResumeForApplication(userId(), app.id);
    expect(mockAdjust).not.toHaveBeenCalled();
    const [resume] = await db.select().from(schema.resumes).where(eq(schema.resumes.id, resumeId)).limit(1);
    expect(resume.fitWarning).toBeNull();
  });

  it("warns about an under-filled last page when it never fills", async () => {
    const app = await makeApp();
    mockRender.mockResolvedValue(render(2, 0.4)); // stays 2 pages but half-empty
    const resumeId = await createResumeForApplication(userId(), app.id);
    expect(mockAdjust).toHaveBeenCalledTimes(3);
    const [resume] = await db.select().from(schema.resumes).where(eq(schema.resumes.id, resumeId)).limit(1);
    expect(resume.fitWarning).toMatch(/only 40% full/);
  });

  it("sets a fitWarning and stops after 3 attempts when it never reaches 2 pages", async () => {
    const app = await makeApp();
    mockRender.mockResolvedValue(render(1)); // never converges
    const resumeId = await createResumeForApplication(userId(), app.id);
    expect(mockAdjust).toHaveBeenCalledTimes(3);
    const [resume] = await db.select().from(schema.resumes).where(eq(schema.resumes.id, resumeId)).limit(1);
    expect(resume.fitWarning).toMatch(/1 pages/);
  });

  it("increments the version on subsequent generations", async () => {
    const app = await makeApp();
    mockRender.mockResolvedValue(render(2));
    await createResumeForApplication(userId(), app.id);
    const secondId = await createResumeForApplication(userId(), app.id);
    const [second] = await db.select().from(schema.resumes).where(eq(schema.resumes.id, secondId)).limit(1);
    expect(second.version).toBe(2);
  });

  it("throws for a missing application", async () => {
    await expect(createResumeForApplication(userId(), 9999)).rejects.toThrow(/not found/i);
  });
});

describe("rerenderResume", () => {
  it("re-renders edited content and updates the stored bytes + page count", async () => {
    const app = await makeApp();
    mockRender.mockResolvedValue(render(2));
    const resumeId = await createResumeForApplication(userId(), app.id);

    mockRender.mockClear();
    mockRender.mockResolvedValue({ docx: Buffer.from("new-docx"), pdf: Buffer.from("new-pdf"), pageCount: 2, lastPageFill: 0.85 });
    const edited = makeResumeContent({ summary: "hand-edited summary" });
    await rerenderResume(userId(), resumeId, edited);

    const [resume] = await db.select().from(schema.resumes).where(eq(schema.resumes.id, resumeId)).limit(1);
    expect(JSON.parse(resume.contentJson).summary).toBe("hand-edited summary");
    expect(Buffer.from(resume.pdfData!).toString()).toBe("new-pdf");
    expect(Buffer.from(resume.docxData!).toString()).toBe("new-docx");
    expect(resume.pageCount).toBe(2);
    expect(mockRender).toHaveBeenCalledOnce();
  });

  it("throws for a missing resume", async () => {
    await expect(rerenderResume(userId(), 9999, makeResumeContent())).rejects.toThrow(/not found/i);
  });
});
