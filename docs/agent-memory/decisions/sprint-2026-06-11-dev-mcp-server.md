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

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-11T09:00:00Z
**task-id:** ALERT-WRITER-RECONCILE
**what-done:** Fixed 3 root causes in apps/mcp-server/: URL mismatch, field name mismatch, candle source mismatch. Updated 7 test files. 42 tests pass, tsc clean.
**what-considered:**
- Fix only URL (partial) — refuted: field mismatch + candle source also broken, partial fix still yields 0 RSI alerts
- Fix clients.ts only + expect callers to pass closes — chosen: callers updated too (taAlertScanJob, bbAlertScanJob now query daily_ohlcv and pass closes)
**why-decision:** definitive fix at root — URL + field + candle-source all corrected in one pass; no symptom-patching.
**why-change:** secondary root cause (market_prices_history only 2 days vs daily_ohlcv 37+ days) found during investigation; fixed in same commit to avoid partial-fix regression.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-11T10:45:00Z
**task-id:** TASK17-AGM
**what-done:** Built GET /api/agm-plan-actual handler + queryAgmPlanActual store fn + 44-test suite (119 expect calls). 0 fail. tsc clean.
**what-considered:**
- Put join SQL in handler directly — rejected: violates DDD layer rule (no SQL in interface); store fn is the right owner
- Single query with LEFT JOIN — possible but brittle on per-term-id filtering; chosen: two separate queries (plan + actuals) unified into AgmPlanActualItem[] for clarity + testability
**why-decision:** DDD layer strictly enforced (queryAgmPlanActual in infrastructure/db/agmPlanStore); IN_PROGRESS guard implemented at buildMetrics level (fullYearRow lookup on report_term_id=1 only) — open year never misclassified.
**why-change:** no change from plan; spec was precise enough to implement directly.

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-06-11T11:00:00Z
**task-id:** TASK17-PRED
**what-done:** Built GET /api/prediction-claims handler + getAllClaimsForTracker store fn + 26-test suite (110 expect calls). 0 fail. tsc clean. Route wired in server.ts.
**what-considered:**
- Embed calibration SQL in handler — rejected: violates DDD; store fn owns all SQL; handler maps + aggregates only
- Use getResolvedClaims + getPendingClaims separately — possible but requires two DB round-trips; chosen: getAllClaimsForTracker (single query, outcome filter in SQL) + separate full-scan for calibration to ensure stats cover ALL rows regardless of ?outcome= filter
**why-decision:** two-call strategy (full scan for calibration, filtered for claims[]) ensures AC-8 compliance (calibration always reflects total DB state); hitRate/avgBrier null-guards prevent NaN/Infinity on zero-resolved edge case.
**why-change:** no change from plan; task spec was precise with live contract + aggregates to match.

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-06-11T12:00:00Z
**task-id:** TASK17-SUMMARIES
**what-done:** Built GET /api/market-summaries (list + detail mode) — marketSummaryStore.ts (3 read helpers), marketSummaryHandler.ts (parseJsonField + mapKeyedToArray + buildListItem + buildDetail + HTTP handler), server.ts route wire, 34-test suite (100 expect calls). 0 fail. tsc clean.
**what-considered:**
- Include summary_text in list query — rejected: ~12.7KB per row × 60 rows = ~760KB JSON payload; instead use `substr(summary_text,1,300) AS summary_preview` via SQL alias; detail mode (?id=) fetches full text
- 404 on missing id — rejected per task spec ("keep simple, frontend shows empty"); chosen: 200 + {item:null}
- Separate array/object JSON parsing in store — rejected: store = SQL only; parseJsonField + mapKeyedToArray live in handler (interface layer) to preserve DDD layer separation
**why-decision:** DUAL-MODE pattern (list=light / detail=full) keeps the endpoint frontend-friendly without overfetching; mapKeyedToArray normalises the ticker-keyed objects to consistent {symbol,...} arrays the frontend can iterate uniformly; parseJsonField fails closed (never throws) making the endpoint resilient to stale/corrupt CHEF writes.
**why-change:** no change from plan; live contract was precise (probed 2026-06-11).
