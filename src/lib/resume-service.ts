import { db, schema } from "@/db";
import { eq, desc, and } from "drizzle-orm";
import { generateResumeContent, adjustForLength } from "./llm";
import { renderResume } from "./render-resume";
import type { ResumeContent } from "./resume-content";
import { logEvent } from "./events";

function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "resume";
}

// A descriptive filename stem, e.g. "Jane_Doe_Resume_Globex_v2".
function baseNameFor(content: ResumeContent, company: string, version: number): string {
  return `${slug(content.contact.name)}_Resume_${slug(company)}_v${version}`;
}

// Render content, looping up to 2 tries to reach exactly 2 pages.
async function renderWithPageFit(
  userId: string,
  version: number,
  company: string,
  content: ResumeContent,
): Promise<{ content: ResumeContent; baseName: string; docx: Buffer; pdf: Buffer; pageCount: number; fitWarning: string | null }> {
  let current = content;
  let baseName = baseNameFor(current, company, version);
  let result = await renderResume(current, baseName);

  let attempts = 0;
  while (result.pageCount !== 2 && attempts < 2) {
    const direction = result.pageCount < 2 ? "expand" : "condense";
    current = await adjustForLength(userId, current, direction, result.pageCount);
    baseName = baseNameFor(current, company, version);
    result = await renderResume(current, baseName);
    attempts++;
  }
  const fitWarning = result.pageCount === 2 ? null : `Resume is ${result.pageCount} pages (target is 2).`;
  return { content: current, baseName, ...result, fitWarning };
}

export async function createResumeForApplication(userId: string, applicationId: number): Promise<number> {
  const [app] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.id, applicationId), eq(schema.applications.userId, userId)))
    .limit(1);
  if (!app) throw new Error("Application not found");

  const content = await generateResumeContent(userId, {
    company: app.company,
    roleTitle: app.roleTitle,
    jdSnapshot: app.jdSnapshot || app.sourceRaw || "",
    techStack: app.techStack,
  });

  const prev = await db
    .select({ version: schema.resumes.version })
    .from(schema.resumes)
    .where(and(eq(schema.resumes.applicationId, applicationId), eq(schema.resumes.userId, userId)))
    .orderBy(desc(schema.resumes.version));
  const version = (prev[0]?.version ?? 0) + 1;

  const fit = await renderWithPageFit(userId, version, app.company, content);

  const [inserted] = await db
    .insert(schema.resumes)
    .values({
      userId,
      applicationId,
      version,
      status: "draft",
      contentJson: JSON.stringify(fit.content),
      chatJson: "[]",
      baseName: fit.baseName,
      docxData: fit.docx,
      pdfData: fit.pdf,
      pageCount: fit.pageCount,
      fitWarning: fit.fitWarning,
    })
    .returning({ id: schema.resumes.id });

  await logEvent(userId, applicationId, "resume_generated", `v${version} (${fit.pageCount} pages)`);
  return inserted.id;
}

// Re-render an existing resume row after its content changed.
export async function rerenderResume(userId: string, resumeId: number, newContent: ResumeContent): Promise<void> {
  const [resume] = await db
    .select()
    .from(schema.resumes)
    .where(and(eq(schema.resumes.id, resumeId), eq(schema.resumes.userId, userId)))
    .limit(1);
  if (!resume) throw new Error("Resume not found");
  const [app] = await db
    .select()
    .from(schema.applications)
    .where(and(eq(schema.applications.id, resume.applicationId), eq(schema.applications.userId, userId)))
    .limit(1);
  if (!app) throw new Error("Application not found");

  const fit = await renderWithPageFit(userId, resume.version, app.company, newContent);
  await db
    .update(schema.resumes)
    .set({
      contentJson: JSON.stringify(fit.content),
      baseName: fit.baseName,
      docxData: fit.docx,
      pdfData: fit.pdf,
      pageCount: fit.pageCount,
      fitWarning: fit.fitWarning,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.resumes.id, resumeId), eq(schema.resumes.userId, userId)));
}
