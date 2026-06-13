/**
 * FIX-FUNDAMENTALS-REFRESH-CRON-DEAD — Regression tests
 *
 * Root cause: vnstock deprecated Vnstock().stock() API emits a banner with box-drawing
 * characters (╭╮│) to stdout. isRateLimitResponse() uses BOX_DRAWING_RE to detect
 * rate-limiting, so the banner was being mis-detected — all financial fetches returned
 * null, markFetched() was called, zero data landed in financial tables.
 *
 * Fix: suppress the vnstock deprecation banner by capturing sys.stdout during
 * Vnstock().stock() init in every Python script template (same pattern as EVENTS_SCRIPT).
 *
 * Tests:
 *   TC-1: isRateLimitResponse — box-drawing banner detected as rate-limit (regression proof)
 *   TC-2: isRateLimitResponse — JSON payload after banner prefix → detected as rate-limit
 *         (confirms the old code was broken for mixed output)
 *   TC-3: stripAnsiAndDetectJunk — clean JSON after ANSI strip → not junk
 *   TC-4: stripAnsiAndDetectJunk — box-drawing banner only → junk (not null, not JSON)
 *   TC-5: SUPPRESS_BANNER / RESTORE_STDOUT are exported and non-empty strings
 *         (confirms the preamble constants are defined for injection into Python scripts)
 *   TC-6: FINANCE_SCRIPT output (simulated) — JSON-only content passes junk check
 *   TC-7: isRateLimitResponse — real deprecation banner text → returns true
 *
 * @module __tests__/fix-fundamentals-refresh-cron-dead
 */

import { describe, it, expect } from "bun:test";
import {
  isRateLimitResponse,
  stripAnsiAndDetectJunk,
  SUPPRESS_BANNER,
  RESTORE_STDOUT,
} from "../infrastructure/fetchers/vnstockBridge.js";

// Real vnstock deprecation banner (box-drawing chars on stdout)
const VNSTOCK_BANNER = `
  ╭──────────────────────────────────────────────────────────╮
  │  ⚠️  VNSTOCK DEPRECATION NOTICE (31/08/2025)             │
  │                                                          │
  │  Lớp Vnstock và các phương thức cũ đã bị ngừng hỗ trợ. │
  ╰──────────────────────────────────────────────────────────╯
`;

const VALID_JSON = '{"code":"ACB","yearReport":2026,"quarter":1,"revenue":1234.5}';

// ── TC-1: banner detection ─────────────────────────────────────────────────────

describe("FIX-FUNDAMENTALS-REFRESH-CRON-DEAD — isRateLimitResponse (TC-1)", () => {
  it("TC-1: vnstock deprecation banner → isRateLimitResponse returns true (regression proof)", () => {
    // This confirms the root cause: isRateLimitResponse mis-classifies the banner
    // as a rate-limit response because both use box-drawing characters.
    expect(isRateLimitResponse(VNSTOCK_BANNER)).toBe(true);
  });

  it("TC-2: JSON prefixed by banner → still detected as rate-limit (confirms old code was broken)", () => {
    // Old scripts emitted: <banner>\n<json> — the banner came first
    const mixed = VNSTOCK_BANNER + "\n" + VALID_JSON;
    expect(isRateLimitResponse(mixed)).toBe(true);
  });

  it("TC-3: clean JSON without banner → isRateLimitResponse returns false", () => {
    expect(isRateLimitResponse(VALID_JSON)).toBe(false);
  });

  it("TC-4: empty string → isRateLimitResponse returns false", () => {
    expect(isRateLimitResponse("")).toBe(false);
  });

  it("TC-5: literal null string → isRateLimitResponse returns false", () => {
    expect(isRateLimitResponse("null")).toBe(false);
  });
});

// ── TC-2: stripAnsiAndDetectJunk (verifies clean JSON path) ──────────────────

describe("FIX-FUNDAMENTALS-REFRESH-CRON-DEAD — stripAnsiAndDetectJunk (TC-2)", () => {
  it("TC-6: clean JSON → junk=false, isNull=false", () => {
    const result = stripAnsiAndDetectJunk(VALID_JSON, "finance:ACB");
    expect(result.junk).toBe(false);
    expect(result.isNull).toBe(false);
    expect(result.cleaned).toBe(VALID_JSON);
  });

  it("TC-7: box-drawing banner only → junk=true (non-JSON first char)", () => {
    // After ANSI strip, the first char is whitespace then '╭' — not { or [
    const result = stripAnsiAndDetectJunk(VNSTOCK_BANNER.trim(), "finance:ACB");
    // Either junk=true or isNull=true depending on whether empty after strip
    expect(result.junk || result.isNull).toBe(true);
  });

  it("TC-8: empty string → isNull=true", () => {
    const result = stripAnsiAndDetectJunk("", "finance:ACB");
    expect(result.isNull).toBe(true);
    expect(result.junk).toBe(false);
  });

  it("TC-9: literal null → isNull=true", () => {
    const result = stripAnsiAndDetectJunk("null", "finance:ACB");
    expect(result.isNull).toBe(true);
    expect(result.junk).toBe(false);
  });
});

// ── TC-3: SUPPRESS_BANNER / RESTORE_STDOUT exported constants ────────────────

describe("FIX-FUNDAMENTALS-REFRESH-CRON-DEAD — banner suppression constants (TC-3)", () => {
  it("TC-10: SUPPRESS_BANNER is a non-empty string containing stdout redirect", () => {
    expect(typeof SUPPRESS_BANNER).toBe("string");
    expect(SUPPRESS_BANNER.length).toBeGreaterThan(0);
    // Must contain the core stdout capture pattern (using _sys/_io aliases)
    expect(SUPPRESS_BANNER).toContain("_sys.stdout");
    expect(SUPPRESS_BANNER).toContain("_io.StringIO()");
  });

  it("TC-11: RESTORE_STDOUT is a non-empty string that restores real stdout", () => {
    expect(typeof RESTORE_STDOUT).toBe("string");
    expect(RESTORE_STDOUT.length).toBeGreaterThan(0);
    expect(RESTORE_STDOUT).toContain("_real_stdout");
  });

  it("TC-12: SUPPRESS_BANNER + RESTORE_STDOUT together form valid Python syntax pattern", () => {
    // The combination must contain: save → redirect → restore
    const combined = SUPPRESS_BANNER + RESTORE_STDOUT;
    expect(combined).toContain("_real_stdout = _sys.stdout");
    expect(combined).toContain("_sys.stdout = _io.StringIO()");
    expect(combined).toContain("_sys.stdout = _real_stdout");
  });
});
