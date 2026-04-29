/**
 * Task 1394 — TDD RED: formatAlertDigest diacritics
 *
 * Current implementation uses unaccented transliterated Vietnamese strings.
 * These tests assert CORRECT accented Vietnamese — they are RED against the
 * unchanged implementation and will go GREEN once Task 1395 applies the fix.
 *
 * T1: empty-state message must use "Không có cảnh báo" not "Khong co canh bao"
 * T2: digest header must use "Tóm tắt cảnh báo" not "Tom tat canh bao"
 * T3: summary line must use "Tổng", "cảnh báo", "Nghiêm trọng", "Quan trọng"
 * T4: per-stock block label must use "cảnh báo:" not "canh bao:"
 * T5: overflow line must use "(và N cảnh báo khác)" not "(va N canh bao khac)"
 */

import { describe, it, expect } from "bun:test";
import {
  formatAlertDigest,
  type StockAlertBlock,
} from "../application/usecases/assembleAlertDigest.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const DATE = "2026-04-17";

function makeBlock(
  code: string,
  count: number,
  messages: string[],
  overflow = 0,
): StockAlertBlock {
  return { code, count, topMessages: messages, topTriggeredAt: [], overflow };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1394 — formatAlertDigest proper Vietnamese diacritics (RED)", () => {
  it("T1: zero-alert message must contain 'Không có cảnh báo' not 'Khong co canh bao'", () => {
    const text = formatAlertDigest(DATE, 0, 0, 0, []);

    expect(text).toContain("Không có cảnh báo");
    expect(text).not.toContain("Khong co canh bao");
  });

  it("T2: digest header must contain 'Tóm tắt cảnh báo' not 'Tom tat canh bao'", () => {
    const block = makeBlock("VNM", 1, ["Stop-loss triggered"]);
    const text = formatAlertDigest(DATE, 1, 0, 1, [block]);

    expect(text).toContain("Tóm tắt cảnh báo");
    expect(text).not.toContain("Tom tat canh bao");
  });

  it("T3: summary line must use 'Tổng', 'cảnh báo', 'Nghiêm trọng', 'Quan trọng'", () => {
    const block = makeBlock("FPT", 2, ["Alert A", "Alert B"]);
    const text = formatAlertDigest(DATE, 2, 1, 1, [block]);

    expect(text).toContain("Tổng");
    expect(text).not.toContain("Tong:");
    expect(text).toContain("cảnh báo");
    // "canh bao" could also appear as part of "Khong co canh bao" in zero path;
    // here we verify the non-zero path summary line specifically
    expect(text).toContain("Nghiêm trọng");
    expect(text).not.toContain("Nghiem trong");
    expect(text).toContain("Quan trọng");
    expect(text).not.toContain("Quan trong");
  });

  it("T4: per-stock block label must use 'cảnh báo:' not 'canh bao:'", () => {
    const block = makeBlock("HPG", 1, ["Price dropped below stop-loss"]);
    const text = formatAlertDigest(DATE, 1, 0, 0, [block]);

    expect(text).toContain("cảnh báo:");
    expect(text).not.toContain("canh bao:");
  });

  it("T5: overflow line must use '(và' and 'cảnh báo khác)' not '(va' / 'canh bao khac)'", () => {
    const block = makeBlock(
      "MWG",
      5,
      ["Alert 1", "Alert 2", "Alert 3"],
      2, // overflow = 2
    );
    const text = formatAlertDigest(DATE, 5, 2, 1, [block]);

    expect(text).toContain("(và");
    expect(text).not.toContain("(va ");
    expect(text).toContain("cảnh báo khác)");
    expect(text).not.toContain("canh bao khac)");
  });
});
