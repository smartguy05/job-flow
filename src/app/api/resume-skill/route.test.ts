import { describe, it, expect } from "vitest";
import { GET, PUT } from "./route";
import { req, anonReq } from "@/test/req";

describe("resume-skill", () => {
  it("requires auth", async () => {
    expect((await GET(anonReq("/api/resume-skill"))).status).toBe(401);
  });

  it("returns the shipped default when the user hasn't customized it", async () => {
    const d = await (await GET(req("/api/resume-skill"))).json();
    expect(d.isDefault).toBe(true);
    expect(d.content).toBe("");
    expect(typeof d.default).toBe("string");
    expect(d.default.length).toBeGreaterThan(0);
  });

  it("persists a custom skill and reports it as non-default", async () => {
    await PUT(req("/api/resume-skill", "PUT", { content: "MY CUSTOM SKILL" }));
    const d = await (await GET(req("/api/resume-skill"))).json();
    expect(d.content).toBe("MY CUSTOM SKILL");
    expect(d.isDefault).toBe(false);
  });

  it("reverts to default when saved empty", async () => {
    await PUT(req("/api/resume-skill", "PUT", { content: "something" }));
    await PUT(req("/api/resume-skill", "PUT", { content: "" }));
    const d = await (await GET(req("/api/resume-skill"))).json();
    expect(d.isDefault).toBe(true);
  });
});
