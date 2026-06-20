<!-- size-justification: 190L — full multi-zone blueprint: root-cause confirmation, engine authority decision, generic-mandate table, per-zone task specs; no reuse benefit from splitting. -->
# Architecture Brief — FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE

**Date:** 2026-06-21
**Architect:** architect
**Task:** FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE (P1, raw_verified:true)
**Zones:** `apps/mcp-server/` (digest wiring) · `apps/technical-analysis/` (canonical engine — read-only, no change needed)
**BUILD-STANDARD:** not-applicable (bug-fix, existing zones, no new service/port/primitive)
**Scan clean:** true

---

## [Architect] Brownfield Findings

### Zone
- **Primary zone:** `apps/mcp-server/` — all code changes live here
- **Secondary zone:** `apps/technical-analysis/` — READ-ONLY reference; the Go TA service is already the authoritative engine; no changes needed there
- **Multi-zone flag for PM:** split into `dev-mcp-server` (assembler wiring) and `dev-technical-analysis` (canonical engine contract) — see §Subtask Decomposition

---

### Verified paths

| File | Role in divergence |
|---|---|
| `apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts` | Alert path — queries `daily_ohlcv WHERE date >= date('now', '-60 days')` (no LIMIT), passes full candle array to Go `computeTAIndicators`, MIN_CANDLES=35 guard |
| `apps/mcp-server/src/application/usecases/assembleBriefing.ts` | TA/sector path — `defaultComputeTa()` queries `daily_ohlcv ORDER date ASC LIMIT 60`, min-candle gate=15, calls TS-local `computeRSILocal()`, synthetic fallback to `market_prices_history MAX(price)` |
| `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` | Digest orchestrator — imports `defaultComputeTa` from assembleBriefing.ts; wires it as `computeTaFn` for the TA-block; the `topAlerts` block reads pre-written `alerts` rows produced by `taAlertScanJob` (a separate cron cycle) |
| `apps/mcp-server/src/infrastructure/microservices/clients.ts` | Go TA service HTTP client — `computeTAIndicators({ code, closes })` → POST `localhost:5003/ta/indicators`; maps time-series arrays to scalars |
| `apps/technical-analysis/pkg/primitive/rsi/rsi.go` | Go canonical RSI — Wilder smoothing (seed = SMA of first `period` gains/losses; subsequent = `(prev*(period-1) + current) / period`); returns full series, last element = current RSI |
| `apps/technical-analysis/pkg/module/technical_analysis.go` | Go module composition — RSI, MACD, BB, MA all computed non-fatally from `closes[]` |
| `apps/technical-analysis/pkg/application/usecases.go` | Go use-case — pure-compute path: `req.Closes` forwarded directly; DB-backed path: `GetCandles(symbol, 60)` (mirror of LIMIT 60 query) |

---

### Root Cause Confirmation (brownfield-verified)

The divergence is caused by three simultaneous mismatches between the two paths:

**Mismatch 1 — Candle window construction (most impactful):**
- Alert path: `WHERE date >= date('now', '-60 days')` — returns all candles within the last 60 calendar days (can be fewer than 60 rows on illiquid tickers, can be >60 on dense fills; for NVL with 41 rows it returns all 41).
- TA path: `ORDER date ASC LIMIT 60` — returns up to the 60 most-recent rows, but ALSO falls back to `market_prices_history MAX(price)` synthetic close rows if `daily_ohlcv` returns fewer than 15.
- Effect: identical row count for NVL (41) but the synthetic-fallback path can produce different input vectors entirely.

**Mismatch 2 — Minimum-candle gate:**
- Alert path: MIN_CANDLES=35 (hardcoded constant, rationalized for Wilder warmup convergence).
- TA path: min=15 (`if rows.length < 15 → try fallback; if fallbackRows.length < 15 → return null`).
- Effect: for tickers with 15–34 candles, the TA path returns a shallow-warmup RSI value while the alert path correctly fails-closed.

**Mismatch 3 — Implementation identity:**
- Both implement Wilder smoothing identically in math (confirmed by reading Go `rsi.go` and TS `computeRSILocal` — seed and smoothing formulas match). So for the SAME input array, both would agree to within float precision. The divergence is entirely explained by mismatches 1 and 2 above.

**Conclusion:** The TS `computeRSILocal` math is NOT wrong per se, but its candle acquisition (LIMIT 60 with synthetic fallback) and its lower min-candle gate (15) produce a different input to the same Wilder formula. The resulting RSI diverges from the alert path's RSI even on tickers with sufficient candles, purely because LIMIT 60 allows a different tail than the date-window query.

---

### Generic Mandate — Other Indicators Audit

| Indicator | Alert path engine | Digest TA-block engine | Dual-engine divergence? |
|---|---|---|---|
| RSI(14) | Go `computeTAIndicators` via `taAlertScanJob` | TS `computeRSILocal` via `defaultComputeTa` | **YES — active, this fix** |
| BB (Bollinger) | Go `computeTAIndicators` via `bbAlertScanJob` | NOT computed in `defaultComputeTa` / `TaSignal` | **NO** — no digest TA-block BB; alert BB has no TS-local parallel |
| MACD | Not computed by any alert scan job | NOT computed in `defaultComputeTa` / `TaSignal` | **NO** — not present in digest at all |
| MA20 | Not computed by alert scan jobs | TS `computeMALocal` in `defaultComputeTa` | **NO** — only one path computes MA20 for digest |

