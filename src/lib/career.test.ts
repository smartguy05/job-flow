import { describe, it, expect, beforeEach } from "vitest";
import { db, schema } from "@/db";
import { getCareerInfo } from "./career";
import { seedUser } from "@/test/req";

const me = () => globalThis.__testUserId;

beforeEach(async () => {
  await db.delete(schema.careerProfile);
  await db.delete(schema.careerFiles);
  await db.delete(schema.inventions);
});

describe("getCareerInfo", () => {
  it("joins the profile and career files", async () => {
    await db.insert(schema.careerProfile).values({ userId: me(), content: "# Me" });
    await db.insert(schema.careerFiles).values({ userId: me(), name: "Brag", content: "shipped X" });
    expect(await getCareerInfo(me())).toBe("# Me\n\n---\n\n# Brag\n\nshipped X");
  });

  it("appends only inventions opted into resumes, for this user", async () => {
    await db.insert(schema.careerProfile).values({ userId: me(), content: "# Me" });
    const other = await seedUser("other-career");
    await db.insert(schema.inventions).values([
      { userId: me(), title: "Rate limiter", description: "Token bucket.", includeInResume: true, sortOrder: 1 },
      { userId: me(), title: "Secret sauce", includeInResume: false },
      { userId: other.id, title: "Not mine", includeInResume: true },
    ]);
    const info = await getCareerInfo(me());
    expect(info).toContain("# Personal projects & inventions");
    expect(info).toContain("## Rate limiter");
    expect(info).not.toContain("Secret sauce");
    expect(info).not.toContain("Not mine");
  });

  it("leaves the context unchanged when no inventions are opted in", async () => {
    await db.insert(schema.careerProfile).values({ userId: me(), content: "# Me" });
    await db.insert(schema.inventions).values({ userId: me(), title: "Private" });
    expect(await getCareerInfo(me())).toBe("# Me");
  });
});
