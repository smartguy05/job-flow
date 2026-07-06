import { describe, it, expect, beforeEach } from "vitest";
import { normalizeCompany, normalizeCompany as norm, roleSimilarity, findDuplicates } from "./dedup";
import { db, schema } from "@/db";

describe("normalizeCompany", () => {
  it("strips common corporate suffixes and punctuation", () => {
    expect(normalizeCompany("Acme Rockets, Inc.")).toBe("acmerockets");
    expect(normalizeCompany("Acme Rockets LLC")).toBe("acmerockets");
    expect(normalizeCompany("ACME  Rockets")).toBe("acmerockets");
  });

  it("collapses different legal forms of the same company to one key", () => {
    expect(normalizeCompany("Globex Corporation")).toBe(normalizeCompany("Globex Corp"));
    expect(normalizeCompany("Initech Technologies")).toBe(normalizeCompany("Initech"));
  });

  it("handles empty-ish input", () => {
    expect(normalizeCompany("")).toBe("");
    expect(normalizeCompany("   ")).toBe("");
  });
});

describe("roleSimilarity", () => {
  it("treats titles differing only by seniority/synonyms as identical", () => {
    expect(roleSimilarity("Senior Software Engineer", "Sr. Software Developer")).toBe(1);
  });

  it("gives high similarity for overlapping meaningful tokens", () => {
    const s = roleSimilarity("Senior AI Engineer", "AI Platform Engineer");
    expect(s).toBeGreaterThan(0.3);
    expect(s).toBeLessThan(1);
  });

  it("gives low similarity for unrelated roles", () => {
    expect(roleSimilarity("Frontend Designer", "Database Administrator")).toBeLessThan(0.3);
  });
});

describe("findDuplicates", () => {
  const userId = () => globalThis.__testUserId;

  beforeEach(async () => {
    await db.delete(schema.applications);
  });

  async function seed(company: string, roleTitle: string, createdDaysAgo = 0) {
    const createdAt = new Date(Date.now() - createdDaysAgo * 24 * 60 * 60 * 1000);
    await db.insert(schema.applications)
      .values({
        userId: globalThis.__testUserId,
        company,
        companyNormalized: norm(company),
        roleTitle,
        status: "applied",
        lastActivityAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });
  }

  it("flags same company + similar role within the window", async () => {
    await seed("Globex Corp", "Senior Software Engineer", 5);
    const dupes = await findDuplicates(userId(), "Globex Corporation", "Sr. Software Developer", 30);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].company).toBe("Globex Corp");
    expect(dupes[0].daysAgo).toBeGreaterThanOrEqual(4);
  });

  it("does not flag outside the time window", async () => {
    await seed("Globex Corp", "Senior Software Engineer", 60);
    expect(await findDuplicates(userId(), "Globex Corp", "Senior Software Engineer", 30)).toHaveLength(0);
  });

  it("does not flag a different company", async () => {
    await seed("Initech", "Senior Software Engineer", 1);
    expect(await findDuplicates(userId(), "Globex", "Senior Software Engineer", 30)).toHaveLength(0);
  });

  it("does not flag a dissimilar role at the same company", async () => {
    await seed("Globex Corp", "Frontend Designer", 1);
    expect(await findDuplicates(userId(), "Globex Corp", "Database Administrator", 30)).toHaveLength(0);
  });

  it("sorts matches by similarity descending", async () => {
    await seed("Globex Corp", "Marketing Manager", 1); // low/no match
    await seed("Globex Corp", "Senior Software Engineer", 2); // exact-ish
    const dupes = await findDuplicates(userId(), "Globex Corp", "Software Engineer", 30);
    expect(dupes.length).toBeGreaterThanOrEqual(1);
    // highest similarity first
    for (let i = 1; i < dupes.length; i++) {
      expect(dupes[i - 1].similarity).toBeGreaterThanOrEqual(dupes[i].similarity);
    }
  });
});
