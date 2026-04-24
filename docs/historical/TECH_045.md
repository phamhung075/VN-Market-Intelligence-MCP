# TECH-045: Sector Peer Shadow Sync — Technical Design

status: APPROVED_BY_ARCHITECT
req_ref: REQ-045

---

## Brownfield Impact

### Files created (2 new):
- `src/application/usecases/syncSectorPeers.ts` — Peer sync orchestrator (lazy fetch, budget-aware)
- `src/interface/mcp/tools/sectorComparisonTools.ts` — `get_sector_comparison` MCP tool

### Files modified (5 existing):
- `src/application/usecases/syncVnstockData.ts` — Export `syncStock` for reuse; add `syncStockLight` for peers
- `src/scheduler/intelligenceCycleJob.ts` — Wire peer sync after Step A3 watchlist sync
- `src/interface/mcp/server.ts` — Register `get_sector_comparison` tool (68 → 69 tools)
- `cowork-analysis-vnmarket-team/03-report-analyzer.md` — Add sector comparison step
- `cowork-analysis-vnmarket-team/04-market-watcher.md` — Add sector comparison step

### Breaking changes: None
- Additive only: new function exports, new MCP tool
- Existing syncVnstockData behavior unchanged
- Peer data stored in same tables as watchlist data (vnstock_financials, etc.)

---

## Architecture

```
Intelligence Cycle (every 15 min)
│
├── Step A3 (existing): syncVnstockData(watchlistCodes)
│   └── 4 stocks × 7 data types = max 28 API calls
│
└── Step A3b (NEW): syncSectorPeers(watchlistEntries)
    └── max 5 peers × 3 data types = max 15 API calls
    └── Total: 43 calls < 60/min free tier limit
```

### Rate Limit Budget

```
Per cycle budget: 60 requests/min (vnstock free tier)
Watchlist sync:   4 stocks × 7 types = 28 calls (worst case)
Peer sync:        5 peers  × 3 types = 15 calls (worst case)
Total:            43 calls → 72% utilization → safe margin
Inter-delay:      1.5s per call → 43 × 1.5 = 64.5s spread
```

---

## Task Breakdown

### Task 276: `syncStockLight` + `syncSectorPeers` (application layer)

**File: `src/application/usecases/syncVnstockData.ts`**

Add export for lightweight peer sync:

```typescript
/**
 * Lightweight sync for sector peers — only financials, trading_stats, balance_sheet.
 * Longer staleness thresholds than watchlist stocks.
 */
export async function syncStockLight(code: string): Promise<number> {
  let calls = 0;

  // Financials (24h staleness for peers vs 6h for watchlist)
  if (isStale(code, "financials", 1440)) {
    const fin = await fetchVnstockFinancials(code);
    if (fin) storeFinancials(fin);
    calls++;
    await sleep(DELAY_MS);
  }

  // Trading stats (12h staleness for peers vs 2h for watchlist)
  if (isStale(code, "trading_stats", 720)) {
    const stats = await fetchVnstockTradingStats(code);
    if (stats) storeTradingStats(stats);
    calls++;
    await sleep(DELAY_MS);
  }

  // Balance sheet (24h staleness for peers vs 6h for watchlist)
  if (isStale(code, "balance_sheet", 1440)) {
    const bs = await fetchVnstockBalanceSheet(code);
    if (bs) storeBalanceSheet(bs);
    calls++;
    await sleep(DELAY_MS);
  }

  return calls;
}
```

**File: `src/application/usecases/syncSectorPeers.ts`**

```typescript
const MAX_PEER_SYNCS_PER_CYCLE = 5;

export async function syncSectorPeers(
  watchlistEntries: { actionCode: string; domain: DomainType }[],
): Promise<{ synced: number; skipped: number; apiCalls: number }> {
  const contextStocks = getContextStocksForWatchlist(watchlistEntries);
  let synced = 0, skipped = 0, apiCalls = 0;

  for (const peer of contextStocks.slice(0, MAX_PEER_SYNCS_PER_CYCLE)) {
    try {
      const calls = await syncStockLight(peer.code);
      apiCalls += calls;
      if (calls > 0) synced++; else skipped++;
    } catch {
      skipped++;
    }
  }

  return { synced, skipped, apiCalls };
}
```

**Tests:** `src/__tests__/276-sync-sector-peers.test.ts`
- syncStockLight calls only 3 data types (not 7)
- syncStockLight uses 1440min staleness for financials (not 360)
- syncSectorPeers caps at MAX_PEER_SYNCS_PER_CYCLE
- syncSectorPeers skips stocks that are fresh
- syncSectorPeers graceful on fetch failure

