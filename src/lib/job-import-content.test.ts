import { describe, it, expect } from "vitest";
import { ImportedJobsSchema } from "./job-import-content";

describe("ImportedJobsSchema", () => {
  it("fills defaults and normalizes blank dates to null", () => {
    const r = ImportedJobsSchema.parse({ jobs: [{ company: "Acme", title: "Dev", startDate: "" }] });
    expect(r.jobs[0]).toEqual({
      company: "Acme",
      title: "Dev",
      startDate: null,
      endDate: null,
      technologies: [],
      achievements: [],
    });
  });
  it("rejects a job with no company", () => {
    expect(() => ImportedJobsSchema.parse({ jobs: [{ title: "Dev" }] })).toThrow();
  });
});
