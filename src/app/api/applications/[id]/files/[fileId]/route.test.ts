import { describe, it, expect } from "vitest";
import { GET, DELETE } from "./route";
import { req, anonReq, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const fileCtx = (id: number | string, fileId: number | string) => ({
  params: Promise.resolve({ id: String(id), fileId: String(fileId) }),
});

async function insertFile(applicationId: number, userId = globalThis.__testUserId, name = "b.pdf") {
  const [row] = await db
    .insert(schema.applicationFiles)
    .values({
      userId,
      applicationId,
      kind: "benefits",
      name,
      mimeType: "application/pdf",
      size: 3,
      data: Buffer.from([1, 2, 3]),
    })
    .returning({ id: schema.applicationFiles.id });
  return row.id;
}

describe("GET /api/applications/[id]/files/[fileId]", () => {
  it("returns the file bytes with content headers", async () => {
    const appId = await insertApp();
    const fileId = await insertFile(appId);
    const res = await GET(req(`/api/applications/${appId}/files/${fileId}`), fileCtx(appId, fileId));
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("b.pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf).toEqual(Buffer.from([1, 2, 3]));
  });

  it("returns 404 for another user's file", async () => {
    const other = await seedUser("file-dl-other");
    const appId = await insertApp({ userId: other.id });
    const fileId = await insertFile(appId, other.id);
    const res = await GET(req(`/api/applications/${appId}/files/${fileId}`), fileCtx(appId, fileId));
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await GET(anonReq(`/api/applications/1/files/1`), fileCtx(1, 1));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/applications/[id]/files/[fileId]", () => {
  it("deletes an owned file", async () => {
    const appId = await insertApp();
    const fileId = await insertFile(appId);
    const res = await DELETE(req(`/api/applications/${appId}/files/${fileId}`, "DELETE"), fileCtx(appId, fileId));
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.applicationFiles).where(eq(schema.applicationFiles.id, fileId));
    expect(rows).toHaveLength(0);
  });

  it("returns 404 deleting another user's file", async () => {
    const other = await seedUser("file-del-other");
    const appId = await insertApp({ userId: other.id });
    const fileId = await insertFile(appId, other.id);
    const res = await DELETE(req(`/api/applications/${appId}/files/${fileId}`, "DELETE"), fileCtx(appId, fileId));
    expect(res.status).toBe(404);
    const rows = await db.select().from(schema.applicationFiles).where(eq(schema.applicationFiles.id, fileId));
    expect(rows).toHaveLength(1);
  });
});
