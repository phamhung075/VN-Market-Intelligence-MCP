/**
 * Task 1006 — Sector peer PE/PB/ROE returns N/A for automotive and other deep peers
 *
 * Root cause: MAX_PEER_SYNCS_PER_CYCLE = 5 was too low. With 8 watchlist stocks
 * resolving ~29 context stocks, automotive peers (positions 13-16) were never
 * reached. syncStockLight is lazy — fresh data returns 0 calls — so increasing
 * the cap to 30 costs nothing when data is fresh.
 *
 * TDD tests:
 * 1. With an expanded watchlist (8 stocks, 4+ sectors), automotive peers reach sync
 * 2. MAX_PEER_SYNCS_PER_CYCLE >= 30 in the real module
 * 3. Peers beyond position 5 still get synced (regression guard)
 */

import { describe, it, expect } from "bun:test";
import type { DomainType } from "../../bctc-schema.js";

// ---------------------------------------------------------------------------
// Inline testable factory (same pattern as 276-sync-sector-peers.test.ts)
// ---------------------------------------------------------------------------

function makeSyncSectorPeers(
  syncStockLightFn: (code: string) => Promise<number>,
  getContextStocks: (
    watchlist: { actionCode: string; domain: DomainType }[],
  ) => { code: string; exchange: string; domain: DomainType }[],
  maxPeerSyncs: number,
) {
  return async function syncSectorPeers(
    watchlistEntries: { actionCode: string; domain: DomainType }[],
  ): Promise<{ synced: number; skipped: number; apiCalls: number; syncedCodes: string[] }> {
    const contextStocks = getContextStocks(watchlistEntries);
    let synced = 0;
    let skipped = 0;
    let apiCalls = 0;
    const syncedCodes: string[] = [];

    for (const peer of contextStocks.slice(0, maxPeerSyncs)) {
      try {
        const calls = await syncStockLightFn(peer.code);
        apiCalls += calls;
        syncedCodes.push(peer.code);
        if (calls > 0) {
          synced++;
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }

    return { synced, skipped, apiCalls, syncedCodes };
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1006 — sector peer financials coverage", () => {

  it("MAX_PEER_SYNCS_PER_CYCLE is >= 30 in real syncSectorPeers module", async () => {
    const mod = await import("../application/usecases/syncSectorPeers.js");
    expect(mod.MAX_PEER_SYNCS_PER_CYCLE).toBeGreaterThanOrEqual(30);
  });

  it("automotive peers (HAX/CTF/TMT/SMA) are reached with 8-stock watchlist at cap=30", async () => {
    const { getContextStocksForWatchlist } = await import(
      "../domain/services/sectorPeers.js"
    );

    const syncedCodes: string[] = [];
    const syncLight = async (code: string): Promise<number> => {
      syncedCodes.push(code);
      return 0; // simulate fresh data — lazy skip, no API calls
    };

    // Expanded watchlist with 8 stocks across multiple sectors
    const watchlist: { actionCode: string; domain: DomainType }[] = [
      { actionCode: "VNM",  domain: "retail" },
      { actionCode: "FPT",  domain: "tech" },
      { actionCode: "VCB",  domain: "banking" },
      { actionCode: "VEA",  domain: "automotive" },
      { actionCode: "HPG",  domain: "steel" },
      { actionCode: "SSI",  domain: "securities" },
      { actionCode: "MWG",  domain: "retail" },
      { actionCode: "MSN",  domain: "retail" },
    ];

    const syncPeers = makeSyncSectorPeers(syncLight, getContextStocksForWatchlist, 30);
    await syncPeers(watchlist);

    // Automotive peers must be in the synced set
    expect(syncedCodes).toContain("HAX");
    expect(syncedCodes).toContain("CTF");
    expect(syncedCodes).toContain("TMT");
    expect(syncedCodes).toContain("SMA");
  });

  it("with old cap=5 and 8-stock watchlist, automotive peers are NOT reached (regression doc)", async () => {
    const { getContextStocksForWatchlist } = await import(
      "../domain/services/sectorPeers.js"
    );

    const syncedCodes: string[] = [];
    const syncLight = async (code: string): Promise<number> => {
      syncedCodes.push(code);
      return 0;
    };

    const watchlist: { actionCode: string; domain: DomainType }[] = [
      { actionCode: "VNM",  domain: "retail" },
      { actionCode: "FPT",  domain: "tech" },
      { actionCode: "VCB",  domain: "banking" },
      { actionCode: "VEA",  domain: "automotive" },
      { actionCode: "HPG",  domain: "steel" },
      { actionCode: "SSI",  domain: "securities" },
      { actionCode: "MWG",  domain: "retail" },
      { actionCode: "MSN",  domain: "retail" },
    ];

    const syncPeers = makeSyncSectorPeers(syncLight, getContextStocksForWatchlist, 5);
    await syncPeers(watchlist);

    // With cap=5, only first 5 peers are reached — automotive (positions 13-16) are missed
    expect(syncedCodes).toHaveLength(5);
    expect(syncedCodes).not.toContain("HAX");
    expect(syncedCodes).not.toContain("CTF");
    expect(syncedCodes).not.toContain("TMT");
    expect(syncedCodes).not.toContain("SMA");
  });

  it("with cap=30, all 29 context stocks from 8-stock watchlist are reached", async () => {
    const { getContextStocksForWatchlist } = await import(
      "../domain/services/sectorPeers.js"
    );

    const syncedCodes: string[] = [];
    const syncLight = async (code: string): Promise<number> => {
      syncedCodes.push(code);
      return 0;
    };

    const watchlist: { actionCode: string; domain: DomainType }[] = [
      { actionCode: "VNM",  domain: "retail" },
      { actionCode: "FPT",  domain: "tech" },
      { actionCode: "VCB",  domain: "banking" },
      { actionCode: "VEA",  domain: "automotive" },
      { actionCode: "HPG",  domain: "steel" },
      { actionCode: "SSI",  domain: "securities" },
      { actionCode: "MWG",  domain: "retail" },
      { actionCode: "MSN",  domain: "retail" },
    ];

    const contextStocks = getContextStocksForWatchlist(watchlist);
    const syncPeers = makeSyncSectorPeers(syncLight, getContextStocksForWatchlist, 30);
    await syncPeers(watchlist);

    // All context stocks reached (cap 30 >= 29 total)
    expect(syncedCodes).toHaveLength(contextStocks.length);
  });

  it("lazy peers (fresh data, calls=0) count as skipped not synced", async () => {
    const { getContextStocksForWatchlist } = await import(
      "../domain/services/sectorPeers.js"
    );

    const syncLight = async (_code: string): Promise<number> => 0; // all fresh

    const watchlist: { actionCode: string; domain: DomainType }[] = [
      { actionCode: "VCB", domain: "banking" },
    ];

    const syncPeers = makeSyncSectorPeers(syncLight, getContextStocksForWatchlist, 30);
    const result = await syncPeers(watchlist);

    expect(result.synced).toBe(0);
    expect(result.skipped).toBeGreaterThan(0); // all are fresh / skipped
    expect(result.apiCalls).toBe(0);
  });
});
