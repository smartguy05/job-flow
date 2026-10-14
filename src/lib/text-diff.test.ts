import { describe, it, expect } from "vitest";
import { diffLines } from "./text-diff";

describe("diffLines", () => {
  it("marks unchanged, added and removed lines", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc\nd")).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
  });
  it("handles empty input", () => {
    expect(diffLines("", "x")).toEqual([{ type: "add", text: "x" }]);
    expect(diffLines("x", "x")).toEqual([{ type: "same", text: "x" }]);
  });
});
