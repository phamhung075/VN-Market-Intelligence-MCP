/**
 * Task 1784 — TDD: Sector alert rendering fixes
 *
 * BUG-4: Sector alert labeled per-ticker instead of sector-level.
 *   Current: "[CAO] ACB alert [HIGH]: price_drop — ⚠️ Ngành Ngân hàng giảm..."
 *   Fixed:   "[Ngân hàng] Sector (CAO)"
 *
 * BUG-5: Multiple per-ticker alerts with identical body render as 3 separate lines.
 *   Fixed: deduplicate by body text, collapse to one entry with count suffix.
 *
 * Layer: tests — exercises formatAlertLines (pure helper exported from franceSummaryJob).
 * No DB, no HTTP, no Telegram sends.
 */

import { describe, it, expect } from "bun:test";
import { formatAlertLines } from "../scheduler/briefings/franceSummaryJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SECTOR_BODY = "⚠️ Ngành Ngân hàng giảm đồng loạt (3 mã, TB -1.63%): TCB -2.17%, VPB -1.85%, STB -0.88%";

const sectorAlertACB = {
  id: "a1",
  severity: "high",
  message: `ACB alert [HIGH]: price_drop — ${SECTOR_BODY}`,
  triggered_at: "2026-04-30T01:00:00.000Z",
};
const sectorAlertBID = {
  id: "a2",
  severity: "high",
  message: `BID alert [HIGH]: price_drop — ${SECTOR_BODY}`,
  triggered_at: "2026-04-30T01:00:00.000Z",
};
const sectorAlertCTG = {
  id: "a3",
  severity: "high",
  message: `CTG alert [HIGH]: price_drop — ${SECTOR_BODY}`,
  triggered_at: "2026-04-30T01:00:00.000Z",
};

const regularAlert = {
  id: "b1",
  severity: "high",
  message: "VCB alert [HIGH]: price_drop — VCB giảm 3.1%",
  triggered_at: "2026-04-30T01:00:00.000Z",
};

// ─────────────────────────────────────────────────────────────────────────────
// BUG-4: Sector label rewrite
// ─────────────────────────────────────────────────────────────────────────────

describe("1784 BUG-4 — sector alert label rewrite", () => {
  it("renders sector name in label when message body contains 'Ngành'", () => {
    const lines = formatAlertLines([sectorAlertACB]);
    // Must show sector name, not ticker name
    expect(lines.join("\n")).toContain("Ngân hàng");
    expect(lines.join("\n")).not.toContain("ACB alert");
  });

  it("renders 'Sector' keyword in label for sector alerts", () => {
    const lines = formatAlertLines([sectorAlertACB]);
    expect(lines.join("\n")).toContain("Sector");
  });

  it("still shows severity label for sector alerts", () => {
    const lines = formatAlertLines([sectorAlertACB]);
    // severity should still appear (CAO = high)
    expect(lines.join("\n")).toContain("CAO");
  });

  it("does not rewrite label for regular non-sector alerts", () => {
    const lines = formatAlertLines([regularAlert]);
    expect(lines.join("\n")).toContain("VCB");
    expect(lines.join("\n")).not.toContain("Sector");
  });

  it("preserves the body text (actual mover details) for sector alerts", () => {
    const lines = formatAlertLines([sectorAlertACB]);
    // The actual mover info from the body must still be visible
    expect(lines.join("\n")).toContain("TCB");
    expect(lines.join("\n")).toContain("-1.63%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG-5: Deduplication of same-body sector alerts
// ─────────────────────────────────────────────────────────────────────────────

describe("1784 BUG-5 — same-body sector alert deduplication", () => {
  it("collapses 3 same-body sector alerts to a single line", () => {
    const lines = formatAlertLines([sectorAlertACB, sectorAlertBID, sectorAlertCTG]);
    // Must be exactly 1 alert line (not 3)
    const alertLines = lines.filter((l) => l.startsWith("  "));
    expect(alertLines).toHaveLength(1);
  });

  it("shows count suffix when collapsing multiple same-body alerts", () => {
    const lines = formatAlertLines([sectorAlertACB, sectorAlertBID, sectorAlertCTG]);
    expect(lines.join("\n")).toContain("+3");
  });

  it("does not collapse alerts with different body text", () => {
    const differentSectorAlert = {
      id: "c1",
      severity: "high",
      message: `VIC alert [HIGH]: price_drop — ⚠️ Ngành Bất động sản giảm đồng loạt (3 mã, TB -2.0%): VIC -2.1%, VHM -1.9%, NVL -1.8%`,
      triggered_at: "2026-04-30T01:00:00.000Z",
    };
    const lines = formatAlertLines([sectorAlertACB, differentSectorAlert]);
    const alertLines = lines.filter((l) => l.startsWith("  "));
    expect(alertLines).toHaveLength(2);
  });

  it("does not collapse regular alerts that happen to share a short prefix", () => {
    const alert1 = { id: "d1", severity: "high", message: "VCB alert [HIGH]: price_drop — giảm 3%", triggered_at: "2026-04-30T01:00:00Z" };
    const alert2 = { id: "d2", severity: "high", message: "VCB alert [HIGH]: price_drop — giảm 4%", triggered_at: "2026-04-30T01:00:00Z" };
    const lines = formatAlertLines([alert1, alert2]);
    const alertLines = lines.filter((l) => l.startsWith("  "));
    // Different body → 2 lines
    expect(alertLines).toHaveLength(2);
  });

  it("mixed: one sector group + one regular alert → 2 lines total", () => {
    const lines = formatAlertLines([sectorAlertACB, sectorAlertBID, sectorAlertCTG, regularAlert]);
    const alertLines = lines.filter((l) => l.startsWith("  "));
    expect(alertLines).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("1784 edge cases", () => {
  it("returns empty array for empty input", () => {
    expect(formatAlertLines([])).toHaveLength(0);
  });

  it("single sector alert → no count suffix needed", () => {
    const lines = formatAlertLines([sectorAlertACB]);
    // When only 1, no +N suffix required
    expect(lines.join("\n")).not.toContain("+1");
  });
});
