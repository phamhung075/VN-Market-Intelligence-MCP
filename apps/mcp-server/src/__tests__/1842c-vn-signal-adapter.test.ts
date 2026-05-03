// apps/mcp-server/src/__tests__/1842c-vn-signal-adapter.test.ts
// Task 1842c — VNSignalAdapter: Vietnamese signal normalizer
//
// Pure unit tests — no DB, no network.

import { describe, it, expect } from "bun:test";
import { VNSignalAdapter } from "../domain/backtesting/VNSignalAdapter.js";
import type { RawKinhDichSignal } from "../domain/backtesting/VNSignalAdapter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function raw(rawDirection: string): RawKinhDichSignal {
  return {
    stockCode: "VCB",
    rawDirection,
    confidence: 0.8,
    timestamp: "2026-04-15T10:00:00",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1842c — VNSignalAdapter", () => {
  const adapter = new VNSignalAdapter();

  // ── normalize() — AC-1..8 ────────────────────────────────────────────────

  it("AC-1: MUA (tich cuc) normalises to BUY", () => {
    const result = adapter.normalize(raw("MUA (tich cuc)"));
    expect(result.direction).toBe("BUY");
  });

  it("AC-1: originalRaw preserved for MUA (tich cuc)", () => {
    const result = adapter.normalize(raw("MUA (tich cuc)"));
    expect(result.originalRaw).toBe("MUA (tich cuc)");
  });

  it("AC-2: BAN (tich cuc) normalises to SELL", () => {
    const result = adapter.normalize(raw("BAN (tich cuc)"));
    expect(result.direction).toBe("SELL");
  });

  it("AC-3: GIU (tich cuc) normalises to HOLD", () => {
    const result = adapter.normalize(raw("GIU (tich cuc)"));
    expect(result.direction).toBe("HOLD");
  });

  it("AC-4: THAN TRONG (tich cuc) normalises to WAIT", () => {
    const result = adapter.normalize(raw("THAN TRONG (tich cuc)"));
    expect(result.direction).toBe("WAIT");
  });

  it("AC-5: CHO (tich cuc) normalises to WAIT", () => {
    const result = adapter.normalize(raw("CHO (tich cuc)"));
    expect(result.direction).toBe("WAIT");
  });

  it("AC-6: BUY pass-through returns BUY", () => {
    const result = adapter.normalize(raw("BUY"));
    expect(result.direction).toBe("BUY");
  });

  it("AC-7: UNKNOWN falls back to WAIT", () => {
    const result = adapter.normalize(raw("UNKNOWN"));
    expect(result.direction).toBe("WAIT");
  });

  it("AC-8: originalRaw is always preserved exactly as input", () => {
    const inputs = [
      "MUA (tich cuc)",
      "BAN (tich cuc)",
      "GIU (tich cuc)",
      "THAN TRONG (tich cuc)",
      "CHO (tich cuc)",
      "BUY",
      "UNKNOWN_SIGNAL_XYZ",
    ];
    for (const input of inputs) {
      const result = adapter.normalize(raw(input));
      expect(result.originalRaw).toBe(input);
    }
  });

  // ── normalizeAll() — AC-9..11 ────────────────────────────────────────────

  it("AC-9: normalizeAll returns all 3 signals normalised", () => {
    const signals: RawKinhDichSignal[] = [
      raw("MUA (tich cuc)"),
      raw("BAN (tich cuc)"),
      raw("GIU (tich cuc)"),
    ];
    const result = adapter.normalizeAll(signals);
    expect(result).toHaveLength(3);
    expect(result[0]!.direction).toBe("BUY");
    expect(result[1]!.direction).toBe("SELL");
    expect(result[2]!.direction).toBe("HOLD");
  });

  it("AC-10: normalizeAll with filterWait:true excludes WAIT signals", () => {
    const signals: RawKinhDichSignal[] = [
      raw("MUA (tich cuc)"),
      raw("THAN TRONG (tich cuc)"),
      raw("BAN (tich cuc)"),
      raw("CHO (tich cuc)"),
    ];
    const result = adapter.normalizeAll(signals, { filterWait: true });
    expect(result).toHaveLength(2);
    expect(result.every((s) => s.direction !== "WAIT")).toBe(true);
  });

  it("AC-11: normalizeAll with empty input returns []", () => {
    const result = adapter.normalizeAll([]);
    expect(result).toEqual([]);
  });

  // ── isTradeable() — AC-12..14 ────────────────────────────────────────────

  it("AC-12: isTradeable(\"MUA (tich cuc)\") returns true", () => {
    expect(adapter.isTradeable("MUA (tich cuc)")).toBe(true);
  });

  it("AC-13: isTradeable(\"GIU (tich cuc)\") returns false", () => {
    expect(adapter.isTradeable("GIU (tich cuc)")).toBe(false);
  });

  it("AC-14: isTradeable(\"THAN TRONG\") returns false", () => {
    expect(adapter.isTradeable("THAN TRONG")).toBe(false);
  });
});
