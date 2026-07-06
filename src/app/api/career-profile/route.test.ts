import { describe, it, expect, beforeEach } from "vitest";
import { GET, PUT } from "./route";
import { req } from "@/test/req";
import { db, schema } from "@/db";

beforeEach(async () => {
  await db
    .insert(schema.careerProfile)
    .values({ userId: globalThis.__testUserId, content: "# Seeded profile" })
    .onConflictDoUpdate({ target: schema.careerProfile.userId, set: { content: "# Seeded profile" } });
});

describe("career-profile", () => {
  it("returns the seeded profile content", async () => {
    const body = await (await GET(req("/api/career-profile"))).json();
    expect(typeof body.content).toBe("string");
    expect(body.content.length).toBeGreaterThan(0);
  });

  it("requires a string body on PUT", async () => {
    const res = await PUT(req("/api/career-profile", "PUT", { content: 123 }));
    expect(res.status).toBe(400);
  });

  it("saves and reads back updated content", async () => {
    await PUT(req("/api/career-profile", "PUT", { content: "# New profile" }));
    const body = await (await GET(req("/api/career-profile"))).json();
    expect(body.content).toBe("# New profile");
  });
});
