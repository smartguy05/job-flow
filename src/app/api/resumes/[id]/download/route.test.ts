import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { req, ctx, insertApp } from "@/test/req";
import { db, schema } from "@/db";

async function insertResume(over: Record<string, unknown> = {}) {
  const [row] = await db
    .insert(schema.resumes)
    .values({
      userId: globalThis.__testUserId,
      applicationId: await insertApp(),
      version: 1,
      status: "draft",
      contentJson: "{}",
      chatJson: "[]",
      ...over,
    })
    .returning({ id: schema.resumes.id });
  return row.id;
}

describe("GET /api/resumes/[id]/download", () => {
  it("404s for a missing resume", async () => {
    const res = await GET(req("/api/resumes/999/download?fmt=pdf"), ctx(999));
    expect(res.status).toBe(404);
  });

  it("404s when the requested format has no data", async () => {
    const rid = await insertResume();
    const res = await GET(req(`/api/resumes/${rid}/download?fmt=pdf`), ctx(rid));
    expect(res.status).toBe(404);
  });

  it("streams the pdf bytes with attachment headers", async () => {
    const rid = await insertResume({
      docxData: Buffer.from("PK.."),
      pdfData: Buffer.from("%PDF-1.4"),
      baseName: "Test_Resume_v1",
    });

    const res = await GET(req(`/api/resumes/${rid}/download?fmt=pdf`), ctx(rid));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain("Test_Resume_v1.pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.toString()).toBe("%PDF-1.4");
  });

  it("uses inline disposition when requested", async () => {
    const rid = await insertResume({
      pdfData: Buffer.from("%PDF-1.4"),
      baseName: "Test_Resume_v1",
    });

    const res = await GET(req(`/api/resumes/${rid}/download?fmt=pdf&inline=1`), ctx(rid));
    expect(res.headers.get("Content-Disposition")).toContain("inline");
  });
});
