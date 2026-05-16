# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-17T01:40Z (c146 — 1926a verdictResolutionJob retry storm fix)

## c146 (2026-05-17T23:20Z → 2026-05-17T01:40Z, ~20min)

| Step | Action | Result |
|------|--------|--------|
| 0 PREFLIGHT | HEAD.lock (1034s, 0B, no pid) + index.lock (395s) + main.lock (1718s) — all stale | All removed |
| 0a drain-signals | docs/signals/ empty | Skip |
| 1 PO triage | 26 new reports: 20× verdictResolutionJob retry storm, 4× wontfix-timing, 2× monitoring | Dispatched 1926a |
| 1926a | verdictResolutionJob: `fetchHistory/fetchPrice null` → row never updated → hourly retry storm | Fixed |
| Fix | Mark `false_positive` + `detail:"price-fetch-failed:unresolvable"` on first miss | Row excluded next run |
| Tests | 19/19 GREEN (1863b suite), 24/24 GREEN (1863b+1863d), tsc 0 errors | PASS |
| Docker | mcp-server rebuilt + restarted | 3000+4004 healthy, 141 tools |
| Reports | All 26 reports resolved (batch) | 0 new remaining |

### c146 key state

| Item | State |
|------|-------|
| verdictResolutionJob retry storm | ✅ Fixed — unresolvable rows marked false_positive immediately |
| Port 3000 + 4004 | ✅ 141 tools healthy |
| All 26 reports | ✅ Resolved (1926a fixed + batch wontfix) |
| bond_maturity | ⚠️ Still 0 — cron fires 02:30 UTC (~1h from now) |
| alert_engine_records | ⚠️ Still 0 — continue 5-cycle observation |
| agent_signals | 50 (growing normally) |
| LanceDB | ✅ Fresh empty table from c145 — reindexing via news cycles |
| Fleet | 11/11 healthy |

### 1926a root cause (c146)

verdictResolutionJob.ts line 204: when `fetchHistory()` returned null, only logged BUG + `continue`.
Row stayed `verdict="pending"` → picked up again by filter every hourly run → 20 BUG reports in 16h.
Tickers MACRO_GOLD/VNH/WATCHLIST-31 have no entries in stock_price DB (non-HOSE).
Fix: `store.updateVerdict(id, {verdict:"false_positive", detail:"price-fetch-failed:unresolvable", resolvedAt:now})`.
`verdict !== "pending"` filter excludes it permanently. One BUG telegram only.

### Stale git locks (c146)

Three stale locks cleared: HEAD.lock (1034s), index.lock (395s), main.lock (1718s).
All 0B, no live git PIDs. Pattern consistent with background bun test runner holding lock briefly.
No escalation (< 3 in 24h session boundary).

### c147 carry-forward

1. **1922f-bond-maturity**: Cron fires 02:30 UTC (~1h). Verify ≥1 row after tick.
2. **1922i-alert-engine-records**: Continue 5-cycle observation (still 0).
3. **1862c-F**: SseSessionManager dead-session eviction — 5 cycles clean check.
4. **LanceDB reindex**: Monitor rag-service /index calls; embeddings regenerating.
5. **VN PMI**: Check if manufacturing-pmi populated by daily macro refresh.
