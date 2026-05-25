/**
 * Tests for formatDirectionArrow — P1-B1 (G12 streak task #1)
 */
import { describe, it, expect } from "vitest";
import { formatDirectionArrow } from "./direction-arrow";

describe("formatDirectionArrow", () => {
  it("up direction returns upward arrow with green class", () => {
    const result = formatDirectionArrow("up");
    expect(result.symbol).toBe("↑");
    expect(result.cls).toBe("text-green-400");
  });

  it("down direction returns downward arrow with red class", () => {
    const result = formatDirectionArrow("down");
    expect(result.symbol).toBe("↓");
    expect(result.cls).toBe("text-red-400");
  });

  it("flat direction returns dash with slate class", () => {
    const result = formatDirectionArrow("flat");
    expect(result.symbol).toBe("—");
    expect(result.cls).toBe("text-slate-500");
  });

  it("unknown string returns dash with slate class", () => {
    const result = formatDirectionArrow("sideways");
    expect(result.symbol).toBe("—");
    expect(result.cls).toBe("text-slate-500");
  });

  it("empty string returns dash with slate class", () => {
    const result = formatDirectionArrow("");
    expect(result.symbol).toBe("—");
    expect(result.cls).toBe("text-slate-500");
  });
});
