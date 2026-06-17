# dev-mcp-server -- Notebook

## 2026-06-17 · FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH — CHANGES_REQUESTED test-only fix

**Task:** CHANGES_REQUESTED → QA found 2 pre-existing test files asserting old buggy contract (attempts stays 0 on first-pass 0-URL discovery). Production code (commit 3eebf3bc) confirmed QA-correct — NOT touched.
**Fix 1 (FIX-BCTC-PIPELINE.test.ts:184):** Renamed test "does not increment attempts field" → "increments attempts on reached-source 0-URL first pass". Changed `.toBe(0)` → `.toBe(1)`. Updated inline comment to explain reached-source vs pre-network throw distinction.
**Fix 2 (BCTC-1943-queue-reset-and-retry.test.ts:257):** Renamed test "leaves reset rows pending if attempts=0 and no URL found (first pass)" → "increments attempts to 1 on reached-source 0-URL first pass, stays pending until MAX". Changed `.toBe(0)` → `.toBe(1)`. Kept `status=pending` assertion (attempts=1 < MAX=5 → still pending). Updated comment.
**Discrimination preserved:** TERM-4 (all fetchers throw ECONNREFUSED → attempts stays 0) untouched. No ticker allowlist or date literal introduced.
**CI post-fix:** 13174 pass / 42 skip / 21 fail / 8 failed files. The 2 stale-test files are GONE. Remaining 8 = environmental set (pollNews/rss/e2e-briefing, Chromium-absent/flaky-network). **tsc: 0 errors.**
**Board:** CHANGES_REQUESTED→REVIEW, next_agent→qa, qa_blocking_issues cleared, rebuild_required:true kept (ops rebuild gated on QA re-approval, then router does live SLA probe).

## 2026-06-17 · FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH — terminalization fix

**Task:** FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH (P1/HIGH, rerouted from dev-vps-crawls)
**Root cause:** `bctcQueueEnricherJob.ts` lines ~509-513 — `else { /* attempts===0 do nothing */ }` branch prevented incrementing attempts on the first real-discovery 0-URL pass. Genuinely-absent rows (9 tickers, Q1-2026 filings not yet published) stayed stuck at attempts=0 forever → 210+ zero-url cycles → bctc SLA FALSE-CRITICAL artifact.
**Fix:** Removed the `attempts===0` special-case else-branch. When discovery REACHES source and returns 0 URLs (real network result, NOT exception), always increment attempts. Generic: no per-ticker allowlist, no Q1-2026 date literal. Error/exception path (catch block) unchanged — no increment on network failure.
**Tests:** 8 new tests in `FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH.test.ts` proving TERM-1 (first-pass increments 0→1), TERM-2 (multi-pass accumulation), TERM-3 (terminates at MAX=5), TERM-3b (full 0→url_not_found cycle), TERM-4 (exception no-increment preserved), TERM-5 (ticker/date agnostic), TERM-6 (success path unchanged), TERM-7 (url_not_found not re-processed). 64 pass across all enricher test files, 0 fail. tsc clean.
**Commit:** 3eebf3bc · **rebuild_required:** YES — ops must rebuild mcp-server container before router SLA live-probe.

## 2026-06-17 · FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 — consumer stub-bar guard for taAlertScanJob + bbAlertScanJob

**Task:** FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 (P0, S, blocking)
**Root:** A foreign-flow writer inserts an all-zero stub bar (close=0, volume=0) into daily_ohlcv at market open before the real OHLCV bar arrives. CANDLE_SQL ORDER BY day ASC places this stub as the LATEST bar; taAlertScanJob fed it as the final element of closes[] → Wilder RSI collapsed to single-digit universe-wide; bbAlertScanJob read close=Math.round(0)=0 → "giá 0 dưới BB" spam (MARKET msg 783-790, 2026-06-17 02:15-03:15Z).
**Fix:** Both scan jobs now SELECT volume alongside close in CANDLE_SQL. After fetching candleRows, the LATEST bar (candleRows[length-1]) is inspected: if close_price<=0 OR volume<=0 → fail-closed (skip ticker, log info, no alert). Only the latest bar is rejected; interior bars feed Wilder RSI as-is. Generic: applies to all 30 watchlist tickers uniformly, no per-ticker logic.
**Gate results:** tsc clean (0 errors) | 52/0 across 6 affected files | full suite 13180 pass / 46 fail | tools=165 | sched=3
**REBUILD_REQUIRED:** YES

Zone health: tsc clean, 165 tools intact, scheduler 3 cron.schedule | HEALTHY

## 2026-06-18 · FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH — CHANGES_REQUESTED resolved: startup reset conflict closed

**Task:** CHANGES_REQUESTED (prior impl 3eebf3bc correct, but conflicting writer undid it live)
**Root:** `initFinancialReportsTables()` calls `resetQ1UrlNotFound()` which fired on EVERY `initDatabase()` call — including from ~15 MCP tool handlers during cowork cycles. Each call reset the 8 genuinely-absent Q1-2026 rows back to pending/attempts=0, undoing the enricher terminalization. Net: tug-of-war (attempts 6→url_not_found→0/pending), consecutive_zero_cycles unbounded at 235.
**Fix:** Removed `resetQ1UrlNotFound(db)` call from `initFinancialReportsTables()`. Function kept exported + marked `@deprecated`. Arm 2 grace-period query in `COMBINED_SQL` (url_not_found AND last_attempt < now-7d AND attempts<6) provides bounded retry. Terminal rows (attempts>=6) stay terminal.
**Tests:** TERM-8 added — asserts `initDatabase()` does NOT reset url_not_found rows. 42/0 across 4 affected files. Full suite 13208/41 (baseline 13204/45 — improvement). tsc clean.
**Live evidence:** Container ea5dc0eb started 23:17Z. No TASK-1943a reset at startup. Cycle 23:30Z: 8 items→ attempts 4 (no TASK-1943a log). Cycle 23:45Z (double-fire): attempts 4→6. No reset by any MCP tool call mid-cycle. Terminalization at :00Z (attempts>=5 fires markUrlNotFound). done rows=65 untouched.
**Commit:** ea5dc0eb | tsc clean | tools=165 | sched=3

Zone health: tsc clean, 165 tools intact, scheduler 3 cron.schedule | HEALTHY
