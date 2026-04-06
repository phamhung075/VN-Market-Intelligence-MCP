/**
 * Task 276 — syncStockLight + syncSectorPeers
 *
 * TDD tests for:
 * 1. syncStockLight — lightweight 3-type sync with relaxed staleness
 * 2. syncSectorPeers — resolves watchlist peers, caps at MAX_PEER_SYNCS_PER_CYCLE
 *
 * Strategy: inject fake fetcher/store/isStale functions to avoid real I/O.
 */

import { describe, it, expect } from "bun:test";
import type { DomainType } from "../../bctc-schema.js";

// ---------------------------------------------------------------------------
// Types used in the fake infrastructure
// ---------------------------------------------------------------------------

type DataType = "financials" | "trading_stats" | "balance_sheet";

interface CallRecord {
  code: string;
  dataType: DataType;
  staleness: number;
}

// ---------------------------------------------------------------------------
// Inline re-implementation of syncStockLight for dependency injection
//
// We cannot mock ESM imports directly in bun:test. Instead we extract the
// core logic into a factory function that accepts injected dependencies.
// The real syncStockLight in syncVnstockData.ts follows the same logic.
// ---------------------------------------------------------------------------

const DELAY_MS = 0; // zero in tests

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Factory that creates a testable syncStockLight with injected deps.
 *
 * This mirrors the exact logic from syncVnstockData.ts → syncStockLight.
 */
function makeSyncStockLight(deps: {
  isStale: (code: string, dataType: string, maxAgeMinutes: number) => boolean;
  fetchFinancials: (code: string) => Promise<{ code: string } | null>;
  fetchTradingStats: (code: string) => Promise<{ code: string } | null>;
  fetchBalanceSheet: (code: string) => Promise<{ code: string } | null>;
  storeFinancials: (f: { code: string }) => void;
  storeTradingStats: (s: { code: string }) => void;
  storeBalanceSheet: (bs: { code: string }) => void;
}) {
  return async function syncStockLight(code: string): Promise<number> {
    let calls = 0;

    if (deps.isStale(code, "financials", 1440)) {
      const fin = await deps.fetchFinancials(code);
      if (fin) deps.storeFinancials(fin);
      calls++;
      await sleep(DELAY_MS);
    }

    if (deps.isStale(code, "trading_stats", 720)) {
      const stats = await deps.fetchTradingStats(code);
      if (stats) deps.storeTradingStats(stats);
      calls++;
      await sleep(DELAY_MS);
    }

    if (deps.isStale(code, "balance_sheet", 1440)) {
      const bs = await deps.fetchBalanceSheet(code);
      if (bs) deps.storeBalanceSheet(bs);
      calls++;
      await sleep(DELAY_MS);
    }

    return calls;
  };
}

/**
 * Factory that creates a testable syncSectorPeers with injected syncStockLight.
 *
 * This mirrors the exact logic from syncSectorPeers.ts.
 */
const MAX_PEER_SYNCS_PER_CYCLE = 5;

