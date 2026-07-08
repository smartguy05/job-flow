import { describe, it, expect } from "vitest";
import { GET, DELETE } from "./route";
import { req, anonReq, ctx, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

async function insertComparison(userId = globalThis.__testUserId, appIds = [1, 2]) {
  const [row] = await db
    .insert(schema.offerComparisons)
    .values({
      userId,
      title: "Globex vs Initech",
      applicationIds: JSON.stringify(appIds),
      priorities: "remote",
      resultJson: JSON.stringify({ table: { applications: [], rows: [] }, verdict: { summary: "hi" } }),
    })
    .returning({ id: schema.offerComparisons.id });
  return row.id;
}

describe("GET /api/offers/comparisons/[id]", () => {
  it("returns the parsed snapshot", async () => {
    await insertApp();
    const id = await insertComparison();
    const res = await GET(req(`/api/offers/comparisons/${id}`), ctx(id));
    const body = await res.json();
    expect(body.title).toBe("Globex vs Initech");
    expect(body.priorities).toBe("remote");
    expect(body.result.verdict.summary).toBe("hi");
  });

  it("returns 404 for another user's comparison", async () => {
    const other = await seedUser("cmp-get-other");
    const id = await insertComparison(other.id);
    const res = await GET(req(`/api/offers/comparisons/${id}`), ctx(id));
    expect(res.status).toBe(404);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await GET(anonReq(`/api/offers/comparisons/1`), ctx(1));
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/offers/comparisons/[id]", () => {
  it("deletes an owned comparison", async () => {
    const id = await insertComparison();
    const res = await DELETE(req(`/api/offers/comparisons/${id}`, "DELETE"), ctx(id));
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.offerComparisons).where(eq(schema.offerComparisons.id, id));
    expect(rows).toHaveLength(0);
  });

  it("returns 404 deleting another user's comparison", async () => {
    const other = await seedUser("cmp-del-other");
    const id = await insertComparison(other.id);
    const res = await DELETE(req(`/api/offers/comparisons/${id}`, "DELETE"), ctx(id));
    expect(res.status).toBe(404);
  });
});
