import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock text extraction so file uploads don't depend on poppler/LibreOffice.
vi.mock("@/lib/extract-text", () => ({
  extractJobDescriptionText: vi.fn(),
}));

import { NextRequest } from "next/server";
import { PUT } from "./route";
import { extractJobDescriptionText } from "@/lib/extract-text";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const mockExtract = vi.mocked(extractJobDescriptionText);

// Build a multipart NextRequest carrying an uploaded job-description file.
function uploadReq(url: string, file: File, cookie = globalThis.__testCookie ?? "") {
  const form = new FormData();
  form.set("file", file);
  return new NextRequest(`http://localhost${url}`, { method: "PUT", headers: { cookie }, body: form });
}

beforeEach(() => {
  mockExtract.mockReset();
});

describe("PUT /api/applications/[id]/job-description", () => {
  it("amends the job description from a JSON body and logs an event", async () => {
    const appId = await insertApp({ jdSnapshot: "old" });
    const res = await PUT(
      req(`/api/applications/${appId}/job-description`, "PUT", { jdSnapshot: "brand new JD" }),
      ctx(appId),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).jdSnapshot).toBe("brand new JD");

    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, appId));
    expect(app.jdSnapshot).toBe("brand new JD");

    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, appId));
    expect(events.some((e) => e.type === "jd_updated")).toBe(true);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  it("extracts text from an uploaded file and stores it", async () => {
    mockExtract.mockResolvedValue("Extracted posting text.");
    const appId = await insertApp({ jdSnapshot: "old" });
    const file = new File([new Uint8Array([1, 2, 3])], "posting.pdf", { type: "application/pdf" });
    const res = await PUT(uploadReq(`/api/applications/${appId}/job-description`, file), ctx(appId));

    expect(res.status).toBe(200);
    expect((await res.json()).jdSnapshot).toBe("Extracted posting text.");
    expect(mockExtract).toHaveBeenCalledOnce();

    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, appId));
    expect(app.jdSnapshot).toBe("Extracted posting text.");
    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, appId));
    expect(events.some((e) => e.type === "jd_updated" && (e.detail ?? "").includes("posting.pdf"))).toBe(true);
  });

  it("rejects a file that yields no text", async () => {
    mockExtract.mockResolvedValue("   \n  ");
    const appId = await insertApp();
    const file = new File([new Uint8Array([1])], "empty.pdf", { type: "application/pdf" });
    const res = await PUT(uploadReq(`/api/applications/${appId}/job-description`, file), ctx(appId));
    expect(res.status).toBe(400);
    const [app] = await db.select().from(schema.applications).where(eq(schema.applications.id, appId));
    expect(app.jdSnapshot).toBe("jd"); // unchanged (insertApp default)
  });

  it("returns 400 for an unsupported file type", async () => {
    mockExtract.mockRejectedValue(new Error("Unsupported job description file type (image/png)."));
    const appId = await insertApp();
    const file = new File([new Uint8Array([1])], "logo.png", { type: "image/png" });
    const res = await PUT(uploadReq(`/api/applications/${appId}/job-description`, file), ctx(appId));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Unsupported");
  });

  it("returns 400 when no file is provided in a multipart body", async () => {
    const appId = await insertApp();
    const request = new NextRequest(`http://localhost/api/applications/${appId}/job-description`, {
      method: "PUT",
      headers: { cookie: globalThis.__testCookie ?? "" },
      body: new FormData(),
    });
    const res = await PUT(request, ctx(appId));
    expect(res.status).toBe(400);
  });

  it("rejects a JSON body without jdSnapshot", async () => {
    const appId = await insertApp();
    const res = await PUT(req(`/api/applications/${appId}/job-description`, "PUT", {}), ctx(appId));
    expect(res.status).toBe(400);
  });

  it("returns 404 for another user's application", async () => {
    const other = await seedUser("jd-other");
    const appId = await insertApp({ userId: other.id });
    const res = await PUT(
      req(`/api/applications/${appId}/job-description`, "PUT", { jdSnapshot: "x" }),
      ctx(appId),
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await PUT(
      anonReq(`/api/applications/1/job-description`, "PUT", { jdSnapshot: "x" }),
      ctx(1),
    );
    expect(res.status).toBe(401);
  });
});
