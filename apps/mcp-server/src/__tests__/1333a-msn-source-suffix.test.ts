// apps/mcp-server/src/__tests__/1333a-msn-source-suffix.test.ts
// RED: source attribution suffix " - MSN" must NOT trigger ticker match for MSN
import { describe, it, expect } from "bun:test";
import { stripSourceAttributionSuffix } from "../domain/services/stockAliases.js";

describe("1333a — stripSourceAttributionSuffix: RED (function does not exist yet)", () => {
  it("strips ' - MSN' from headline end", () => {
    const raw = "Vietnam stock market gathers pace - MSN";
    expect(stripSourceAttributionSuffix(raw)).toBe("Vietnam stock market gathers pace");
  });

  it("strips ' - REUTERS' from headline end", () => {
    expect(stripSourceAttributionSuffix("Copper prices fall - REUTERS")).toBe("Copper prices fall");
  });

  it("strips ' - Bloomberg' (mixed case) from headline end", () => {
    expect(stripSourceAttributionSuffix("Fed rate cut expected - Bloomberg")).toBe("Fed rate cut expected");
  });

  it("does NOT strip ticker-like token that appears mid-sentence", () => {
    // "MSN" in the body — not a suffix, leave untouched
    expect(stripSourceAttributionSuffix("MSN shares rise sharply today")).toBe("MSN shares rise sharply today");
  });

  it("does NOT strip when pattern is part of a longer word at end", () => {
    // "BUSINESS" ends the headline but is >5 chars — keep
    expect(stripSourceAttributionSuffix("Growth outlook positive - BUSINESS")).toBe("Growth outlook positive - BUSINESS");
  });

  it("strips only the last suffix, not inner ' - X' patterns", () => {
    // Headlines like "A - B analysis - MSN" → "A - B analysis"
    expect(stripSourceAttributionSuffix("VCB - bank analysis - MSN")).toBe("VCB - bank analysis");
  });

  it("no-op when no suffix present", () => {
    expect(stripSourceAttributionSuffix("Vietnam GDP grows 7%")).toBe("Vietnam GDP grows 7%");
  });

  it("no-op on empty string", () => {
    expect(stripSourceAttributionSuffix("")).toBe("");
  });
});
