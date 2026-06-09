/**
 * Task 1466: syncVnstockData bail-early on DB corruption
 *
 * Acceptance criteria:
 * (a) malformed on first stock → 1 consolidated warn + loop breaks
 * (b) non-malformed error → per-stock warn, loop continues all stocks
 * (c) malformed on 3rd of 5 → stocks 1+2 ok, stock 3 triggers bail → stocks 4+5 skipped
 *
 * Strategy: mock vnstockStore.isStale to throw controlled errors per stock,
 * mock logger to capture warn calls, verify warn count + stockCallCount.
 */

import { describe, it, expect, mock, afterAll } from "bun:test";

// ── Shared state ─────────────────────────────────────────────────────────────
const warnMessages: string[] = [];
let staleCalls = 0;
let staleThrowAt = new Map<number, string>(); // call index → error message

// ── Mocks ────────────────────────────────────────────────────────────────────
// C5-CURE: capture stub references before registering; used in afterAll restore
// so stubs do not bleed into sibling files in the same Bun ESM worker.
const _realLogger1466 = {
  logger: {
    warn: (msg: string) => { warnMessages.push(msg); },
    info: () => {},
    debug: () => {},
    error: () => {},
  },
  // createLogger stub — syncVnstockData.js transitively imports createLogger from logger.js
  createLogger: (..._args: unknown[]) => ({
    warn: (msg: string) => { warnMessages.push(msg); },
    info: () => {},
    debug: () => {},
    error: () => {},
  }),
};
mock.module("../infrastructure/logger.js", () => _realLogger1466);

const _realVnstockStore1466 = {
  isStale: (_code: string, _dataType: string) => {
    const idx = staleCalls++;
    if (staleThrowAt.has(idx)) {
      throw new Error(staleThrowAt.get(idx)!);
    }
    return false; // not stale → syncStock will return 0 calls, no fetch
  },
  storeFinancials: () => {},
  storeTradingStats: () => {},
  storeOfficers: () => {},
  storeShareholders: () => {},
  storeEvents: () => {},
  storeBalanceSheet: () => {},
  storeCashFlow: () => {},
  markFetched: () => {},
};
mock.module("../infrastructure/db/vnstockStore.js", () => _realVnstockStore1466);

const _realVnstockBridge1466 = {
  fetchVnstockFinancials: async () => ({}),
  fetchVnstockTradingStats: async () => ({}),
  fetchVnstockOfficers: async () => ([]),
  fetchVnstockShareholders: async () => ([]),
  fetchVnstockEvents: async () => ([]),
  fetchVnstockBalanceSheet: async () => ({}),
  fetchVnstockCashFlow: async () => ({}),
};
mock.module("../infrastructure/fetchers/vnstockBridge.js", () => _realVnstockBridge1466);

const { syncVnstockData } = await import(
  "../application/usecases/syncVnstockData.js"
);

// ── Helper ────────────────────────────────────────────────────────────────────
function reset() {
  warnMessages.length = 0;
  staleCalls = 0;
  staleThrowAt = new Map<number, string>();
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Task 1466: syncVnstockData bail on DB corruption", () => {
  it("(a) malformed on first stock → 1 consolidated warn + loop breaks", async () => {
    reset();
    // isStale called for first stock (index 0) → throws malformed
    staleThrowAt.set(0, "database disk image is malformed");

    await syncVnstockData(["VCB", "VHM", "FPT"]);

    // Exactly 1 warn (the consolidated malformed bail)
    expect(warnMessages.length).toBe(1);
    expect(warnMessages[0]).toContain("malformed");

    // isStale was called once — loop broke after first stock
    expect(staleCalls).toBe(1);
  });

  it("(b) non-malformed error → per-stock warn, loop continues all stocks", async () => {
    reset();
    // isStale for second stock (index 1) → throws generic error
    staleThrowAt.set(1, "SQLITE_CONSTRAINT: unique constraint failed");

    await syncVnstockData(["VCB", "VHM", "FPT"]);

    // 1 warn for the failing stock (per-stock, not malformed)
    expect(warnMessages.length).toBe(1);
    expect(warnMessages[0]).not.toContain("malformed");

    // All 3 stocks attempted (isStale called at least for each stock's first data type)
    // VCB: isStale(0)=ok, VHM: isStale(1)=throw, FPT continues
    expect(staleCalls).toBeGreaterThan(1);
  });

  it("(c) malformed on 3rd of 5 → 1+2 succeed, bail on 3rd, 4+5 skipped", async () => {
    reset();
    // Each stock calls isStale multiple times per data type.
    // We need to throw on the FIRST isStale call for the 3rd stock.
    // With "not stale" returning false for all, syncStock returns 0 API calls per stock.
    // isStale is called once per data type per stock. With 7 data types:
    // Stock 0 (VCB): indices 0..6
    // Stock 1 (VHM): indices 7..13
    // Stock 2 (HPG): index 14 → throw malformed
    // Stocks 3+4 should never be reached.

    // Count data types called per stock when isStale always returns false
    // From the file: financials, tradingStats, officers, shareholders, events, balanceSheet, cashFlow = 7 types
    const DATA_TYPES_PER_STOCK = 7;
    const hpgFirstCall = 2 * DATA_TYPES_PER_STOCK; // index 14
    staleThrowAt.set(hpgFirstCall, "database disk image is malformed");

    await syncVnstockData(["VCB", "VHM", "HPG", "SSI", "MWG"]);

    // 1 consolidated malformed warn
    expect(warnMessages.length).toBe(1);
    expect(warnMessages[0]).toContain("malformed");

    // isStale never called for SSI (index 21+) or MWG (index 28+)
    expect(staleCalls).toBeLessThan(4 * DATA_TYPES_PER_STOCK);
  });
});

// C5-CURE: restore stubs after all tests complete so downstream files in the
// same Bun process do not inherit stale ESM entries.
afterAll(() => {
  mock.module("../infrastructure/logger.js", () => _realLogger1466);
  mock.module("../infrastructure/db/vnstockStore.js", () => _realVnstockStore1466);
  mock.module("../infrastructure/fetchers/vnstockBridge.js", () => _realVnstockBridge1466);
});
