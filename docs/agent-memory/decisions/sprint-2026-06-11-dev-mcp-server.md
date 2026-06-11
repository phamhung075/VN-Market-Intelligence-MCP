# Decision Journal — Sprint 2026-06-11 · dev-mcp-server

**Sprint goal:** ALERT-WRITER-RECONCILE — settle whether canonical alerts writer is healthy or broken on live mcp-server
**Agent:** dev-mcp-server
**Started:** 2026-06-11T08:45:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-11T08:45:00Z
**task-id:** ALERT-WRITER-RECONCILE
**what-done:** Probed live market.db (Docker volume) + container logs — found root cause of taAlertScan/bbAlertScan 100% failure rate.
**what-considered:**
- HEALTHY-but-quiet (no extreme RSI/BB conditions fired) — refuted by telemetry: success_count=0 every cycle, error_count=36–41 per cycle = ALL tickers erroring, never even reaching RSI/BB threshold check
- BROKEN: cron not registered — refuted: alertScanParallelJob appears in cron_job_runs with regular cadence
- BROKEN: wrong DB handle — refuted: 998 alerts present in live market.db, other jobs write to it fine
- BROKEN: URL+contract mismatch — CONFIRMED: client calls POST /indicators, TA service serves POST /ta/indicators; client sends {code} but service expects {symbol}; client expects scalar rsi/bb but service returns arrays; TA service DB path is stub (GetCandles returns "not implemented") so symbol-only call returns empty
**why-decision:** URL + field name + response shape mismatch is the definitive root cause. Fix: clients.ts URL+field+response mapping + pass closes array from local market_prices_history.
**why-change:** no change from plan — verdict branch (b) BROKEN confirmed, fix required.
