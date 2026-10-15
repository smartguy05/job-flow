import { describe, it, expect } from "vitest";
import { NotFoundError, ValidationError, errorResponse } from "./errors";

describe("errorResponse", () => {
  it("maps NotFoundError to 404 and ValidationError to 400", async () => {
    const nf = errorResponse(new NotFoundError());
    expect(nf.status).toBe(404);
    expect(await nf.json()).toEqual({ error: "Not found" });
    const ve = errorResponse(new ValidationError("bad"));
    expect(ve.status).toBe(400);
    expect(await ve.json()).toEqual({ error: "bad" });
  });

  it("rethrows unknown errors", () => {
    expect(() => errorResponse(new Error("boom"))).toThrow("boom");
  });
});
