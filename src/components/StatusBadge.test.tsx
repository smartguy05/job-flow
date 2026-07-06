import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("renders the human label for a known status", () => {
    const html = renderToStaticMarkup(<StatusBadge status="in_progress" />);
    expect(html).toContain("In progress");
  });
  it("falls back to the raw status when unknown", () => {
    const html = renderToStaticMarkup(<StatusBadge status="mystery" />);
    expect(html).toContain("mystery");
  });
});
