import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/docx-pdf", () => ({ docxToPdf: vi.fn(async () => Buffer.from("%PDF-fake")) }));

import JSZip from "jszip";
import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";
import { GET as EXPORT } from "./export/route";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { req, anonReq, ctx, seedUser } from "@/test/req";

beforeEach(async () => {
  await db.delete(schema.inventions);
});

async function create(body: Record<string, unknown>) {
  const res = await POST(req("/api/inventions", "POST", body));
  expect(res.status).toBe(200);
  return (await res.json()).id as number;
}

describe("inventions CRUD", () => {
  it("requires auth", async () => {
    expect((await GET(anonReq("/api/inventions"))).status).toBe(401);
    expect((await POST(anonReq("/api/inventions", "POST", { title: "x" }))).status).toBe(401);
    expect((await EXPORT(anonReq("/api/inventions/export?fmt=text"))).status).toBe(401);
  });

  it("validates input", async () => {
    expect((await POST(req("/api/inventions", "POST", { description: "no title" }))).status).toBe(400);
    expect((await POST(req("/api/inventions", "POST", [{ title: "ok" }, { title: "" }]))).status).toBe(400);
  });

  it("creates (appending order), bulk-creates, lists, patches and deletes", async () => {
    const a = await create({ title: "Limiter", technologies: "Go", includeInResume: true });
    const bulk = await (await POST(req("/api/inventions", "POST", [{ title: "Parser" }, { title: "Book", kind: "authorship" }]))).json();
    expect(bulk.ids).toHaveLength(2);

    const list = await (await GET(req("/api/inventions"))).json();
    expect(list.map((i: { title: string }) => i.title)).toEqual(["Limiter", "Parser", "Book"]);
    expect(list[0]).toMatchObject({ technologies: ["Go"], includeInResume: true, kind: "software" });

    expect((await PATCH(req("/x", "PATCH", { includeInResume: false, description: "Token bucket" }), ctx(a))).status).toBe(200);
    expect((await PATCH(req("/x", "PATCH", { kind: "nope" }), ctx(a))).status).toBe(400);
    const [row] = await db.select().from(schema.inventions).where(eq(schema.inventions.id, a));
    expect(row).toMatchObject({ includeInResume: false, description: "Token bucket" });

    expect((await DELETE(req("/x", "DELETE"), ctx(a))).status).toBe(200);
    expect((await DELETE(req("/x", "DELETE"), ctx(a))).status).toBe(404);
  });

  it("isolates users", async () => {
    const a = await create({ title: "Mine" });
    const other = await seedUser("other-inv");
    expect(await (await GET(other.req("/api/inventions"))).json()).toEqual([]);
    expect((await PATCH(other.req("/x", "PATCH", { title: "hax" }), ctx(a))).status).toBe(404);
    expect((await DELETE(other.req("/x", "DELETE"), ctx(a))).status).toBe(404);
    const text = await (await EXPORT(other.req(`/api/inventions/export?fmt=text&ids=${a}`))).text();
    expect(text).not.toContain("Mine");
  });
});

describe("GET /api/inventions/export", () => {
  it("exports text, docx and pdf, optionally limited to ids", async () => {
    const a = await create({ title: "Limiter", inventionDate: "2019", notes: "PRIVATE NOTE" });
    await create({ title: "Parser" });

    const text = await EXPORT(req(`/api/inventions/export?fmt=text&ids=${a}`));
    expect(text.headers.get("content-type")).toMatch(/text\/plain/);
    const body = await text.text();
    expect(body).toContain("1. Limiter (2019)");
    expect(body).not.toContain("Parser");
    expect(body).not.toContain("PRIVATE NOTE");

    const docx = await EXPORT(req("/api/inventions/export?fmt=docx"));
    expect(docx.headers.get("content-disposition")).toContain("Exhibit_A.docx");
    const xml = await (await JSZip.loadAsync(Buffer.from(await docx.arrayBuffer()))).file("word/document.xml")!.async("string");
    expect(xml).toContain("Limiter");
    expect(xml).toContain("Parser");

    const pdf = await EXPORT(req("/api/inventions/export?fmt=pdf"));
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).toString()).toBe("%PDF-fake");

    expect((await EXPORT(req("/api/inventions/export?fmt=rtf"))).status).toBe(400);
  });
});
