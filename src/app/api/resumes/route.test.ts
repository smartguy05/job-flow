import { describe, it, expect } from "vitest";
import { GET } from "./route";
import { req, anonReq, insertApp } from "@/test/req";
import { db, schema } from "@/db";
import { makeResumeContent } from "@/test/fixtures";

async function insertResume(appId: number, version = 1) {
  const [row] = await db
    .insert(schema.resumes)
    .values({
      userId: globalThis.__testUserId,
      applicationId: appId,
      version,
      status: "draft",
      contentJson: JSON.stringify(makeResumeContent()),
      chatJson: "[]",
      pageCount: 2,
    })
    .returning({ id: schema.resumes.id });
  return row.id;
}

describe("GET /api/resumes", () => {
  it("lists the user's resumes with their application company/role", async () => {
    const appId = await insertApp({ company: "Globex Corp", roleTitle: "AI Engineer" });
    const rid = await insertResume(appId);
    const res = await GET(req("/api/resumes"));
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const row = body.find((r: { id: number }) => r.id === rid);
    expect(row).toMatchObject({ applicationId: appId, company: "Globex Corp", roleTitle: "AI Engineer", version: 1 });
    // Blobs are never included in the listing.
    expect(row.docxData).toBeUndefined();
    expect(row.pdfData).toBeUndefined();
  });

  it("401s without auth", async () => {
    const res = await GET(anonReq("/api/resumes"));
    expect(res.status).toBe(401);
  });
});
