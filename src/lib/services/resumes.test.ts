import { describe, it, expect } from "vitest";
import { db, schema } from "@/db";
import { insertApp, seedUser } from "@/test/req";
import { NotFoundError, ValidationError } from "./errors";
import { getResumeFile, getResumeSummary, parseVariantLabel, VARIANT_LABEL_MAX } from "./resumes";

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

describe("getResumeSummary", () => {
  it("returns metadata (never blobs) for the user's own resume only", async () => {
    const appId = await insertApp();
    const [r] = await db
      .insert(schema.resumes)
      .values({
        userId: uid(),
        applicationId: appId,
        version: 3,
        status: "draft",
        contentJson: "{}",
        chatJson: "[]",
        pageCount: 2,
        pdfData: Buffer.from("%PDF"),
      })
      .returning({ id: schema.resumes.id });
    const s = await getResumeSummary(uid(), r.id);
    expect(s).toEqual({
      id: r.id,
      applicationId: appId,
      version: 3,
      status: "draft",
      pageCount: 2,
      fitWarning: null,
      hasPdf: true,
      hasDocx: false,
    });
    const other = await seedUser("resume-summary-other");
    await expect(getResumeSummary(other.id, r.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("parseVariantLabel", () => {
  it("trims, maps empty/null to null, and rejects bad input", () => {
    expect(parseVariantLabel("  ML ")).toBe("ML");
    expect(parseVariantLabel("   ")).toBeNull();
    expect(parseVariantLabel(null)).toBeNull();
    expect(() => parseVariantLabel(3)).toThrow(ValidationError);
    expect(() => parseVariantLabel("x".repeat(VARIANT_LABEL_MAX + 1))).toThrow(ValidationError);
  });
});
