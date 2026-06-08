/**
 * Task 1823b — vnstock rate-limit: WORK log on bulk circuit open + per-ticker backoff
 *
 * Tests:
 * 1. countOpenCircuits returns correct open ticker count
 * 2. Per-ticker backoff: first open → 2h reset, second open → 4h, third → 8h (capped)
 * 3. recordSuccess resets consecutiveOpens to 0
 * 4. Backoff cap: consecutiveOpens > 2 still resolves to 8h max
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import {
  makeCbState,
  isCircuitOpen,
  recordFailure,
  recordSuccess,
  countOpenCircuits,
  type CbStateMap,
} from "../application/usecases/syncVnstockData.js";

const FAIL_THRESHOLD = 3;

function openCircuit(state: CbStateMap, code: string, type: string): void {
  recordFailure(state, code, type, FAIL_THRESHOLD);
  recordFailure(state, code, type, FAIL_THRESHOLD);
  recordFailure(state, code, type, FAIL_THRESHOLD);
}

describe("Task 1823b — countOpenCircuits", () => {
  it("1a. returns 0 when no circuits open", () => {
    const state = makeCbState();
    const codes = ["VCB", "BID", "TCB"];
    expect(countOpenCircuits(state, codes, ["financials"])).toBe(0);
  });

  it("1b. counts tickers with any open circuit type (not per-type)", () => {
    const state = makeCbState();
    const codes = ["VCB", "BID", "TCB", "MBB"];
    openCircuit(state, "VCB", "financials");
    openCircuit(state, "BID", "balance_sheet");
    // TCB and MBB untouched
    expect(countOpenCircuits(state, codes, ["financials", "balance_sheet", "cash_flow"])).toBe(2);
  });

  it("1c. ticker with multiple open types counted once", () => {
    const state = makeCbState();
    const codes = ["VCB"];
    openCircuit(state, "VCB", "financials");
    openCircuit(state, "VCB", "balance_sheet");
    expect(countOpenCircuits(state, codes, ["financials", "balance_sheet"])).toBe(1);
  });
});

describe("Task 1823b — per-ticker exponential backoff", () => {
  const BASE_RESET_MS = 2 * 60 * 60 * 1000; // 2h
  const MAX_BACKOFF_MS = 8 * 60 * 60 * 1000; // 8h

  it("2a. first circuit open → 2h reset window (consecutiveOpens=1)", () => {
    const state = makeCbState();
    openCircuit(state, "VCB", "financials");
    // Circuit is open; backdating by exactly 2h+1ms should expire it
    const key = "VCB:financials";
    state[key]!.openedAt = Date.now() - (BASE_RESET_MS + 1);
    expect(isCircuitOpen(state, "VCB", "financials")).toBe(false);
  });

  it("2b. second open without success → 4h reset window (consecutiveOpens=2)", () => {
    const state = makeCbState();
    // First open, then expire it (but no success — so consecutiveOpens stays 1)
    openCircuit(state, "VCB", "financials");
    const key = "VCB:financials";
    // Manually expire the first open so the circuit closes on next isCircuitOpen check
    state[key]!.openedAt = Date.now() - (BASE_RESET_MS + 1);
    expect(isCircuitOpen(state, "VCB", "financials")).toBe(false); // expired, closed now

    // Re-open (second open, no success in between) → consecutiveOpens becomes 2
    // Reset failures so recordFailure can trip again
    state[key]!.failures = 0;
    state[key]!.openedAt = null;
    openCircuit(state, "VCB", "financials");

    const EFFECTIVE_RESET = 2 * BASE_RESET_MS; // 4h
    // At 2h+1ms → still open (needs 4h)
    state[key]!.openedAt = Date.now() - (BASE_RESET_MS + 1);
    expect(isCircuitOpen(state, "VCB", "financials")).toBe(true);
    // At 4h+1ms → expired
    state[key]!.openedAt = Date.now() - (EFFECTIVE_RESET + 1);
    expect(isCircuitOpen(state, "VCB", "financials")).toBe(false);
  });

  it("2c. third open without success → capped at 8h reset window", () => {
    const state = makeCbState();
    openCircuit(state, "TCB", "cash_flow");
    const key = "TCB:cash_flow";

    // Simulate expiry + re-open twice more (no success)
    for (let i = 0; i < 2; i++) {
      state[key]!.openedAt = Date.now() - (MAX_BACKOFF_MS + 1); // expire current
      isCircuitOpen(state, "TCB", "cash_flow"); // tick (not used for state, just reads)
      state[key]!.failures = 0;
      state[key]!.openedAt = null;
      openCircuit(state, "TCB", "cash_flow");
    }

    // At 4h+1ms → still open (needs 8h)
    state[key]!.openedAt = Date.now() - (2 * BASE_RESET_MS + 1);
    expect(isCircuitOpen(state, "TCB", "cash_flow")).toBe(true);
    // At 8h+1ms → expired
    state[key]!.openedAt = Date.now() - (MAX_BACKOFF_MS + 1);
    expect(isCircuitOpen(state, "TCB", "cash_flow")).toBe(false);
  });

  it("3. recordSuccess resets consecutiveOpens to 0 (back to 2h on next open)", () => {
    const state = makeCbState();
    openCircuit(state, "MBB", "financials");
    // Expire + re-open without success → consecutiveOpens=2
    const key = "MBB:financials";
    state[key]!.openedAt = null;
    state[key]!.failures = 0;
    openCircuit(state, "MBB", "financials");
    expect(state[key]?.consecutiveOpens).toBe(2);

    // Now success resets it
    recordSuccess(state, "MBB", "financials");
    expect(state[key]?.consecutiveOpens).toBe(0);
    // Re-open → consecutiveOpens=1 again (2h window)
    openCircuit(state, "MBB", "financials");
    expect(state[key]?.consecutiveOpens).toBe(1);
  });

  it("4. consecutiveOpens > 2 stays capped at 8h (no unbounded growth)", () => {
    const state = makeCbState();
    const key = "HPG:balance_sheet";
    // Open 5 times without success
    openCircuit(state, "HPG", "balance_sheet");
    for (let i = 0; i < 4; i++) {
      state[key]!.openedAt = null;
      state[key]!.failures = 0;
      openCircuit(state, "HPG", "balance_sheet");
    }
    expect(state[key]?.consecutiveOpens).toBe(5);
    // Even with consecutiveOpens=5, effective reset is still capped at 8h
    state[key]!.openedAt = Date.now() - (MAX_BACKOFF_MS + 1);
    expect(isCircuitOpen(state, "HPG", "balance_sheet")).toBe(false);
  });
});