**Scope conclusion:** RSI is the only indicator with an active dual-engine split in the digest cycle. BB and MACD are not dual-sourced in the digest. The generic mandate is satisfied by fixing the RSI path — no other indicator requires parallel remediation.

---

### Design Decision — Canonical Engine Authority

**Decision: Go TA service (`computeTAIndicators`) is the canonical RSI engine.**

Rationale:
1. The Go service already owns the alert path — changing that path would widen the blast radius unnecessarily.
2. The Go `rsi.go` implementation is a tested pure primitive with explicit `ErrInsufficientData` contract; no ad-hoc fallbacks.
3. Aligning the briefing/evening TA path to the same engine eliminates the synthetic fallback risk entirely.
4. The Go service accepts `closes[]` directly (pure-compute path) — no new DB query at the service level is needed; the mcp-server caller controls candle selection.

**Decision: Canonical window = `daily_ohlcv WHERE date >= date('now', '-60 days') ORDER BY date ASC` (no LIMIT).**

Rationale: The date-window query is safer than LIMIT 60 for tickers whose candle density varies (illiquid tickers may have fewer than 60 rows in 60 days). Using a LIMIT risks silently truncating history on high-density tickers or including extra synthetic rows on low-density ones. The date-window query mirrors the already-validated alert path.

**Decision: Canonical min-candle gate = 35 (MIN_CANDLES from taAlertScanJob).**

Rationale: The 15-candle gate in `defaultComputeTa` was rationalized as "period + 1 = 15". The 35-candle gate (2.5 × period) is the defended rationale in the codebase and in the `FIX-ALERT-ENGINE-RSI-SINGLEDIGIT` fix. Aligning to 35 avoids the shallow-warmup degenerate-RSI class that was already fixed on the alert side.

**Decision: Synthetic `market_prices_history` fallback is REMOVED from the digest RSI computation path.**

Rationale: Synthetic MAX(price) closes from intraday ticks are NOT equivalent to official OHLCV close prices. The fallback was added to handle newly-listed tickers or short histories, but it produces divergent RSI and violates `/goal#1 — no implausible/inconsistent served data`. The correct handling is fail-closed (return null) when fewer than 35 candles are available in `daily_ohlcv` — consistent with the alert path and with the `FIX-RSI-REPORT-FAILCLOSED` rationale already in the code comment.

---

### Fix Design — Per Zone

#### Zone A: `apps/technical-analysis/` — NO CODE CHANGE
The Go service already accepts `closes[]` via the pure-compute path (verified in `usecases.go`). It already uses the correct Wilder RSI primitive. No changes needed in this zone. This subtask is a **contract document only** — the dev-technical-analysis agent documents the canonical contract so dev-mcp-server can consume it correctly.

#### Zone B: `apps/mcp-server/` — ALL CODE CHANGES HERE

**Target function: `defaultComputeTa()` in `assembleBriefing.ts` (lines ~659–701)**

Changes:
1. Replace TS-local `computeRSILocal` call with `computeTAIndicators` async call (Go service client, already imported and used by `taAlertScanJob`).
2. Replace the candle SQL from `ORDER date ASC LIMIT 60` to `WHERE date >= date('now', '-60 days') ORDER BY date ASC` (matches `taAlertScanJob` CANDLE_SQL).
3. Replace min-candle gate from `< 15` to `< 35` (matches `MIN_CANDLES` constant).
4. Remove the `market_prices_history` synthetic-close fallback block entirely.
5. Make `defaultComputeTa` async (it will now call the Go service via HTTP). Update callers: `assembleEveningSummary.ts` uses `computeTaFn` which is already assigned as a synchronous `(code, db) => TaSignal | null` — callers must be updated to `async (code, db) => Promise<TaSignal | null>`.
6. Add a stub-bar guard matching `taAlertScanJob`: reject latest candle if `close <= 0 OR volume <= 0` before calling Go service. The `daily_ohlcv` query must also SELECT `volume` (currently only selects `date, close`).
7. Keep `computeMALocal` for MA20 only — MA20 is NOT part of the dual-engine divergence and does not need to route through Go service.
8. Keep `computeRSILocal` and `computeMALocal` as dead-code candidates for cleanup (do NOT delete in this task — other callers may reference them; PM flags as follow-on CLEAN task).

**Callers of `defaultComputeTa` / `computeTaFn`:**
- `assembleBriefing.ts` L1198: `const taFn = options.computeTaFn ?? defaultComputeTa` — must accept async.
- `assembleEveningSummary.ts` L594: `const taFn = options.computeTaFn ?? defaultComputeTa` — must accept async.
- Both must `await taFn(code, db)` in their per-ticker loops.

