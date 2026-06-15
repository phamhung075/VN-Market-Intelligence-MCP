# Decision Journal — Sprint DOCLANG-SERIALIZE · dev-mcp-server

**Sprint goal:** DOCLANG-SERIALIZE (no active goal description)
**Agent:** dev-mcp-server
**Started:** 2026-06-15T11:15:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-15T11:15:00Z
**task-id:** FIX-VNSTOCK-TRADINGSTATS-CRASH
**what-done:** Fixed missing 30-min retry backoff on trading_stats null/timeout path in syncVnstockData.ts + syncStockLight; added DB-delta rowsWritten to runVnstockTradingStatsJob.
**what-considered:**
- Add per-ticker timeout at the job level: REJECTED — runPython already has 45s SIGTERM; timeout exists, issue is the null-path backoff silencing retries for the full 2h window.
- Separate circuit breaker for syncStockLight: REJECTED — DRY mandates reusing existing pattern; adding backoffMinutes=30 to markFetched() is the established fix (FIX-FUNDAMENTALS-REFRESH-CRON-DEAD family).
- Only fix syncStock (not syncStockLight): REJECTED — syncStockLight has same bug on 3 paths; GENERIC mandate applies to ALL tickers/paths.
**why-decision:** markFetched(code, type, 30) on every null path = identical to financials/balance_sheet/cash_flow fix; DRY. rowsWritten DB delta = identical to Fix 2/6 in fundamentals job.
**why-change:** No change from plan — recon confirmed PO's "same family as FIX-FUNDAMENTALS-REFRESH-CRON-DEAD" diagnosis was correct.
