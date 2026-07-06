import { describe, it, expect } from "vitest";
import { ResumeContentSchema } from "./resume-content";
import { makeResumeContent } from "@/test/fixtures";

describe("ResumeContentSchema", () => {
  it("accepts a well-formed resume", () => {
    const parsed = ResumeContentSchema.parse(makeResumeContent());
    expect(parsed.contact.name).toBe("Anthony James");
    expect(parsed.jobs[0].bullets.length).toBe(2);
  });

  it("defaults githubLine to an empty string when omitted", () => {
    const c = makeResumeContent() as Record<string, unknown>;
    delete c.githubLine;
    const parsed = ResumeContentSchema.parse(c);
    expect(parsed.githubLine).toBe("");
  });

  it("rejects content missing required sections", () => {
    const bad = { ...makeResumeContent() } as Record<string, unknown>;
    delete bad.summary;
    expect(() => ResumeContentSchema.parse(bad)).toThrow();
  });

  it("rejects a job with a non-array bullets field", () => {
    const bad = makeResumeContent();
    (bad.jobs[0] as unknown as Record<string, unknown>).bullets = "oops";
    expect(() => ResumeContentSchema.parse(bad)).toThrow();
  });

  it("allows optional contact fields to be absent", () => {
    const c = makeResumeContent();
    delete (c.contact as Record<string, unknown>).website;
    delete (c.contact as Record<string, unknown>).websiteUrl;
    expect(() => ResumeContentSchema.parse(c)).not.toThrow();
  });
});
