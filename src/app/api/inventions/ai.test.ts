import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ draftInvention: vi.fn(), suggestInventions: vi.fn(), extractInventions: vi.fn() }));
vi.mock("@/lib/repo-source", async (orig) => ({ ...(await orig<typeof import("@/lib/repo-source")>()), fetchRepoContext: vi.fn() }));
vi.mock("@/lib/extract-text", async (orig) => ({ ...(await orig<typeof import("@/lib/extract-text")>()), extractDocumentText: vi.fn() }));

import { draftInvention, suggestInventions, extractInventions } from "@/lib/llm";
import { fetchRepoContext, RepoSourceError } from "@/lib/repo-source";
import { extractDocumentText } from "@/lib/extract-text";
import { POST as DRAFT } from "./draft/route";
import { POST as SUGGEST } from "./suggest/route";
import { POST as IMPORT } from "./import/route";
import { db, schema } from "@/db";
import { req, anonReq } from "@/test/req";
import { NextRequest } from "next/server";

const me = () => globalThis.__testUserId;
const draft = { title: "Limiter", description: "Rate limiter", inventionDate: null, identifier: null, kind: "software" as const, technologies: ["Go"] };

beforeEach(async () => {
  vi.mocked(draftInvention).mockReset().mockResolvedValue(draft);
  vi.mocked(suggestInventions).mockReset();
  vi.mocked(extractInventions).mockReset();
  vi.mocked(fetchRepoContext).mockReset();
  vi.mocked(extractDocumentText).mockReset();
  await db.delete(schema.inventions);
  await db.delete(schema.jobs);
  await db.delete(schema.careerProfile);
});

describe("POST /api/inventions/draft", () => {
  it("requires auth and input", async () => {
    expect((await DRAFT(anonReq("/x", "POST", { text: "x" }))).status).toBe(401);
    expect((await DRAFT(req("/x", "POST", {}))).status).toBe(400);
  });

  it("drafts from a description without saving", async () => {
    const res = await DRAFT(req("/x", "POST", { text: "my go rate limiter" }));
    expect(await res.json()).toEqual({ draft });
    expect(vi.mocked(draftInvention).mock.calls[0][0].text).toBe("my go rate limiter");
    expect(await db.select().from(schema.inventions)).toHaveLength(0);
  });

  it("drafts from a GitHub repo, defaulting the identifier to the repo URL", async () => {
    vi.mocked(fetchRepoContext).mockResolvedValue({ identifier: "https://github.com/me/limiter", text: "REPO CONTEXT" });
    const body = await (await DRAFT(req("/x", "POST", { url: "https://github.com/me/limiter" }))).json();
    expect(body.draft.identifier).toBe("https://github.com/me/limiter");
    expect(vi.mocked(draftInvention).mock.calls[0][0].text).toContain("REPO CONTEXT");
  });

  it("returns 400 with guidance for unsupported links, 500 on model failure", async () => {
    vi.mocked(fetchRepoContext).mockRejectedValue(new RepoSourceError("Only public github.com links — paste instead."));
    const res = await DRAFT(req("/x", "POST", { url: "https://gitlab.com/x/y" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/paste/);
    vi.mocked(draftInvention).mockRejectedValue(new Error("boom"));
    expect((await DRAFT(req("/x", "POST", { text: "x" }))).status).toBe(500);
  });
});

describe("POST /api/inventions/suggest", () => {
  it("400s with no history", async () => {
    expect((await SUGGEST(req("/x", "POST", {}))).status).toBe(400);
  });

  it("sends profile, jobs and journal (not complaints) and drops already-listed titles", async () => {
    await db.insert(schema.careerProfile).values({ userId: me(), content: "# Me\nBuilt a CLI" });
    const [job] = await db.insert(schema.jobs).values({ userId: me(), company: "Acme", companyNormalized: "acme", title: "Dev", startDate: "2020-01-01" }).returning();
    await db.insert(schema.journalEntries).values([
      { userId: me(), jobId: job.id, kind: "achievement", title: "Wrote deploy tool" },
      { userId: me(), jobId: job.id, kind: "complaint", title: "Too many meetings" },
    ]);
    await db.insert(schema.inventions).values({ userId: me(), title: "Rate Limiter" });
    vi.mocked(suggestInventions).mockResolvedValue([
      { ...draft, title: "rate-limiter", source: "profile", ownershipCaution: null },
      { ...draft, title: "Deploy tool", source: "journal", ownershipCaution: "Built while at Acme" },
    ]);

    const { suggestions } = await (await SUGGEST(req("/x", "POST", {}))).json();
    expect(suggestions.map((s: { title: string }) => s.title)).toEqual(["Deploy tool"]);
    const call = vi.mocked(suggestInventions).mock.calls[0][0];
    expect(call.existing).toEqual(["Rate Limiter"]);
    expect(call.history).toContain("Built a CLI");
    expect(call.history).toContain("Dev at Acme (2020-01-01 – present)");
    expect(call.history).toContain("Wrote deploy tool");
    expect(call.history).not.toContain("Too many meetings");
  });
});

describe("POST /api/inventions/import", () => {
  it("parses pasted text and flags duplicates by title", async () => {
    await db.insert(schema.inventions).values({ userId: me(), title: "Limiter" });
    vi.mocked(extractInventions).mockResolvedValue([draft, { ...draft, title: "Parser" }]);
    const res = await IMPORT(req("/x", "POST", { text: "EXHIBIT A ..." }));
    expect(res.status).toBe(200);
    const { inventions } = await res.json();
    expect(inventions.map((i: { title: string; duplicate: boolean }) => [i.title, i.duplicate])).toEqual([
      ["Limiter", true],
      ["Parser", false],
    ]);
    expect(vi.mocked(extractInventions).mock.calls[0][0].text).toBe("EXHIBIT A ...");
  });

  it("extracts text from an uploaded file", async () => {
    vi.mocked(extractDocumentText).mockResolvedValue("FILE TEXT");
    vi.mocked(extractInventions).mockResolvedValue([]);
    const form = new FormData();
    form.append("file", new File(["%PDF"], "exhibit.pdf", { type: "application/pdf" }));
    const r = new NextRequest("http://localhost/api/inventions/import", {
      method: "POST",
      headers: { cookie: globalThis.__testCookie },
      body: form,
    });
    expect((await IMPORT(r)).status).toBe(200);
    expect(vi.mocked(extractDocumentText).mock.calls[0][1]).toMatchObject({ name: "exhibit.pdf" });
    expect(vi.mocked(extractInventions).mock.calls[0][0].text).toBe("FILE TEXT");
  });

  it("validates input and reports unsupported files", async () => {
    expect((await IMPORT(anonReq("/x", "POST", { text: "x" }))).status).toBe(401);
    expect((await IMPORT(req("/x", "POST", { text: " " }))).status).toBe(400);
    const { UnsupportedFileTypeError } = await import("@/lib/extract-text");
    vi.mocked(extractDocumentText).mockRejectedValue(new UnsupportedFileTypeError("image/png"));
    const form = new FormData();
    form.append("file", new File(["x"], "a.png", { type: "image/png" }));
    const r = new NextRequest("http://localhost/x", { method: "POST", headers: { cookie: globalThis.__testCookie }, body: form });
    expect((await IMPORT(r)).status).toBe(400);
  });
});
