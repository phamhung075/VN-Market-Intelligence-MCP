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
    expect(line.toLowerCase()).toMatch(/vi the|co phieu|gia|lai/i);
  });

  it("returns CHUA CO VI THE when no position data", () => {
    const line = buildPositionLine(null);
    expect(line).toContain("CHUA CO VI THE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildActionNote — decision rules
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 180 — buildActionNote", () => {
  it("returns THEM VAO when conviction >= 0.8 and pnlPct > 0", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.85,
      pnlPct: 5.0,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("THEM VAO");
  });

  it("returns THEM VAO at exactly conviction = 0.8 with positive P&L", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.8,
      pnlPct: 1.0,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("THEM VAO");
  });

  it("returns GIU NGUYEN when conviction 0.6 <= score < 0.8", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.7,
      pnlPct: 2.0,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIU NGUYEN");
  });

  it("returns GIU NGUYEN at exactly conviction = 0.6", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.6,
      pnlPct: 0.0,
      direction: "neutral",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIU NGUYEN");
  });

  it("returns XEM XET GIAM when conviction 0.4-0.6 and pnlPct < -5", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.5,
      pnlPct: -8.0,
      direction: "bearish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("XEM XET GIAM");
  });

  it("returns GIU NGUYEN when conviction 0.4-0.6 and pnlPct >= -5", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.5,
      pnlPct: -3.0,
      direction: "neutral",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIU NGUYEN");
  });

  it("returns GIAM BOT when conviction < 0.4", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.3,
      pnlPct: 2.0,
      direction: "bearish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIAM BOT");
  });

  it("returns GIAM BOT when pnlPct < -10 regardless of conviction", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.75,
      pnlPct: -15.0,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIAM BOT");
  });

  it("returns CHUA CO VI THE when pnlPct is null (no position)", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.9,
      pnlPct: null,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("CHUA CO VI THE");
  });

  it("note starts with Khuyen nghi:", () => {
    const note = buildActionNote({ convictionScore: 0.7, pnlPct: 3.0, direction: "bullish" });
    expect(note).toMatch(/^Khuyen nghi:/);
  });

  it("THEM VAO requires conviction >= 0.8 — just below threshold goes to GIU NGUYEN", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.79,
      pnlPct: 10.0,
      direction: "bullish",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIU NGUYEN");
    expect(note).not.toContain("THEM VAO");
  });

  it("GIAM BOT at conviction < 0.4 with positive P&L", () => {
    const input: ActionNoteInput = {
      convictionScore: 0.39,
      pnlPct: 5.0,
      direction: "neutral",
    };
    const note = buildActionNote(input);
    expect(note).toContain("GIAM BOT");
  });
});
