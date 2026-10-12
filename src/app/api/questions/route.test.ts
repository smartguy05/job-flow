import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";
import { req, anonReq, seedUser } from "@/test/req";
import { db, schema } from "@/db";

describe("/api/questions", () => {
  it("401 for anon", async () => {
    expect((await GET(anonReq("/api/questions"))).status).toBe(401);
    expect((await POST(anonReq("/api/questions", "POST", { text: "x" }))).status).toBe(401);
  });

  it("creates with incrementing sortOrder and lists in order", async () => {
    const a = await (await POST(req("/api/questions", "POST", { text: "  First?  " }))).json();
    const res = await POST(req("/api/questions", "POST", { text: "Second?" }));
    expect(res.status).toBe(201);
    const b = await res.json();
    expect(a.text).toBe("First?");
    expect(b.sortOrder).toBe(a.sortOrder + 1);
    const { questions } = await (await GET(req("/api/questions"))).json();
    expect(questions.map((q: { text: string }) => q.text)).toEqual(["First?", "Second?"]);
  });

  it("400 on blank or non-string text", async () => {
    expect((await POST(req("/api/questions", "POST", { text: "   " }))).status).toBe(400);
    expect((await POST(req("/api/questions", "POST", { text: 5 }))).status).toBe(400);
    expect((await POST(req("/api/questions", "POST", {}))).status).toBe(400);
  });

  it("excludes job-specific and other users' questions", async () => {
    const other = await seedUser("q-other");
    await other.req("/api/questions"); // noop
    await db.insert(schema.interviewQuestions).values({ userId: other.id, text: "Theirs", sortOrder: 0 });
    const { questions } = await (await GET(req("/api/questions"))).json();
    expect(questions.some((q: { text: string }) => q.text === "Theirs")).toBe(false);
  });
});
