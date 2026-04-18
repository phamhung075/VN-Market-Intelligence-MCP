/**
 * TASK 1424 — TDD RED: Evening Summary Sector Aggregation
 *
 * These tests MUST fail before Task 1425 (formatMoversSection not yet exported).
 * All tests call formatMoversSection() directly — no DB, no Telegram, no runEveningSummary.
 */

import { describe, it, expect } from "bun:test";
import { formatMoversSection } from "../scheduler/eveningSummaryJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: 2+ movers same banking sector + lone tech mover
// VCB+TCB banking avg = (2.10+1.60)/2 = 1.85
// FPT is lone tech → flat block
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-1: 2+ movers same sector → sector block + flat individual", () => {
  const movers = [
    { code: "FPT", changePct: 3.20 },
    { code: "VCB", changePct: 2.10 },
    { code: "TCB", changePct: 1.60 },
  ];

  it("contains Biến động theo ngành: header", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Biến động theo ngành:");
  });

  it("contains sector line with avg +1.85% for banking 2 stocks", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Ngân hàng (+2 cp): avg +1.85%");
  });

  it("contains VCB sub-line", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("VCB: +2.10%");
  });

  it("contains TCB sub-line", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("TCB: +1.60%");
  });

  it("contains flat Biến động giá: header for lone FPT", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Biến động giá:");
  });

  it("contains FPT in flat block", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("FPT: +3.20%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: all single-sector movers → flat block only, no sector header
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-2: lone movers only → flat block, no sector header", () => {
  const movers = [
    { code: "VCB", changePct: 1.50 },
    { code: "FPT", changePct: 2.00 },
  ];

  it("does NOT contain Biến động theo ngành: header", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).not.toContain("Biến động theo ngành:");
  });

  it("contains Biến động giá: header", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Biến động giá:");
  });

  it("contains VCB in flat block", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("VCB: +1.50%");
  });

  it("contains FPT in flat block", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("FPT: +2.00%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: empty movers → returns []
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-3: empty movers → returns []", () => {
  it("returns empty array for []", () => {
    expect(formatMoversSection([])).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-4: unknown ticker (null profile) → goes to flat block
// VCB+TCB → banking sector block, UNKNOWN → flat
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-4: unknown ticker null profile → flat block", () => {
  const movers = [
    { code: "VCB", changePct: 2.00 },
    { code: "TCB", changePct: 1.00 },
    { code: "UNKNOWN", changePct: -1.50 },
  ];

  it("banking sector block present", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Ngân hàng (+2 cp):");
  });

  it("UNKNOWN appears in flat block", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("UNKNOWN: -1.50%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: sector order by |avgPct| DESC
// steel avg = -3.00%, banking avg = +1.00% → steel first
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-5: sectors sorted by |avgPct| DESC", () => {
  const movers = [
    { code: "VCB", changePct: 1.00 },   // banking
    { code: "TCB", changePct: 1.00 },   // banking
    { code: "HPG", changePct: -3.00 },  // steel
    { code: "HSG", changePct: -3.00 },  // steel
  ];

  it("steel sector appears before banking sector", () => {
    const lines = formatMoversSection(movers);
    const steelIdx = lines.findIndex((l) => l.includes("Thép"));
    const bankingIdx = lines.findIndex((l) => l.includes("Ngân hàng"));
    expect(steelIdx).toBeGreaterThanOrEqual(0);
    expect(bankingIdx).toBeGreaterThanOrEqual(0);
    expect(steelIdx).toBeLessThan(bankingIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: all movers in multi-stock sectors → no flat Biến động giá: header
// ─────────────────────────────────────────────────────────────────────────────
describe("AC-6: all movers in multi-stock sectors → no flat block header", () => {
  const movers = [
    { code: "VCB", changePct: 1.00 },
    { code: "TCB", changePct: 2.00 },
    { code: "MBB", changePct: 1.50 },
    { code: "VPB", changePct: -0.50 },
    { code: "ACB", changePct: 0.80 },
  ];

  it("sector block present", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).toContain("Biến động theo ngành:");
  });

  it("no Biến động giá: header when all in sector", () => {
    const result = formatMoversSection(movers).join("\n");
    expect(result).not.toContain("Biến động giá:");
  });
});
