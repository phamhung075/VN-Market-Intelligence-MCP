# Decision Journal — Sprint OHLCV-UNIT-CONTAM · dev-mcp-server

**Sprint goal:** Fix OHLCV unit contamination across all 5 writers (A–E); foundational guard + normalizer first
**Agent:** dev-mcp-server
**Started:** 2026-06-12T11:05:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-12T11:10:00Z
**task-id:** CONTAM-1
**what-done:** Created ohlcvUnitGuard.ts domain service + 17 unit tests (all GREEN)
**what-considered:**
- Place guard in market-data subfolder (matches foreignFlowValidator.ts precedent for data-unit validators)
- Place guard directly in domain/services/ root
**why-decision:** market-data/ subfolder is the canonical location for market-data domain validators per foreignFlowValidator.ts precedent; clean DDD separation
**why-change:** no change from plan — AC exactly followed; normalizeOhlcvToVnd WHOLE-ROW rule correctly implemented (per PO amendment: never per-field)

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-12T11:25:00Z
**task-id:** CONTAM-2
**what-done:** Added validateOhlcvUnit guard + ON CONFLICT open self-heal to pushPricesHandler.ts; 6 integration TCs GREEN
**what-considered:**
- Wrap guard in try/catch (RF-1 VPS backoff risk) vs direct call
- CASE WHEN open<100 vs always-update open (semantic: preserve open from first valid push)
**why-decision:** try/catch mandatory per RF-1 (guard error must never reach HTTP layer); CASE WHEN open<100 preserves intraday open semantics while self-healing contaminated rows
**why-change:** no change from plan — AC and handoff spec followed exactly

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-06-12T11:20:00Z
**task-id:** CONTAM-3
**what-done:** Added validateOhlcvUnit guard in /api/push-ohlcv-history bar loop in server.ts; import added at file top; try/catch preserves HTTP 200; skipped counter tracked in log + response
**what-considered:**
- Hard-code type="stock" vs implement isIndex(code) helper
- Use normalizeOhlcvToVnd (like CONTAM-4) vs pure guard
**why-decision:** TCBS backfill exclusively provides stocks (no index codes in fetch-ohlcv-backfill.sh); hard-coding "stock" is correct and simpler. Writer B receives full-VND from TCBS (confirmed in arch brief L53-56 — unlike VNDIRECT/Writer D which is thousand-VND); no normalize step needed here, guard-only is the correct approach
**why-change:** no change from plan — AC and handoff spec followed exactly

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-12T08:30:00Z
**task-id:** CONTAM-4
**what-done:** Added normalizeOhlcvToVnd + validateOhlcvUnit to Writers D (taOhlcvBackfillJob) and E (ohlcvBackfill); 7 TCs GREEN; live-probe confirmed VNDIRECT = thousand-VND
**what-considered:**
- normalize-then-guard (handoff spec) vs guard-only (would drop all VNDIRECT rows)
- try/catch around both normalize and guard calls (match Writer A/D precedent)
**why-decision:** live-probe 2026-06-12: VNH=2.7, KSD=4.9 (same endpoint as Writer D) — THOUSAND-VND confirmed; skip-on-guard-fail would DROP all rows (backfill outage); normalize is the only correct path per PO binding amendment
**why-change:** no change from handoff spec — Writer E uses same endpoint → same normalize pattern applied

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-06-12T12:30:00Z
**task-id:** CONTAM-5
**what-done:** Created ohlcvSanityCheckJob.ts (full-table scan + sendTelegramBug fail-loud) + wired into startScheduler at 15:05 UTC Mon-Fri; 10 TCs GREEN; cronJobCount 78→79
**what-considered:**
- Scan last 7 days only vs whole table (arch brief D4 says last 7 days per watchlist)
- Wire after ohlcvDailyAggregator (15:00 UTC) vs standalone time (requires fresh rows post-aggregation)
**why-decision:** 7-day window catches trailing contamination without full-table scan cost; 15:05 UTC ensures aggregated rows are present before check fires
**why-change:** handoff TASK_CONTAM_5.md was mis-titled (Writer C guard) — po_amendment + arch brief + CONTEXT all confirm CONTAM-5 = sanity-check cron; implemented per po_amendment
