import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { insertApp, seedUser } from "@/test/req";
import { NotFoundError } from "./errors";
import { getResumeFile } from "./resumes";

const uid = () => globalThis.__testUserId;

describe("getResumeFile", () => {
  it("returns bytes, filename and content type per format", async () => {
    const appId = await insertApp();
    const [r] = await db
      .insert(schema.resumes)
      .values({
        userId: uid(),
        applicationId: appId,
        version: 2,
        contentJson: "{}",
        baseName: "Jane_Doe_Acme",
        pdfData: Buffer.from("PDF"),
      })
      .returning({ id: schema.resumes.id });

    const pdf = await getResumeFile(uid(), r.id, "pdf");
    expect(pdf.filename).toBe("Jane_Doe_Acme.pdf");
    expect(pdf.contentType).toBe("application/pdf");
    expect(Buffer.from(pdf.data).toString()).toBe("PDF");

    await expect(getResumeFile(uid(), r.id, "docx")).rejects.toThrow("No docx available");
  });

  it("falls back to a versioned filename and hides other users' resumes", async () => {
    const other = await seedUser("resumes-svc-other");
    const appId = await insertApp();
    const [r] = await db
      .insert(schema.resumes)
      .values({ userId: uid(), applicationId: appId, version: 3, contentJson: "{}", docxData: Buffer.from("D") })
      .returning({ id: schema.resumes.id });
    const docx = await getResumeFile(uid(), r.id, "docx");
    expect(docx.filename).toBe("resume_v3.docx");
    expect(docx.contentType).toContain("wordprocessingml");
    await expect(getResumeFile(other.id, r.id, "docx")).rejects.toBeInstanceOf(NotFoundError);
  });
});
