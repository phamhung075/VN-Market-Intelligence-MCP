/**
 * Task 1776 — vnstock ANSI escape sequence stripping + circuit breaker
 *
 * Tests:
 * 1. runPython with ANSI stdout → returns null (not throws)
 * 2. runPython with box-drawing characters only → returns null
 * 3. runPython with valid JSON → parses correctly
 * 4. runPython with "null" string → returns null
 * 5. Circuit breaker opens after 3 consecutive nulls for same type
 * 6. Circuit breaker skips fetch while open
 * 7. Circuit breaker resets after 2h (mock clock)
 * 8. Telegram alert sent when >= 10 codes have open circuit, not before
 * 9. Telegram alert respects 60-min cooldown
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  stripAnsiAndDetectJunk,
  type JunkCheckResult,
} from "../infrastructure/fetchers/vnstockBridge.js";
import {
  makeCbState,
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  shouldFireBulkAlert,
  resetLastAlertAt,
  type CbStateMap,
} from "../application/usecases/syncVnstockData.js";

// ---------------------------------------------------------------------------
// Tests 1–4: ANSI stripping in vnstockBridge
// ---------------------------------------------------------------------------

describe("Task 1776 — ANSI stripping (stripAnsiAndDetectJunk)", () => {
  it("1. ANSI escape sequences → returns { junk: true, cleaned: '' }", () => {
    const ansiOutput =
      "\x1b[0m\x1b[32m╭─────────────────────────────────────────╮\x1b[0m\n" +
      "\x1b[32m│\x1b[0m  Fetching data, please wait...          \x1b[32m│\x1b[0m\n" +
      "\x1b[32m╰─────────────────────────────────────────╯\x1b[0m";
    const result = stripAnsiAndDetectJunk(ansiOutput, "test");
    expect(result.junk).toBe(true);
  });

  it("2. Box-drawing characters only → returns junk", () => {
    const boxOutput = "╭──────────────╮\n│  Loading...  │\n╰──────────────╯";
    const result = stripAnsiAndDetectJunk(boxOutput, "test");
    expect(result.junk).toBe(true);
  });

  it("3. Valid JSON object → returns { junk: false, cleaned: <json> }", () => {
    const json = '{"code":"VCB","revenue":123.45}';
    const result = stripAnsiAndDetectJunk(json, "test");
    expect(result.junk).toBe(false);
    expect(result.cleaned).toBe(json);
  });

  it("3b. Valid JSON array → returns { junk: false }", () => {
    const json = '[{"code":"VCB"},{"code":"BID"}]';
    const result = stripAnsiAndDetectJunk(json, "test");
    expect(result.junk).toBe(false);
    expect(result.cleaned).toBe(json);
  });

  it("4. 'null' string → returns { junk: false, cleaned: '' } signalling null return", () => {
    const result = stripAnsiAndDetectJunk("null", "test");
    // "null" is handled separately (returns null before JSON.parse) but
    // the function marks it as isNull so caller returns null cleanly
    expect(result.isNull).toBe(true);
  });

  it("4b. Empty string → returns isNull true", () => {
    const result = stripAnsiAndDetectJunk("", "test");
    expect(result.isNull).toBe(true);
  });

  it("Non-JSON first char (letter) → returns junk with warning", () => {
    // e.g. "Error: rate limited"
    const result = stripAnsiAndDetectJunk("Error: rate limited by VCI", "test");
    expect(result.junk).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Tests 5–9: Circuit breaker in syncVnstockData
// ---------------------------------------------------------------------------

describe("Task 1776 — circuit breaker (syncVnstockData)", () => {
  const FAIL_THRESHOLD = 3;
  const RESET_MS = 2 * 60 * 60 * 1000; // 2h

  let cbState: CbStateMap;

  beforeEach(() => {
    cbState = makeCbState();
  });

  it("5. Circuit opens after 3 consecutive nulls for same type", () => {
    const type = "financials";
    const code = "VCB";

    expect(isCircuitOpen(cbState, code, type)).toBe(false);
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    expect(isCircuitOpen(cbState, code, type)).toBe(false);
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    expect(isCircuitOpen(cbState, code, type)).toBe(false);
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    // After 3rd failure, circuit opens
    expect(isCircuitOpen(cbState, code, type)).toBe(true);
  });

  it("6. Circuit skips fetch while open (isCircuitOpen returns true)", () => {
    const type = "balance_sheet";
    const code = "BID";
    // Open circuit manually
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    recordFailure(cbState, code, type, FAIL_THRESHOLD);

    expect(isCircuitOpen(cbState, code, type)).toBe(true);
    // Simulate skip: no further failures incremented, still open
    expect(isCircuitOpen(cbState, code, type)).toBe(true);
  });

  it("7. Circuit resets after 2h (openedAt old enough)", () => {
    const type = "cash_flow";
    const code = "TCB";
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    expect(isCircuitOpen(cbState, code, type)).toBe(true);

    // Mock: back-date openedAt beyond RESET_MS
    const key = `${code}:${type}`;
    cbState[key]!.openedAt = Date.now() - RESET_MS - 1000;
    expect(isCircuitOpen(cbState, code, type)).toBe(false);
  });

  it("7b. recordSuccess resets circuit state", () => {
    const type = "financials";
    const code = "MBB";
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    recordFailure(cbState, code, type, FAIL_THRESHOLD);
    expect(isCircuitOpen(cbState, code, type)).toBe(true);

    recordSuccess(cbState, code, type);
    expect(isCircuitOpen(cbState, code, type)).toBe(false);
    const key = `${code}:${type}`;
    expect(cbState[key]?.failures).toBe(0);
    expect(cbState[key]?.openedAt).toBeNull();
  });

  it("8. Bulk alert fired when >= 10 codes have open circuit, NOT before", () => {
    const type = "financials";
    const codes = Array.from({ length: 12 }, (_, i) => `STOCK${i}`);

    // Open circuit for 9 codes → no alert
    for (const code of codes.slice(0, 9)) {
      recordFailure(cbState, code, type, FAIL_THRESHOLD);
      recordFailure(cbState, code, type, FAIL_THRESHOLD);
      recordFailure(cbState, code, type, FAIL_THRESHOLD);
    }
    const openCount9 = codes.filter((c) => isCircuitOpen(cbState, c, type)).length;
    expect(openCount9).toBe(9);
    expect(shouldFireBulkAlert(cbState, codes, [type], 0)).toBe(false);

    // Open circuit for 10th code → alert should fire
    recordFailure(cbState, codes[9]!, type, FAIL_THRESHOLD);
    recordFailure(cbState, codes[9]!, type, FAIL_THRESHOLD);
    recordFailure(cbState, codes[9]!, type, FAIL_THRESHOLD);
    expect(shouldFireBulkAlert(cbState, codes, [type], 0)).toBe(true);
  });

  it("9. Telegram alert respects 60-min cooldown", () => {
    const type = "financials";
    const codes = Array.from({ length: 12 }, (_, i) => `TICKER${i}`);

    // Open 12 circuits
    for (const code of codes) {
      recordFailure(cbState, code, type, FAIL_THRESHOLD);
      recordFailure(cbState, code, type, FAIL_THRESHOLD);
      recordFailure(cbState, code, type, FAIL_THRESHOLD);
    }

    const COOLDOWN_MS = 60 * 60 * 1000;

    // First call with lastAlertAt=0 → should fire
    expect(shouldFireBulkAlert(cbState, codes, [type], 0)).toBe(true);

    // Second call with lastAlertAt=just now → cooldown active → should NOT fire
    const justNow = Date.now();
    expect(shouldFireBulkAlert(cbState, codes, [type], justNow)).toBe(false);

    // Third call with lastAlertAt=61 min ago → cooldown expired → should fire
    const sixtyOneMinAgo = Date.now() - COOLDOWN_MS - 60_000;
    expect(shouldFireBulkAlert(cbState, codes, [type], sixtyOneMinAgo)).toBe(true);
  });
});