**Go service availability guard:**
- If the Go service is unavailable (HTTP error), fail-closed for that ticker (return null / `rsi14: null`) — same posture as the existing stub-bar guard. DO NOT fall back to TS-local RSI. An absent RSI is an honest gap; a divergent RSI is a correctness bug.

**Test contract (dev must add):**
- Unit test: fixture ticker with 41 candles → `defaultComputeTa` returns the same RSI as `computeTAIndicators` called directly with the same closes array.
- Test for fail-closed: ticker with 34 candles → returns null (not a shallow RSI value).
- Test for synthetic-fallback removal: ticker with 0 daily_ohlcv rows → returns null (no fallback to `market_prices_history`).

---

### Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| RISK-1: `defaultComputeTa` becomes async — callers must await | MEDIUM | Two callers (`assembleBriefing.ts`, `assembleEveningSummary.ts`) both use it inside per-ticker loops. PM must flag: if either loop is currently synchronous, the loop header must become `for...of` with `await` (not `forEach`). Check: `assembleEveningSummary.ts` L594–635 uses a synchronous `for...of` loop — needs `await`. |
| RISK-2: Go service down at briefing time → all RSI null | LOW | Acceptable fail-closed. The taAlertScan path already tolerates this (null RSI = skip). Briefing page shows "TA pending" — consistent behavior, honest gap. |
| RISK-3: `computeTaFn` type signature change breaks test mocks | LOW | Tests inject `computeTaFn` directly — they must be updated to async mocks. Dev must check `__tests__/assembleBriefing.test.ts` and `assembleEveningSummary.test.ts` for sync mock injection. |
| RISK-4: Dead-code warning for `computeRSILocal` post-fix | INFO | Do NOT delete in this task. `technicalIndicatorTools.ts` has its own local copy (`localComputeRSI`) for the DB-fallback path; the briefing's `computeRSILocal` becomes unused. PM mints follow-on CLEAN task. |

---

### Subtask Decomposition for PM

**TASK-RSIFIX-1** — dev-technical-analysis
- **Zone:** `apps/technical-analysis/`
- **Work type:** Contract documentation only (no code change)
- **Purpose:** Write + commit `docs/standards/ta-engine-contract.md` documenting the canonical Go RSI contract (pure-compute path, min-candle requirement, Wilder parameters) so dev-mcp-server can implement against a frozen contract without re-reading Go source.
- **Files:** new `docs/standards/ta-engine-contract.md`
- **Blocking:** TASK-RSIFIX-2 is blocked on TASK-RSIFIX-1 (dev-mcp-server needs the contract doc before wiring)
- **Rebuild required:** false (docs only)
- **Verification:** contract doc exists + accurately reflects Go `rsi.go` primitives (period=14, seed=SMA of first 14 gains/losses, subsequent=Wilder smoothing) + documents the pure-compute path contract (`closes[]` in → RSI series out)

**TASK-RSIFIX-2** — dev-mcp-server
- **Zone:** `apps/mcp-server/`
- **Work type:** Bug fix (async refactor + Go client wiring)
- **Purpose:** Rewire `defaultComputeTa()` to use Go `computeTAIndicators` as the sole RSI engine; align candle window to date-window query; raise min-candle gate to 35; remove `market_prices_history` synthetic fallback; make function async; add stub-bar guard for latest candle; update caller loops to await; update test mocks.
- **Files:**
  - `apps/mcp-server/src/application/usecases/assembleBriefing.ts` (lines ~659–701, ~1190–1210)
  - `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` (lines ~594–635)
  - `apps/mcp-server/src/__tests__/assembleBriefing.test.ts` (mock update)
  - `apps/mcp-server/src/__tests__/assembleEveningSummary.test.ts` (mock update, if exists)
- **Blocked by:** TASK-RSIFIX-1
- **Rebuild required:** true
- **Root cause:** dual-engine RSI divergence (NVL: 29.7 vs 27.6 on 2026-06-19)
- **Verification gate (LIVE):** In a real evening-cycle, RAW-probe `get_technical_indicators` (Go path) and read the `taSummary` RSI from the evening JSON for the same ticker. Assert RSI values agree to ≤0.1 for ≥3 tickers. Additionally verify: (a) ticker with <35 candles → `rsi14: null` in taSummary; (b) no `market_prices_history` candles appear in the candle array sent to Go service.

---

### Reuse Patterns

- `computeTAIndicators` client is already imported by `taAlertScanJob.ts` — import it from the same path in `assembleBriefing.ts`. No new adapter needed.
- The `CANDLE_SQL` constant pattern from `taAlertScanJob.ts` (date-window, ASC order, SELECT volume) should be replicated directly. Do NOT inline — extract to a named constant `BRIEFING_CANDLE_SQL` in `assembleBriefing.ts` for testability.
- The stub-bar guard pattern from `taAlertScanJob.ts` lines 199–203 is copy-adaptable to `defaultComputeTa`.

---

### Decision Journal Reference

See `docs/agent-memory/decisions/sprint-FIX-DIGEST-RSI-DUAL-ENGINE-DIVERGE-architect.md` for engine authority + fallback removal rationale.
