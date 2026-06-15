# dev-technical-analysis — Notebook

Zone: `apps/technical-analysis/` | Stack: **Go** (pilot active, 2026-05-22) | DB: market.db (read-only)

## Working Memory

[3 most recent cycles retained below. Archive in git history.]

### 2026-06-15 — FIX-RSI-REPORT-FAILCLOSED — report RSI path fail-close fix

**Task:** FIX-RSI-REPORT-FAILCLOSED (zone apps/mcp-server/ — recon confirmed zone, not apps/technical-analysis/)

**Status:** REVIEW — commit ed77b9b0

**Recon findings (zone confirmed):**
- The canonical tool `get_technical_indicators` in `technicalIndicatorTools.ts` correctly returns "RSI(14): N/A (cần tối thiểu 15 nến)" via `localComputeRSI(prices, 14)` which guards `prices.length < period + 1 = 15`.
- The MARKET report RSI path is `defaultComputeTa()` in `assembleBriefing.ts:674`, called from: (a) `assembleBriefing` morning briefing Step 17, (b) `assembleEveningSummary` Step 4, (c) `franceSummaryJob` via `fetchTaSignals`. All three consume `defaultComputeTa`.
- The bug: `Math.min(14, rows.length - 1)` as period. With 6 candles → period=5 → `computeRSILocal(prices, 5)` passes the `prices.length >= 6` guard and computes RSI. Result: VRE RSI 10.3 on 6 candles, VIC 7.4, VHM 9.8 published to MARKET.

**Fix (single-line):**
- `assembleBriefing.ts:674` — changed `computeRSILocal(prices, Math.min(14, rows.length - 1))` → `computeRSILocal(prices, 14)`.
- Guard raised from `rows.length < 8` → `rows.length < 15` (same threshold in both primary and fallback paths).
- DRY: no change to the RSI math (already identical between both paths). Both already use the same `computeRSILocal` guard logic — only the adaptive period bypassed it.

**Tests (TDD RED→GREEN):**
- `FIX-RSI-REPORT-FAILCLOSED.test.ts` (new) — 9 TCs: A1-A5 = <15 candles → null (VRE/VIC/VHM class + canonical ref), B1-B3 = >=15 candles → report RSI == canonical RSI (exact floating-point match).
- `1346-ta-adaptive-periods.test.ts` — updated TC-2/TC-3 (adaptive behavior removed; 10/14 rows now → null not TaSignal).
- `1330-ta-daily-ohlcv.test.ts` — updated TC-2 (14 rows → null, not overbought TaSignal).

**Results:** tsc clean, 12940 pass (7 pre-existing failures unrelated to RSI). No new regressions.

**REBUILD_REQUIRED:** no — only application layer code changed, no service-level build.

---

### 2026-06-14 — ALLZERO-OHLCV-FETCH — chart-sliver/BB-fan data fix

**Task:** ALLZERO-OHLCV-FETCH (zone apps/mcp-server/) — fix all-zero OHLCV rows poisoning BB window and chart Y-domain

**Status:** REVIEW — commit 9088c052

**Root cause:** Non-trading-day gap rows (0/0/0/0) in daily_ohlcv. Two sources:
- Failed bulk fetch 2026-05-30: 103 tickers stamped with zeros (not skipped).
- DPI-4 foreign-flow stub rows: `ohlcvForeignFlowStore` inserts open/high/low/close=0 placeholders that outlast the OHLCV write for some tickers (DAG, BCG etc.)
- A zero inside the 20-period BB window: stdev detonates to ±35k, chart Y-axis anchors to 0.
- Also VCB 2026-06-01 close=62.2 (thousand-VND, should be 62200) survived CONTAM-2..7.

**Fix (TDD RED→GREEN, 5 AC tests):**
1. `priceHistoryTools.ts` — added `AND close > 0` to `get_price_history` SQL. Immediate read-side guard for chart + BB + alerts.
2. `allzeroOhlcvBackfill.ts` (new) — `purgeAllZeroRows(db)`: DELETE all 0/0/0/0 rows; `normalizeResidualContam(db)`: whole-row ×1000 for close<100 contaminated rows.
3. `ALLZERO-OHLCV-FETCH.test.ts` (new) — 5 ACs covering zero exclusion, Min stat, DPI-4 stub exclusion, normalize fix.

**Live migration:** 116 all-zero rows purged, 28346 thousand-VND rows re-normalized. Container rebuilt.

**Probe (live):** SHB zero_rows=0 Min=13,550 BB=0.88% | VCB zero_rows=0 Min=59,900 BB=1.92% (2026-06-01 close=62200) | FPT zero_rows=0 Min=70,000 BB=2.14%. All BB widths well under 15%.

**Lessons:** DPI-4 stub rows are by design (DDD race fix); the read-side `close>0` guard is the correct surgical fix. The taOhlcvBackfill already heals stubs on next cycle (detects corrupt_cnt>0 for low=0). Generic fix — no per-ticker hardcode.

---

### 2026-06-08 — FIX-TA-GOLANGCI-CONFIG-V2 — migrate .golangci.yml to v2 schema

**Task:** FIX-TA-GOLANGCI-CONFIG-V2 (Sprint CI-RED-RECONCILE)

**Status:** REVIEW — commit d73c7a40. VERIFICATION GATE: GREEN ci.yml after subsequent push.

**Root cause:** `apps/technical-analysis/.golangci.yml` was the only one of 6 service configs still using the v1 schema after the FIX-CI-LINT-STACK migration bumped golangci-lint-action to v7 (golangci-lint v2.0.2). golangci-lint v2 rejects any config without top-level `version: "2"` with exit 3 — config parse crash, not lint violations.

**v1 → v2 changes applied:**
1. Added `version: "2"` top-level.
2. `run.go: "1.22"` removed (v2 dropped this key); replaced with `run.timeout: 120s`.
3. `linters.disable-all: true` → `linters.default: none`.
4. Top-level `linters-settings:` → `linters.settings:` nested under `linters:`.
5. Removed `Main:` allow-list depguard rule (v2 sibling pattern; deny-list fences preserved intact).

**Local verify:** `golangci-lint run` exits 1 (lint running, real violation surfaced), NOT 3 (config crash). The exit-1 violation (`cmd/sandbox/main.go:44` Fence-C) is pre-existing debt tracked as FIX-TA-SANDBOX-DEPGUARD.

**DJ-GATE-1:** `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-dev-technical-analysis.md`

**Files changed:** `apps/technical-analysis/.golangci.yml`

---

## Archive

[Archived to git history; retained: 3 most recent cycles. Full history in git log.]

### 2026-05-24 — Multiple TA dashboard improvements

Archived entries (dashboard/dash-check.mjs, category relabel, service tier, render gate, bake-verdicts). See git log for full details.
