/**
 * Task 1918a — Alert Commander macro snapshot shape guard
 *
 * Tests for `isMacroSnapshotValidShape` — the guard function that detects
 * when `get_macro_snapshot` returns a system_status payload instead of the
 * expected macro regime text shape.
 *
 * Valid shape:  { text: string, fetchedAt: string, source_tier: number }
 * Invalid shape: { status: string, message?: string }  ← system_status bleed
 */
import { describe, it, expect } from "bun:test";
import { isMacroSnapshotValidShape } from "../interface/mcp/tools/macro/macroSnapshotGuard.js";

describe("Task 1918a — macro snapshot shape guard", () => {
  // ── valid shapes ──────────────────────────────────────────────────────────

  it("accepts the normal success payload", () => {
    const response = {
      source_tier: 2,
      text: "Global Liquidity: NEUTRAL\nVND Carry Spread: NEUTRAL\n...",
      fetchedAt: "2026-05-15T00:02:00.000Z",
    };
    expect(isMacroSnapshotValidShape(response)).toBe(true);
  });

  it("accepts payload with text but missing optional fields", () => {
    const response = { text: "Global Liquidity: EASING" };
    expect(isMacroSnapshotValidShape(response)).toBe(true);
  });

  // ── system_status mismatch fixture (core fix) ─────────────────────────────

  it("rejects system_status degraded payload — guard fires, fallback activated", () => {
    const systemStatusPayload = { status: "degraded", message: "macro service unreachable" };
    expect(isMacroSnapshotValidShape(systemStatusPayload)).toBe(false);
  });

  it("rejects system_status ok payload — no text field present", () => {
    const systemStatusOk = { status: "ok", uptime: 99 };
    expect(isMacroSnapshotValidShape(systemStatusOk)).toBe(false);
  });

  // ── error shape from get_macro_snapshot itself ────────────────────────────

  it("rejects the error shape returned by get_macro_snapshot on unexpected exception", () => {
    const errorPayload = { source_tier: 2, error: "Error fetching macro snapshot: timeout" };
    expect(isMacroSnapshotValidShape(errorPayload)).toBe(false);
  });

  // ── edge cases ────────────────────────────────────────────────────────────

  it("rejects null", () => {
    expect(isMacroSnapshotValidShape(null)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isMacroSnapshotValidShape(undefined)).toBe(false);
  });

  it("rejects empty object", () => {
    expect(isMacroSnapshotValidShape({})).toBe(false);
  });

  it("rejects object with numeric text field", () => {
    expect(isMacroSnapshotValidShape({ text: 42 })).toBe(false);
  });

  it("rejects non-object (string)", () => {
    expect(isMacroSnapshotValidShape("Global Liquidity: NEUTRAL")).toBe(false);
  });
});
