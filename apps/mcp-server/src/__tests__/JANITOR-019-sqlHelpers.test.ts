import { describe, it, expect } from "bun:test";
import { sqlInClause } from "../infrastructure/db/sqlHelpers.js";

describe("JANITOR-019 — sqlInClause", () => {
  it("n=1 returns single placeholder", () => {
    expect(sqlInClause(1)).toBe("?");
  });

  it("n=3 returns comma-separated placeholders", () => {
    expect(sqlInClause(3)).toBe("?, ?, ?");
  });

  it("n=0 throws RangeError", () => {
    expect(() => sqlInClause(0)).toThrow(RangeError);
  });

  it("n=-1 throws RangeError", () => {
    expect(() => sqlInClause(-1)).toThrow(RangeError);
  });
});
