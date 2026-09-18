import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

// Build a multipart NextRequest carrying an uploaded file.
function uploadReq(
  url: string,
  file: File,
  cookie = globalThis.__testCookie ?? "",
  kind?: string,
) {
  const form = new FormData();
  form.set("file", file);
  if (kind !== undefined) form.set("kind", kind);
  return new NextRequest(`http://localhost${url}`, { method: "POST", headers: { cookie }, body: form });
}

const pdf = (name = "benefits.pdf", bytes = [1, 2, 3]) =>
  new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

const docx = (name = "resume.docx", bytes = [4, 5, 6]) =>
  new File([new Uint8Array(bytes)], name, {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

describe("POST /api/applications/[id]/files", () => {
  it("stores an uploaded PDF and returns its metadata", async () => {
    const appId = await insertApp();
    const res = await POST(uploadReq(`/api/applications/${appId}/files`, pdf()), ctx(appId));
    const body = await res.json();
    expect(body.name).toBe("benefits.pdf");
    expect(body.mimeType).toBe("application/pdf");
    expect(body.size).toBe(3);

    const [row] = await db
      .select()
      .from(schema.applicationFiles)
      .where(eq(schema.applicationFiles.applicationId, appId));
    expect(row.data).toEqual(Buffer.from([1, 2, 3]));
    expect(row.kind).toBe("benefits");

    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, appId));
    expect(events.some((e) => e.type === "file_uploaded")).toBe(true);
  });

  it("rejects a non-PDF file", async () => {
    const appId = await insertApp();
    const bad = new File([new Uint8Array([1])], "notes.txt", { type: "text/plain" });
    const res = await POST(uploadReq(`/api/applications/${appId}/files`, bad), ctx(appId));
    expect(res.status).toBe(400);
    const rows = await db.select().from(schema.applicationFiles).where(eq(schema.applicationFiles.applicationId, appId));
    expect(rows).toHaveLength(0);
  });

  it("returns 400 when no file is provided", async () => {
    const appId = await insertApp();
    const form = new FormData();
    const request = new NextRequest(`http://localhost/api/applications/${appId}/files`, {
      method: "POST",
      headers: { cookie: globalThis.__testCookie ?? "" },
      body: form,
    });
    const res = await POST(request, ctx(appId));
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's application", async () => {
    const other = await seedUser("files-other");
    const appId = await insertApp({ userId: other.id });
    const res = await POST(uploadReq(`/api/applications/${appId}/files`, pdf()), ctx(appId));
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const form = new FormData();
    form.set("file", pdf());
    const request = new NextRequest(`http://localhost/api/applications/1/files`, { method: "POST", body: form });
    const res = await POST(request, ctx(1));
    expect(res.status).toBe(401);
  });

  it.each(["resume", "cover_letter", "message"] as const)(
    "accepts a PDF for kind=%s",
    async (kind) => {
      const appId = await insertApp();
      const res = await POST(
        uploadReq(`/api/applications/${appId}/files`, pdf(`${kind}.pdf`), undefined, kind),
        ctx(appId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.kind).toBe(kind);
      expect(body.mimeType).toBe("application/pdf");

      const [row] = await db
        .select()
        .from(schema.applicationFiles)
        .where(eq(schema.applicationFiles.applicationId, appId));
      expect(row.kind).toBe(kind);
      expect(row.mimeType).toBe("application/pdf");
      expect(row.data).toEqual(Buffer.from([1, 2, 3]));
    },
  );

  it.each(["resume", "cover_letter", "message"] as const)(
    "accepts a DOCX for kind=%s",
    async (kind) => {
      const appId = await insertApp();
      const res = await POST(
        uploadReq(`/api/applications/${appId}/files`, docx(`${kind}.docx`), undefined, kind),
        ctx(appId),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.kind).toBe(kind);
      expect(body.mimeType).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );

      const [row] = await db
        .select()
        .from(schema.applicationFiles)
        .where(eq(schema.applicationFiles.applicationId, appId));
      expect(row.kind).toBe(kind);
      expect(row.mimeType).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(row.data).toEqual(Buffer.from([4, 5, 6]));
    },
  );

  it("rejects a DOCX for kind=benefits", async () => {
    const appId = await insertApp();
    const res = await POST(
      uploadReq(`/api/applications/${appId}/files`, docx(), undefined, "benefits"),
      ctx(appId),
    );
    expect(res.status).toBe(400);
    const rows = await db
      .select()
      .from(schema.applicationFiles)
      .where(eq(schema.applicationFiles.applicationId, appId));
    expect(rows).toHaveLength(0);
  });

  it("rejects an unknown kind", async () => {
    const appId = await insertApp();
    const res = await POST(
      uploadReq(`/api/applications/${appId}/files`, pdf(), undefined, "bogus"),
      ctx(appId),
    );
    expect(res.status).toBe(400);
    const rows = await db
      .select()
      .from(schema.applicationFiles)
      .where(eq(schema.applicationFiles.applicationId, appId));
    expect(rows).toHaveLength(0);
  });

  it("defaults to kind=benefits when no kind field is sent", async () => {
    const appId = await insertApp();
    const res = await POST(uploadReq(`/api/applications/${appId}/files`, pdf()), ctx(appId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe("benefits");
  });
});

describe("GET /api/applications/[id]/files", () => {
  it("lists file metadata without bytes", async () => {
    const appId = await insertApp();
    await POST(uploadReq(`/api/applications/${appId}/files`, pdf("a.pdf")), ctx(appId));
    const res = await GET(req(`/api/applications/${appId}/files`), ctx(appId));
    const list = await res.json();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("a.pdf");
    expect(list[0].data).toBeUndefined();
  });

  it("does not leak another user's files", async () => {
    const other = await seedUser("files-list-other");
    const appId = await insertApp({ userId: other.id });
    const res = await GET(req(`/api/applications/${appId}/files`), ctx(appId));
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await GET(anonReq(`/api/applications/1/files`), ctx(1));
    expect(res.status).toBe(401);
  });
});
