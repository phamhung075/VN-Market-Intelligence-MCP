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

### STEP dev-mcp-server-S6 · dev-mcp-server · 2026-06-11T12:30:00Z
**task-id:** TASK-17 PAGE 9
**what-done:** Built GET /api/sector-rotation — sectorRotationStore.ts (3 read helpers), sectorRotationHandler.ts (mapEntry+applySortOrder+buildSummary+handler), server.ts route wire, 29-test suite (122 expect calls). 0 fail. tsc clean. Live probe exact match.
**what-considered:**
- Include all 121 market_prices rows — refuted: reference stocks dilute sector averages; ground truth uses watchlist-only; filter to watchlist codes only
- Use only1dAvailable from domain service directly — required deriving price1dAgo from changePct first (classifySector needs price1dAgo for threshold eval); domain then correctly computes only1dAvailable
- Pass empty sectors[] to detectSectorRotation — refuted: "chemicals"/"machinery" not in ALL_DOMAINS; build representedSectors from watchlist+priceMap and pass explicitly
**why-decision:** watchlist-filter + price1dAgo-derivation + explicit-sectors together produce the 14-sector result that exactly matches ground truth (probed 2026-06-11T12:00).
**why-change:** no change from plan; three implementation subtleties found during red-green cycle, all resolved definitively.

### STEP dev-mcp-server-S7 · dev-mcp-server · 2026-06-11T13:00:00Z
**task-id:** TASK-17 PAGE 10
**what-done:** Built GET /api/sector-cascade — cascadeSignalStore.ts (getCascadeHitsSince), cascadeSignalHandler.ts (parseDirection+resolveSector+parseAffectedStocks+aggregateBySector+mapHit+buildSummary+handler), server.ts route wire, 47-test suite (328 expect calls). 0 fail. tsc clean.
**what-considered:**
- Use `|| DEFAULT_WINDOW_DAYS` fallback on parseInt("0") — refuted: parseInt("0")=0 is falsy, causes "0" to fall back to 7 not clamp to 1; use NaN-check instead (isNaN guard)
- hit_at filter: ISO "T" format ("2026-06-04T00:00:00") — refuted by live probe: column stores "YYYY-MM-DD HH:MM:SS" (space); ISO string comparison fails; use .toISOString().slice(0,19).replace("T"," ")
- Store SQL directly in handler — rejected: violates DDD layer rule; getCascadeHitsSince in infrastructure/db/cascadeSignalStore; handler maps + aggregates only
**why-decision:** space-format sinceIso matches column's literal format → string comparison works; NaN-guard on parseInt ensures "0" clamps to MIN_WINDOW_DAYS=1 not fallback to DEFAULT; pure-aggregation handler preserves DDD layer separation.
**why-change:** one red→fix cycle on the "0" clamp edge case (test AC-21); live probe confirmed 7d window returns ~416 rows matching ground-truth distribution.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-11T13:45:00Z
**task-id:** TASK-17-PAGE-11
**what-done:** Shipped GET /api/kinh-dich-signals (kinhDichStore + kinhDichSignalsHandler + server.ts route + 74-test suite).
**what-considered:**
- Regex on raw signal string (no fold) — refuted: accent variants ("tích cực" vs "tich cuc") need fold; foldViet() strips diacritics before /tich *cuc/ match
- WINDOW function for latest-per-symbol — refuted: correlated subquery is simpler and SQLite-compatible without requiring modern SQLite window-function support
- Separate "positive" regex per variant — rejected: too brittle; fold once then single ASCII regex covers all observed encodings
**why-decision:** foldViet accent-fold + single-pass regex covers all 20+ observed signal encodings; correlated subquery keeps SQL readable + parameterized; handler has zero SQL (pure DDD interface layer).
**why-change:** no change from spec; tsc exit 0 on first attempt after fixing a type-narrowing issue (row.action_note: string|null in test assertion).