**Depends on:** None (independent)

---

### Task 277: `get_sector_comparison` MCP tool (interface layer)

**File: `src/interface/mcp/tools/sectorComparisonTools.ts`**

```typescript
// Input: { code: string }
// Output: Vietnamese formatted sector comparison

// Implementation:
// 1. Read watchlist to get target stock's domain
// 2. Get all sector peers from sectorPeers.ts
// 3. Read stored vnstock_financials for target + all peers
// 4. Read stored vnstock_trading_stats for target + all peers
// 5. Read latest market_prices for target + all peers
// 6. Compute sector medians via sectorValuationComparator.ts
// 7. Format Vietnamese output with comparison table
```

Output format:
```
=== SO SANH NGANH: VCB (Ngan hang) ===

VCB vs Median nganh:
  PE: 9.0 vs 7.5 (PREMIUM +20%)
  PB: 2.0 vs 1.3 (PREMIUM +54%)
  ROE: 18.0% vs 14.2% (TREN MEDIAN)
  D/E: 8.5 vs 9.2 (THAP HON — tot)

Gia hom nay:
  VCB: -1.2% | Nganh TB: -0.8% (toan nganh giam)

Dong tien nuoc ngoai (5 phien):
  VCB: +2.3M cp net | Nganh: -1.1M cp net (VCB MANH HON nganh)

Chi tiet peers:
  BID: PE=6.8 PB=1.1 ROE=12% | -0.9%
  CTG: PE=7.2 PB=1.2 ROE=13% | -0.5%
  TCB: PE=8.1 PB=1.4 ROE=15% | -1.1%
  MBB: PE=5.9 PB=1.0 ROE=16% | -0.7%
```

**Tests:** `src/__tests__/277-sector-comparison-tool.test.ts`
- Returns comparison for valid watchlist stock
- Returns error for stock not on watchlist
- Handles missing peer data gracefully (shows "N/A")
- Includes sector median computation
- Vietnamese output format correct

**Depends on:** 276 (needs peer data in DB)

---

### Task 278: Wire peer sync into intelligence cycle

**File: `src/scheduler/intelligenceCycleJob.ts`**

After Step A3 (syncVnstockData), add Step A3b:

```typescript
// Step A3b: Sync sector peer data (lightweight, best-effort)
if (isMarketHours) {
  try {
    const watchlistEntries = await getWatchlistEntries();
    const peerResult = await syncSectorPeers(watchlistEntries);
    logger.info("[cycle] peer sync", peerResult);
  } catch (err) {
    logger.debug("[cycle] peer sync failed (non-fatal)", { error: ... });
    errors++;
  }
}
```

- Only runs during market hours (peers don't need off-hours sync)
- Non-fatal: failure does not stop the cycle
- Has its own 2-min timeout

**Tests:** `src/__tests__/278-cycle-peer-sync.test.ts`
- Peer sync runs after watchlist sync during market hours
- Peer sync skipped off-hours
- Peer sync failure does not increment fatal errors

**Depends on:** 276

---

### Task 279: Update agent .md files + CLAUDE.md + restart

**Files modified:**
- `cowork-analysis-vnmarket-team/03-report-analyzer.md` — Add: "Call `get_sector_comparison(code)` to benchmark BCTC findings against sector peers"
- `cowork-analysis-vnmarket-team/04-market-watcher.md` — Add: "Call `get_sector_comparison(code)` when stock moves >2% to check if sector-wide"
- `cowork-analysis-vnmarket-team/06-digest-writer.md` — Add: "Include sector comparison highlights in weekly digest"
- `cowork-analysis-vnmarket-team/README.md` — Update tool count
- `CLAUDE.md` — Add Sprint 045 to completed sprints, update tool count

**Depends on:** 276, 277, 278

---

## Dependency Chain

```
276 (syncStockLight + syncSectorPeers)
  ├──→ 277 (get_sector_comparison MCP tool)
  └──→ 278 (wire into intelligence cycle)
        └──→ 279 (agent .md updates + CLAUDE.md + restart)
```

276 is independent and can start immediately.
277 and 278 depend on 276 but are independent of each other (parallel).
279 waits for all three.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| vnstock rate limit exceeded | MAX_PEER_SYNCS_PER_CYCLE=5, 1.5s delay, budget math shows 43/60 |
| Peer data stale | 24h staleness is acceptable for comparison context |
| Large DB growth | ~80 extra rows in vnstock_financials (16 sectors × 5 peers) — negligible |
| Slow cycle | Peer sync timeout 2min, non-fatal, market-hours only |
| Missing peer financial data | Tool shows "N/A" for missing metrics, never crashes |
