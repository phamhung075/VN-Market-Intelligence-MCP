/**
 * Tests for formatChangePct — P1-B2 (G12 streak task #2)
 * Market-data UI policy baked in as an explicit failing-if-bare-number scenario.
 */
import { describe, it, expect } from "vitest";
import { formatChangePct } from "./change-pct";

describe("formatChangePct", () => {
  it("positive change returns upward arrow with + prefix and green class", () => {
    const result = formatChangePct(2.5);
    expect(result.formatted).toBe("+2.5%");
    expect(result.symbol).toBe("↑");
    expect(result.cls).toBe("text-green-400");
  });

  it("negative change returns downward arrow with negative value and red class", () => {
    const result = formatChangePct(-1.3);
    expect(result.formatted).toBe("-1.3%");
    expect(result.symbol).toBe("↓");
    expect(result.cls).toBe("text-red-400");
  });

  it("zero change returns dash symbol with slate class", () => {
    const result = formatChangePct(0.0);
    expect(result.formatted).toBe("0.0%");
    expect(result.symbol).toBe("—");
    expect(result.cls).toBe("text-slate-400");
  });

  it("large positive change formats correctly", () => {
    const result = formatChangePct(15.8);
    expect(result.formatted).toBe("+15.8%");
    expect(result.symbol).toBe("↑");
    expect(result.cls).toBe("text-green-400");
  });

  it("large negative change formats correctly", () => {
    const result = formatChangePct(-10.2);
    expect(result.formatted).toBe("-10.2%");
    expect(result.symbol).toBe("↓");
    expect(result.cls).toBe("text-red-400");
  });

  it("never returns bare number — market-data policy", () => {
    const result = formatChangePct(2.5);
    // Must include both direction symbol AND % sign — never a raw float
    expect(result.formatted).toMatch(/[↑↓—]|[+-]?\d+\.\d+%/);
    expect(result.symbol).not.toBe("");
    expect(result.formatted).toContain("%");
  });
});
