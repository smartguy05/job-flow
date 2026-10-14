import { describe, it, expect } from "vitest";
import { DraftedInventionSchema, SuggestionsSchema, ExtractedInventionsSchema } from "./invention-content";

describe("invention schemas", () => {
  it("fills defaults, nulls blanks, and coerces unknown kinds to other", () => {
    expect(DraftedInventionSchema.parse({ title: "X", inventionDate: " ", kind: "gadget" })).toEqual({
      title: "X",
      description: "",
      inventionDate: null,
      identifier: null,
      kind: "other",
      technologies: [],
    });
  });
  it("requires a title", () => {
    expect(() => DraftedInventionSchema.parse({ description: "d" })).toThrow();
  });
  it("parses suggestions with source and ownership caution", () => {
    const r = SuggestionsSchema.parse({ suggestions: [{ title: "Y", source: "journal", ownershipCaution: "" }] });
    expect(r.suggestions[0]).toMatchObject({ title: "Y", source: "journal", ownershipCaution: null });
    expect(ExtractedInventionsSchema.parse({}).inventions).toEqual([]);
  });
});