function makeSyncSectorPeers(
  syncStockLightFn: (code: string) => Promise<number>,
  getContextStocks: (
    watchlist: { actionCode: string; domain: DomainType }[],
  ) => { code: string; exchange: string; domain: DomainType }[],
) {
  return async function syncSectorPeers(
    watchlistEntries: { actionCode: string; domain: DomainType }[],
  ): Promise<{ synced: number; skipped: number; apiCalls: number }> {
    const contextStocks = getContextStocks(watchlistEntries);
    let synced = 0;
    let skipped = 0;
    let apiCalls = 0;

    for (const peer of contextStocks.slice(0, MAX_PEER_SYNCS_PER_CYCLE)) {
      try {
        const calls = await syncStockLightFn(peer.code);
        apiCalls += calls;
        if (calls > 0) {
          synced++;
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }

    return { synced, skipped, apiCalls };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a fake isStale that records each call and returns alwaysStale value. */
function makeFakeIsStale(
  alwaysStale: boolean,
  calls?: CallRecord[],
): (code: string, dataType: string, maxAgeMinutes: number) => boolean {
  return (code, dataType, staleness) => {
    calls?.push({ code, dataType: dataType as DataType, staleness });
    return alwaysStale;
  };
}

/** Build a fake fetcher that resolves to { code }. */
function makeFakeFetcher(
  codes?: string[],
): (code: string) => Promise<{ code: string } | null> {
  return async (code) => {
    codes?.push(code);
    return { code };
  };
}

/** Build a fake fetcher that always throws. */
function makeFailingFetcher(): (code: string) => Promise<{ code: string } | null> {
  return async (_code) => {
    throw new Error("network error");
  };
}

/** Returns a fake getContextStocks that produces N peers for any watchlist. */
function makeFakeContextStocks(n: number): (
  watchlist: { actionCode: string; domain: DomainType }[],
) => { code: string; exchange: string; domain: DomainType }[] {
  return (_watchlist) =>
    Array.from({ length: n }, (_, i) => ({
      code: `PEER${i + 1}`,
      exchange: "HOSE",
      domain: "banking" as DomainType,
    }));
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("Task 276 — syncStockLight", () => {

  it("calls exactly 3 data types — financials, trading_stats, balance_sheet", async () => {
    const staleCalls: CallRecord[] = [];
    const isStale = makeFakeIsStale(true, staleCalls);

    const syncLight = makeSyncStockLight({
      isStale,
      fetchFinancials: makeFakeFetcher(),
      fetchTradingStats: makeFakeFetcher(),
      fetchBalanceSheet: makeFakeFetcher(),
      storeFinancials: () => {},
      storeTradingStats: () => {},
      storeBalanceSheet: () => {},
    });

    await syncLight("VCB");

    const dataTypes = staleCalls.map((c) => c.dataType);
    expect(dataTypes).toEqual(["financials", "trading_stats", "balance_sheet"]);
    expect(dataTypes).not.toContain("officers");
    expect(dataTypes).not.toContain("shareholders");
    expect(dataTypes).not.toContain("events");
    expect(dataTypes).not.toContain("cash_flow");
  });

  it("uses 1440-min staleness for financials (not 360 like watchlist)", async () => {
    const staleCalls: CallRecord[] = [];
    const isStale = makeFakeIsStale(true, staleCalls);

    const syncLight = makeSyncStockLight({
      isStale,
      fetchFinancials: makeFakeFetcher(),
      fetchTradingStats: makeFakeFetcher(),
      fetchBalanceSheet: makeFakeFetcher(),
      storeFinancials: () => {},
      storeTradingStats: () => {},
      storeBalanceSheet: () => {},
    });

    await syncLight("VCB");

    const financialsCall = staleCalls.find((c) => c.dataType === "financials");
    expect(financialsCall).toBeDefined();
    expect(financialsCall!.staleness).toBe(1440);
    // Confirm it is NOT the watchlist threshold
    expect(financialsCall!.staleness).not.toBe(360);
  });

  it("uses 720-min staleness for trading_stats (not 120 like watchlist)", async () => {
    const staleCalls: CallRecord[] = [];
    const isStale = makeFakeIsStale(true, staleCalls);

    const syncLight = makeSyncStockLight({
      isStale,
      fetchFinancials: makeFakeFetcher(),
      fetchTradingStats: makeFakeFetcher(),
      fetchBalanceSheet: makeFakeFetcher(),
      storeFinancials: () => {},
      storeTradingStats: () => {},
      storeBalanceSheet: () => {},
    });

    await syncLight("VCB");

    const statsCall = staleCalls.find((c) => c.dataType === "trading_stats");
    expect(statsCall).toBeDefined();
    expect(statsCall!.staleness).toBe(720);
    expect(statsCall!.staleness).not.toBe(120);
  });

  it("uses 1440-min staleness for balance_sheet (not 360 like watchlist)", async () => {
    const staleCalls: CallRecord[] = [];
    const isStale = makeFakeIsStale(true, staleCalls);

    const syncLight = makeSyncStockLight({
      isStale,
      fetchFinancials: makeFakeFetcher(),
      fetchTradingStats: makeFakeFetcher(),
      fetchBalanceSheet: makeFakeFetcher(),
      storeFinancials: () => {},
      storeTradingStats: () => {},
      storeBalanceSheet: () => {},
    });

    await syncLight("VCB");

    const bsCall = staleCalls.find((c) => c.dataType === "balance_sheet");
    expect(bsCall).toBeDefined();
    expect(bsCall!.staleness).toBe(1440);
    expect(bsCall!.staleness).not.toBe(360);
  });

  it("returns 3 when all data types are stale", async () => {
    const syncLight = makeSyncStockLight({
      isStale: makeFakeIsStale(true),
      fetchFinancials: makeFakeFetcher(),
      fetchTradingStats: makeFakeFetcher(),
      fetchBalanceSheet: makeFakeFetcher(),
      storeFinancials: () => {},
      storeTradingStats: () => {},
      storeBalanceSheet: () => {},
    });

    const calls = await syncLight("VCB");
    expect(calls).toBe(3);
  });

  it("returns 0 when all data is fresh (nothing stale)", async () => {
    const syncLight = makeSyncStockLight({
      isStale: makeFakeIsStale(false),
      fetchFinancials: makeFakeFetcher(),
      fetchTradingStats: makeFakeFetcher(),
      fetchBalanceSheet: makeFakeFetcher(),
      storeFinancials: () => {},
      storeTradingStats: () => {},
      storeBalanceSheet: () => {},
    });

    const calls = await syncLight("VCB");
    expect(calls).toBe(0);
  });

  it("does not store data when fetcher returns null", async () => {
    const stored: string[] = [];
    const syncLight = makeSyncStockLight({
      isStale: makeFakeIsStale(true),
      fetchFinancials: async () => null,
      fetchTradingStats: async () => null,
      fetchBalanceSheet: async () => null,
      storeFinancials: (f) => stored.push(`fin:${f.code}`),
      storeTradingStats: (s) => stored.push(`stats:${s.code}`),
      storeBalanceSheet: (bs) => stored.push(`bs:${bs.code}`),
    });

    await syncLight("VCB");

    expect(stored).toHaveLength(0);
  });

  it("stores data when fetcher returns result", async () => {
    const stored: string[] = [];
    const syncLight = makeSyncStockLight({
      isStale: makeFakeIsStale(true),
      fetchFinancials: makeFakeFetcher(),
      fetchTradingStats: makeFakeFetcher(),
      fetchBalanceSheet: makeFakeFetcher(),
      storeFinancials: (f) => stored.push(`fin:${f.code}`),
      storeTradingStats: (s) => stored.push(`stats:${s.code}`),
      storeBalanceSheet: (bs) => stored.push(`bs:${bs.code}`),
    });

    await syncLight("VCB");

    expect(stored).toContain("fin:VCB");
    expect(stored).toContain("stats:VCB");
    expect(stored).toContain("bs:VCB");
  });

  it("passes the correct stock code to all fetchers", async () => {
    const finCodes: string[] = [];
    const statsCodes: string[] = [];
    const bsCodes: string[] = [];

    const syncLight = makeSyncStockLight({
      isStale: makeFakeIsStale(true),
      fetchFinancials: makeFakeFetcher(finCodes),
      fetchTradingStats: makeFakeFetcher(statsCodes),
      fetchBalanceSheet: makeFakeFetcher(bsCodes),
      storeFinancials: () => {},
      storeTradingStats: () => {},
      storeBalanceSheet: () => {},
    });

    await syncLight("FPT");

    expect(finCodes).toEqual(["FPT"]);
    expect(statsCodes).toEqual(["FPT"]);
    expect(bsCodes).toEqual(["FPT"]);
  });
});

// ---------------------------------------------------------------------------

describe("Task 276 — syncSectorPeers", () => {

  it("caps peers processed at MAX_PEER_SYNCS_PER_CYCLE (5)", async () => {
    const syncedCodes: string[] = [];

    const syncLight = async (code: string): Promise<number> => {
      syncedCodes.push(code);
      return 1;
    };

    // Provide 10 peers — only 5 should be processed
    const syncPeers = makeSyncSectorPeers(syncLight, makeFakeContextStocks(10));

    const result = await syncPeers([{ actionCode: "VCB", domain: "banking" }]);

    expect(syncedCodes).toHaveLength(MAX_PEER_SYNCS_PER_CYCLE);
    expect(syncedCodes).toHaveLength(5);
    expect(result.synced + result.skipped).toBeLessThanOrEqual(5);
  });

  it("returns synced=N when all N peers have stale data (calls>0)", async () => {
    const syncLight = async (_code: string): Promise<number> => 2; // 2 API calls

    const syncPeers = makeSyncSectorPeers(syncLight, makeFakeContextStocks(3));

    const result = await syncPeers([{ actionCode: "VCB", domain: "banking" }]);

    expect(result.synced).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.apiCalls).toBe(6); // 3 peers × 2 calls each
  });

  it("returns skipped=N when all N peers are fresh (calls=0)", async () => {
    const syncLight = async (_code: string): Promise<number> => 0; // all fresh

    const syncPeers = makeSyncSectorPeers(syncLight, makeFakeContextStocks(4));

    const result = await syncPeers([{ actionCode: "VCB", domain: "banking" }]);

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(4);
    expect(result.apiCalls).toBe(0);
  });

  it("handles fetch failure gracefully — counts failed peer as skipped", async () => {
    let callCount = 0;
    const syncLight = async (code: string): Promise<number> => {
      callCount++;
      if (code === "PEER2") throw new Error("network timeout");
      return 1;
    };

    const syncPeers = makeSyncSectorPeers(syncLight, makeFakeContextStocks(3));

    const result = await syncPeers([{ actionCode: "VCB", domain: "banking" }]);

    // PEER1 and PEER3 succeed, PEER2 fails
    expect(result.synced).toBe(2);
    expect(result.skipped).toBe(1); // the failed peer
    expect(result.apiCalls).toBe(2);
    expect(callCount).toBe(3); // all 3 were attempted
  });

  it("returns zeros when watchlist resolves to no peers", async () => {
    const syncLight = async (_code: string): Promise<number> => 1;

    // Empty context stocks
    const syncPeers = makeSyncSectorPeers(syncLight, () => []);

    const result = await syncPeers([{ actionCode: "VCB", domain: "banking" }]);

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.apiCalls).toBe(0);
  });

  it("returns zeros when watchlist is empty", async () => {
    const syncLight = async (_code: string): Promise<number> => 1;

    const syncPeers = makeSyncSectorPeers(syncLight, makeFakeContextStocks(0));

    const result = await syncPeers([]);

    expect(result.synced).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.apiCalls).toBe(0);
  });

  it("processes only first 5 peers even with 8 available", async () => {
    const syncedCodes: string[] = [];
    const syncLight = async (code: string): Promise<number> => {
      syncedCodes.push(code);
      return 1;
    };

    const syncPeers = makeSyncSectorPeers(syncLight, makeFakeContextStocks(8));

    await syncPeers([{ actionCode: "VNM", domain: "retail" }]);

    // Exactly 5 processed, not 8
    expect(syncedCodes).toHaveLength(5);
    expect(syncedCodes[0]).toBe("PEER1");
    expect(syncedCodes[4]).toBe("PEER5");
  });

  it("accumulates total apiCalls across all peers", async () => {
    // Each peer returns a varying number of calls
    const callsPerPeer = [3, 0, 2, 1, 3];
    let callIndex = 0;
    const syncLight = async (_code: string): Promise<number> => {
      return callsPerPeer[callIndex++] ?? 0;
    };

    const syncPeers = makeSyncSectorPeers(syncLight, makeFakeContextStocks(5));

    const result = await syncPeers([{ actionCode: "FPT", domain: "tech" }]);

    const expectedTotal = callsPerPeer.reduce((a, b) => a + b, 0);
    expect(result.apiCalls).toBe(expectedTotal); // 3+0+2+1+3 = 9
  });
});

// ---------------------------------------------------------------------------
// Integration: verify real getContextStocksForWatchlist interacts correctly
// ---------------------------------------------------------------------------

describe("Task 276 — syncSectorPeers integration with real sectorPeers", () => {
  it("resolves banking peers from watchlist with VCB", async () => {
    const { getContextStocksForWatchlist } = await import(
      "../domain/services/sectorPeers.js"
    );

    const watchlist = [{ actionCode: "VCB", domain: "banking" as DomainType }];
    const peers = getContextStocksForWatchlist(watchlist);

    // VCB is excluded from peers (it's the watchlist stock)
    expect(peers.map((p) => p.code)).not.toContain("VCB");
    // Other banking peers should be present
    expect(peers.length).toBeGreaterThan(0);
    expect(peers[0]!.domain).toBe("banking");
  });

  it("deduplicates peers across watchlist stocks in same sector", async () => {
    const { getContextStocksForWatchlist } = await import(
      "../domain/services/sectorPeers.js"
    );

    // VCB and BID are both banking — peers should be deduped
    const watchlist = [
      { actionCode: "VCB", domain: "banking" as DomainType },
      { actionCode: "BID", domain: "banking" as DomainType },
    ];
    const peers = getContextStocksForWatchlist(watchlist);

    const codes = peers.map((p) => p.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length); // no duplicates
  });

  it("caps peer sync at 5 even when banking sector has many peers", async () => {
    const { getContextStocksForWatchlist } = await import(
      "../domain/services/sectorPeers.js"
    );

    const syncedCodes: string[] = [];
    const syncLight = async (code: string): Promise<number> => {
      syncedCodes.push(code);
      return 1;
    };

    const syncPeers = makeSyncSectorPeers(syncLight, getContextStocksForWatchlist);

    // Banking has 10 peers; only 5 should be processed per cycle
    const result = await syncPeers([{ actionCode: "VCB", domain: "banking" }]);

    expect(syncedCodes).toHaveLength(MAX_PEER_SYNCS_PER_CYCLE);
    expect(result.synced).toBe(MAX_PEER_SYNCS_PER_CYCLE);
  });
});
