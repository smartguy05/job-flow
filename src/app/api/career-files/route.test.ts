import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";
import { req, anonReq, ctx, seedUser } from "@/test/req";

async function createFile(name: string, content: string): Promise<number> {
  const res = await POST(req("/api/career-files", "POST", { name, content }));
  expect(res.status).toBe(200);
  return (await res.json()).id;
}

describe("career-files CRUD", () => {
  it("requires auth", async () => {
    expect((await GET(anonReq("/api/career-files"))).status).toBe(401);
    expect((await POST(anonReq("/api/career-files", "POST", { name: "x" }))).status).toBe(401);
  });

  it("rejects a missing name", async () => {
    const res = await POST(req("/api/career-files", "POST", { content: "body" }));
    expect(res.status).toBe(400);
  });

  it("creates, lists, edits, and deletes a file", async () => {
    const id = await createFile("Brag doc", "shipped X");

    const list = await (await GET(req("/api/career-files"))).json();
    expect(list.find((f: { id: number }) => f.id === id)?.name).toBe("Brag doc");

    const patched = await PATCH(req(`/api/career-files/${id}`, "PATCH", { content: "shipped Y" }), ctx(id));
    expect(patched.status).toBe(200);
    const after = await (await GET(req("/api/career-files"))).json();
    expect(after.find((f: { id: number }) => f.id === id)?.content).toBe("shipped Y");

    const del = await DELETE(req(`/api/career-files/${id}`, "DELETE"), ctx(id));
    expect(del.status).toBe(200);
    const gone = await (await GET(req("/api/career-files"))).json();
    expect(gone.find((f: { id: number }) => f.id === id)).toBeUndefined();
  });

  it("isolates files across users (cross-tenant 404)", async () => {
    const id = await createFile("Mine", "secret");
    const other = await seedUser("other-cf");
    // Other user can't see it in their list…
    const otherList = await (await GET(other.req("/api/career-files"))).json();
    expect(otherList.find((f: { id: number }) => f.id === id)).toBeUndefined();
    // …nor patch/delete it.
    expect((await PATCH(other.req(`/api/career-files/${id}`, "PATCH", { content: "hax" }), ctx(id))).status).toBe(404);
    expect((await DELETE(other.req(`/api/career-files/${id}`, "DELETE"), ctx(id))).status).toBe(404);
  });
});
