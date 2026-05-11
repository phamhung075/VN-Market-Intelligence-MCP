/**
 * Task 1396 — Intra-Day Progression Time Label on Incremental price_drop
 *
 * AC1: Second+ incremental price_drop gets (+HH:MM) ICT prefix
 * AC2: First price_drop in block — no prefix
 * AC3: Cumulative entry keeps (lũy kế); does not consume "first drop" slot
 * AC4: triggered_at unavailable → falls back to (+thêm)
 * AC5: Non-price-drop messages unchanged
 * AC6: Zero-alert and single-drop paths unchanged
 */

import { describe, it, expect } from "bun:test";
import {
  formatAlertDigest,
  type StockAlertBlock,
} from "../application/usecases/assembleAlertDigest.js";

const DATE = "2026-04-29";

function block(
  code: string,
  messages: string[],
  triggeredAts: string[],
  count?: number,
  overflow = 0,
): StockAlertBlock {
  return {
    code,
    count: count ?? messages.length,
    topMessages: messages,
    topTriggeredAt: triggeredAts,
    overflow,
  };
}

describe("Task 1396 — intra-day progression time label", () => {
  // AC1 — second incremental drop shows (+HH:MM) ICT
  it("AC1: second price_drop renders (+HH:MM) where HH:MM is ICT", () => {
    const b = block(
      "GAS",
      [
        "Giá giảm ↓2.4% (44.954 → 43.866 VND)",
        "Giá giảm ↓1.2% (45.500 → 44.954 VND)",
      ],
      [
        "2026-04-29T06:30:00.000Z", // 13:30 ICT
        "2026-04-29T05:00:00.000Z", // 12:00 ICT
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    // First drop — no prefix
    expect(text).toContain("  - Giá giảm ↓2.4%");
    // Second drop — ICT time label (05:00 UTC = 12:00 ICT)
    expect(text).toContain("  - (+12:00) Giá giảm ↓1.2%");
    expect(text).not.toContain("(+thêm)");
  });

  // AC1 variant — SQLite format ("YYYY-MM-DD HH:MM:SS", no T or Z)
  it("AC1b: SQLite-format triggered_at parses correctly", () => {
    const b = block(
      "VCB",
      [
        "Giá giảm ↓1.0% (A → B)",
        "Giá giảm ↓2.0% (B → C)",
      ],
      [
        "2026-04-29 07:00:00", // treated as UTC → 14:00 ICT
        "2026-04-29 06:00:00", // treated as UTC → 13:00 ICT
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    expect(text).toContain("  - Giá giảm ↓1.0%");
    expect(text).toContain("  - (+13:00) Giá giảm ↓2.0%");
  });

  // AC2 — first drop has no prefix
  it("AC2: first price_drop in block renders with no prefix", () => {
    const b = block(
      "HPG",
      ["Giá giảm ↓1.5% (X → Y)"],
      ["2026-04-29T06:30:00.000Z"],
    );
    const text = formatAlertDigest(DATE, 1, 0, 1, [b]);

    expect(text).toContain("  - Giá giảm ↓1.5%");
    expect(text).not.toContain("(+");
    expect(text).not.toContain("(lũy kế)");
  });

  // AC3 — cumulative keeps (lũy kế) and does not consume first-drop slot
  it("AC3: cumulative entry gets (lũy kế); next incremental is still first drop — no time label", () => {
    const b = block(
      "GAS",
      [
        "Giá giảm ↓3.6% lũy kế từ mở cửa (45.500 → 43.866 VND)",
        "Giá giảm ↓1.2% (45.500 → 44.954 VND)",
      ],
      [
        "2026-04-29T06:30:00.000Z",
        "2026-04-29T05:00:00.000Z",
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    expect(text).toContain("(lũy kế) Giá giảm ↓3.6%");
    // Incremental is still the first non-cumulative drop — no prefix
    expect(text).toContain("  - Giá giảm ↓1.2%");
    expect(text).not.toContain("(+thêm)");
    expect(text).not.toMatch(/\(\+\d{2}:\d{2}\)/);
  });

  // AC3b — cumulative + two incrementals: second incremental gets time label
  it("AC3b: cumulative + two incrementals — second incremental gets (+HH:MM)", () => {
    const b = block(
      "GAS",
      [
        "Giá giảm ↓3.6% lũy kế từ mở cửa (45.500 → 43.866 VND)",
        "Giá giảm ↓2.4% (44.954 → 43.866 VND)",
        "Giá giảm ↓1.2% (45.500 → 44.954 VND)",
      ],
      [
        "2026-04-29T06:30:00.000Z",
        "2026-04-29T06:00:00.000Z", // 13:00 ICT
        "2026-04-29T05:00:00.000Z", // 12:00 ICT
      ],
    );
    const text = formatAlertDigest(DATE, 3, 0, 3, [b]);

    expect(text).toContain("(lũy kế) Giá giảm ↓3.6%");
    expect(text).toContain("  - Giá giảm ↓2.4%");
    expect(text).toContain("  - (+12:00) Giá giảm ↓1.2%");
  });

  // AC4 — triggered_at unavailable → fall back to (+thêm)
  it("AC4: empty triggered_at on second drop falls back to (+thêm)", () => {
    const b = block(
      "TCB",
      [
        "Giá giảm ↓1.0% (A → B)",
        "Giá giảm ↓2.0% (B → C)",
      ],
      [
        "2026-04-29T06:30:00.000Z",
        "", // unknown
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    expect(text).toContain("  - (+thêm) Giá giảm ↓2.0%");
    expect(text).not.toMatch(/\(\+\d{2}:\d{2}\)/);
    expect(text).not.toContain("(+NaN");
  });

  // AC4b — invalid date string → fall back to (+thêm)
  it("AC4b: invalid triggered_at string falls back to (+thêm), never crashes", () => {
    const b = block(
      "MWG",
      [
        "Giá giảm ↓1.0% (A → B)",
        "Giá giảm ↓2.0% (B → C)",
      ],
      [
        "2026-04-29T06:30:00.000Z",
        "not-a-date",
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    expect(text).toContain("  - (+thêm) Giá giảm ↓2.0%");
  });

  // AC5 — non-price-drop lines unchanged
  it("AC5: volume_spike lines receive no qualifier", () => {
    const b = block(
      "FPT",
      [
        "Giá giảm ↓1.0% (A → B)",
        "KL bất thường 3.2× TB (1.200.000 / TB 375.000)",
      ],
      [
        "2026-04-29T06:30:00.000Z",
        "2026-04-29T06:00:00.000Z",
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    const vLine = text.split("\n").find((l) => l.includes("KL bất thường"));
    expect(vLine).toBeDefined();
    expect(vLine).not.toContain("(+");
    expect(vLine).not.toContain("(lũy kế)");
  });

  // AC6 — zero-alert path unchanged
  it("AC6: zero-alert digest is unchanged", () => {
    const text = formatAlertDigest(DATE, 0, 0, 0, []);
    expect(text).toContain("Không có cảnh báo");
    expect(text).not.toContain("(+");
  });

  // AC6b — single price_drop unchanged
  it("AC6b: single price_drop block unchanged", () => {
    const b = block(
      "VNM",
      ["Giá giảm ↓0.5% (X → Y)"],
      ["2026-04-29T06:30:00.000Z"],
    );
    const text = formatAlertDigest(DATE, 1, 0, 1, [b]);

    expect(text).toContain("Giá giảm ↓0.5%");
    expect(text).not.toContain("(+");
  });

  // Zero-pad check
  it("HH:MM values are zero-padded (e.g. 09:05 not 9:5)", () => {
    const b = block(
      "SSI",
      [
        "Giá giảm ↓1.0% (A → B)",
        "Giá giảm ↓2.0% (B → C)",
      ],
      [
        "2026-04-29T02:10:00.000Z", // 09:10 ICT
        "2026-04-29T02:05:00.000Z", // 09:05 ICT
      ],
    );
    const text = formatAlertDigest(DATE, 2, 0, 2, [b]);

    expect(text).toContain("(+09:05)");
    expect(text).not.toContain("(+9:5)");
  });
});
