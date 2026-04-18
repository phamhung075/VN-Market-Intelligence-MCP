/**
 * Task 180 — Decision note synthesis in get_portfolio_conviction
 *
 * Tests for:
 *   1. buildPositionLine — formats P&L display line
 *   2. buildActionNote  — deterministic rule-based Vietnamese action note
 */

import { describe, it, expect } from "bun:test";
import {
  buildPositionLine,
  buildActionNote,
  type ActionNoteInput,
} from "../domain/services/decisionNoteSynthesizer.js";

// ─────────────────────────────────────────────────────────────────────────────
// buildPositionLine
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 180 — buildPositionLine", () => {
  it("formats a positive P&L line correctly", () => {
    const line = buildPositionLine({
      shares: 1000,
      avgPrice: 75_000,
      currentPrice: 85_000,
      pnlPct: 13.33,
    });
    expect(line).toContain("1,000");
    expect(line).toContain("75,000");
    expect(line).toContain("85,000");
    expect(line).toContain("+13.33%");
  });

  it("formats a negative P&L line correctly", () => {
    const line = buildPositionLine({
      shares: 500,
      avgPrice: 100_000,
      currentPrice: 88_000,
      pnlPct: -12.0,
    });
    expect(line).toContain("500");
    expect(line).toContain("-12.00%");
  });

  it("includes keyword labels in Vietnamese", () => {
    const line = buildPositionLine({
      shares: 200,
      avgPrice: 50_000,
      currentPrice: 55_000,
      pnlPct: 10.0,
    });
    // Should contain position info indicator
    expect(line).toMatch(/Vị thế|cổ phiếu|Giá|Lãi/u);
  });

  it("returns CHƯA CÓ VỊ THẾ when no position data", () => {
    const line = buildPositionLine(null);
    expect(line).toContain("CHƯA CÓ VỊ THẾ");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildActionNote — decision rules
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 180 — buildActionNote", () => {
  it("returns THÊM VÀO when conviction >= 0.8 and pnlPct > 0", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.85,
      pnlPct: 5.0,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("THÊM VÀO");
  });

  it("returns THÊM VÀO at exactly conviction = 0.8 with positive P&L", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.8,
      pnlPct: 1.0,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("THÊM VÀO");
  });

  it("returns GIỮ NGUYÊN when conviction 0.6 <= score < 0.8", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.7,
      pnlPct: 2.0,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIỮ NGUYÊN");
  });

  it("returns GIỮ NGUYÊN at exactly conviction = 0.6", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.6,
      pnlPct: 0.0,
      direction: "neutral",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIỮ NGUYÊN");
  });

  it("returns XEM XÉT GIẢM when conviction 0.4-0.6 and pnlPct < -5", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.5,
      pnlPct: -8.0,
      direction: "bearish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("XEM XÉT GIẢM");
  });

  it("returns GIỮ NGUYÊN when conviction 0.4-0.6 and pnlPct >= -5", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.5,
      pnlPct: -3.0,
      direction: "neutral",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIỮ NGUYÊN");
  });

  it("returns GIẢM BỚT when conviction < 0.4", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.3,
      pnlPct: 2.0,
      direction: "bearish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIẢM BỚT");
  });

  it("returns GIẢM BỚT when pnlPct < -10 regardless of conviction", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.75,
      pnlPct: -15.0,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIẢM BỚT");
  });

  it("returns CHƯA CÓ VỊ THẾ when pnlPct is null (no position)", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.9,
      pnlPct: null,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("CHƯA CÓ VỊ THẾ");
  });

  it("note starts with Khuyến nghị:", () => {
    const note = buildActionNote({ convictionScore: 0.7, pnlPct: 3.0, direction: "bullish" });
    expect(note).toMatch(/^Khuyến nghị:/);
  });

  it("THÊM VÀO requires conviction >= 0.8 — just below threshold goes to GIỮ NGUYÊN", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.79,
      pnlPct: 10.0,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIỮ NGUYÊN");
    expect(note).not.toContain("THÊM VÀO");
  });

  it("GIẢM BỚT at conviction < 0.4 with positive P&L", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.39,
      pnlPct: 5.0,
      direction: "neutral",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIẢM BỚT");
  });
});
