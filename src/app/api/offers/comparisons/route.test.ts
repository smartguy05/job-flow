import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", () => ({ generateOfferComparison: vi.fn() }));

import { GET, POST } from "./route";
import { generateOfferComparison } from "@/lib/llm";
import { req, anonReq, insertApp, seedUser } from "@/test/req";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const mockGen = vi.mocked(generateOfferComparison);

const VERDICT = {
  summary: "Globex edges ahead.",
  recommendation: { applicationId: 0, rationale: "fit" },
  ranking: [],
  factors: [],
  risks: [],
};

beforeEach(() => {
  mockGen.mockReset();
  mockGen.mockResolvedValue(VERDICT);
});

describe("POST /api/offers/comparisons", () => {
  it("builds a table, generates a verdict, and saves the snapshot", async () => {
    const a1 = await insertApp({ company: "Globex", payMin: 200000, payMax: 200000, payPeriod: "year" });
    const a2 = await insertApp({ company: "Initech", payMin: 180000, payMax: 180000, payPeriod: "year" });
    const res = await POST(req("/api/offers/comparisons", "POST", { applicationIds: [a1, a2] }));
    const body = await res.json();
    expect(body.result.verdict.summary).toBe("Globex edges ahead.");
    expect(body.result.table.rows.find((r: { label: string }) => r.label === "Base pay").values).toHaveLength(2);
    expect(body.title).toBe("Globex vs Initech");

    const [row] = await db.select().from(schema.offerComparisons).where(eq(schema.offerComparisons.id, body.id));
    expect(JSON.parse(row.applicationIds)).toEqual([a1, a2]);
    expect(JSON.parse(row.resultJson).verdict.summary).toBe("Globex edges ahead.");

    const events = await db.select().from(schema.events).where(eq(schema.events.applicationId, a1));
    expect(events.some((e) => e.type === "offer_comparison")).toBe(true);
  });

  it("passes attached benefits PDFs to the generator as documents", async () => {
    const a1 = await insertApp({ company: "Globex" });
    const a2 = await insertApp({ company: "Initech" });
    await db.insert(schema.applicationFiles).values({
      userId: globalThis.__testUserId,
      applicationId: a1,
      kind: "benefits",
      name: "b.pdf",
      mimeType: "application/pdf",
      size: 3,
      data: Buffer.from([1, 2, 3]),
    });
    await POST(req("/api/offers/comparisons", "POST", { applicationIds: [a1, a2], priorities: "remote first" }));
    const arg = mockGen.mock.calls[0][0];
    expect(arg.benefitsDocs).toHaveLength(1);
    expect(arg.benefitsDocs![0].data).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(arg.priorities).toBe("remote first");
  });

  it("rejects fewer than two applications", async () => {
    const a1 = await insertApp();
    const res = await POST(req("/api/offers/comparisons", "POST", { applicationIds: [a1] }));
    expect(res.status).toBe(400);
    expect(mockGen).not.toHaveBeenCalled();
  });

  it("ignores applications owned by another user", async () => {
    const other = await seedUser("cmp-other");
    const mine = await insertApp();
    const theirs = await insertApp({ userId: other.id });
    const res = await POST(req("/api/offers/comparisons", "POST", { applicationIds: [mine, theirs] }));
    // Only one owned app remains → not enough to compare.
    expect(res.status).toBe(400);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(anonReq("/api/offers/comparisons", "POST", { applicationIds: [1, 2] }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/offers/comparisons", () => {
  it("lists the user's saved comparisons", async () => {
    const a1 = await insertApp();
    const a2 = await insertApp();
    const created = await (await POST(req("/api/offers/comparisons", "POST", { applicationIds: [a1, a2] }))).json();
    const list = await (await GET(req("/api/offers/comparisons"))).json();
    const found = list.find((c: { id: number }) => c.id === created.id);
    expect(found).toBeDefined();
    expect(found.applicationIds).toEqual([a1, a2]);
  });

  it("does not list another user's comparisons", async () => {
    const other = await seedUser("cmp-list-other");
    const [theirs] = await db
      .insert(schema.offerComparisons)
      .values({ userId: other.id, title: "theirs", applicationIds: JSON.stringify([1, 2]), resultJson: "{}" })
      .returning({ id: schema.offerComparisons.id });
    const list = await (await GET(req("/api/offers/comparisons"))).json();
    expect(list.some((c: { id: number }) => c.id === theirs.id)).toBe(false);
  });
});
