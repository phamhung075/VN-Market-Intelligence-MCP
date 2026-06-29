# Handoff — BREADTH-TIME-SERIES

**Task ID:** BREADTH-TIME-SERIES  
**Sprint:** MARKET-INDICATOR-DEPTH-P0  
**Owner:** dev-mcp-server + dev-technical-analysis  
**Zone:** `apps/mcp-server/src/scheduler/market-data/` + `apps/technical-analysis/src/`  
**Size:** M (~2h)  
**Status:** READY  
**Depends:** []  
**Blocks:** []

---

## Overview

Implement market breadth time-series persistence and analysis. Captures daily advancing/declining/unchanged/ceiling/floor counts from `vnmarket_prices`, persists to `market_breadth_history` table, and computes breadth indicators: Advance-Decline Line (A-D), RANA, McClellan Oscillator, McClellan Summation, floor panic/ceiling FOMO flags, and Zweig Thrust detection. The tool is a core market internals signal for P1's Fear & Greed gauge.

**Critical constraint:** FORWARD-ACCRUING ONLY. No backfill. Mark `accruing_since` on first persistence. Approximately 40 sessions needed for McClellan warmup; approximately 10 consecutive sessions for Zweig Thrust trigger.

---

## Functional Requirements

### BR-FR-1: New Persistence Table `market_breadth_history`

- **New table in mcp-server schema:**
  ```sql
  CREATE TABLE IF NOT EXISTS market_breadth_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date TEXT NOT NULL UNIQUE,  -- YYYY-MM-DD
    advancing  INTEGER NOT NULL,
    declining  INTEGER NOT NULL,
    unchanged  INTEGER NOT NULL,
    ceiling    INTEGER NOT NULL,        -- tickers at upper limit
    floor      INTEGER NOT NULL,        -- tickers at lower limit
    total      INTEGER NOT NULL,        -- advancing + declining + unchanged
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_mbh_date ON market_breadth_history(session_date DESC);
  ```
- **Write path:** New daily scheduler job (dev-mcp-server) calls the existing breadth fetch logic and writes one row per session to `market_breadth_history`. Runs once per trading day, after market close.
- **Idempotency:** ON CONFLICT(session_date) IGNORE (first write wins — breadth is final when market closes).
- **Scheduler assignment:** Cron `37 8 * * 1-5` (verified free minute in 08:xx weekday window, per architect). Adjacent to `vnstockTradingStatsRefresh` (08:30 UTC).
- **accruing_since:** Store the date of the first row ever inserted (derive as MIN(session_date) from the table when querying, or persist in a meta key).

### BR-FR-2: Advance-Decline Line (A-D Line)

- **Computation:** Cumulative running sum. `adl_today = adl_yesterday + (advancing_today − declining_today)`. Starts at 0 from accruing_since.
- **Output:** `adl` (INTEGER, relative to start), `adl_history: [{date, adl}]` for last N sessions (architect decides N, suggest 60)

### BR-FR-3: RANA and McClellan Oscillator

- **Computation:**
  - `RANA_d` = (advancing − declining) / (advancing + declining + unchanged) × 100 (range -100 to +100)
  - `McClellan Osc` = EMA(19, RANA) − EMA(39, RANA)
  - `McClellan Summation` = running sum of McClellan Osc values
- **Minimum:** 39 sessions needed for EMA(39) to stabilize. Return `mclellan_osc: null` until 39 sessions in `market_breadth_history`.
- **Output:** `rana_today` (REAL), `mclellan_osc` (REAL | null), `mclellan_summation` (REAL | null)

### BR-FR-4: Floor Panic / Ceiling FOMO Flags

- **Computation:**
  - `floor_panic: boolean` = `floor / total > 0.15` (>15% of tickers hitting floor = widespread panic)
  - `ceiling_fomo: boolean` = `ceiling / total > 0.15` (>15% hitting ceiling = FOMO buying)
- **Output:** `floor_panic: boolean`, `ceiling_fomo: boolean`, `floor_pct: float`, `ceiling_pct: float`

### BR-FR-5: Zweig Thrust Flag

- **Computation:**
  - Zweig definition: breadth > 61.5% (advancing / (advancing+declining) > 0.615) for 10 consecutive sessions within a 14-session window
  - Track: `thrust_window`: last 14 sessions from `market_breadth_history`
  - `thrust_triggered: boolean` = met criteria
  - `thrust_sessions_count: int` = count of qualifying sessions in window
  - `thrust_possible: boolean` = thrust_sessions_count >= 5 (flag early)
- **Minimum:** 14 sessions in table. Before that, `thrust_triggered: null`, `thrust_possible: null`.

### BR-FR-6: Tool Response with Gauge-Ready Scalar

- **Gauge-readiness:** `breadth_z_score` = z-score of `mclellan_osc` vs its rolling mean/stdev over available history. Return null when <21 sessions. This is the P1 Fear & Greed gauge's breadth leg.
- **Output summary fields:** 
  - `accruing_since` (TEXT date)
  - `sessions_accrued` (INT)
  - `history_quality: 'SUFFICIENT'|'WARMUP'|'INSUFFICIENT'` (SUFFICIENT = ≥40, WARMUP = 10–39, INSUFFICIENT = <10)

---

## Non-Functional Requirements

- **NFR-BR-1:** The table `market_breadth_history` is append-only from market data; no manual backfill mechanism. If someone attempts to seed it with synthetic data — that is a NO-FAKE-DATA violation. The persister must log and reject rows not derived from live fetch.
- **NFR-BR-2:** The scheduler job must be idempotent (ON CONFLICT IGNORE ensures double-fire is safe).
- **NFR-BR-3:** `get_breadth_thrust` returns `{error: '...'}` when table is empty; never fabricates a score.
- **NFR-BR-4:** Routes via gateway; `toolCount` updated in `docs/data/project-stats.json` (re-derived, not baked).

---

## Edge Cases

- **Market holiday:** No row for that session. The A-D line does not advance. This is correct (market was closed).
- **Market circuit-breaker halt:** Breadth data may be partial. Persist whatever get_market_breadth returns (could show 0 advancing, 0 declining, high floor/ceiling). Flag `is_halt_day: boolean` if floor > 50% of total.
- **Very thin market days** (public half-sessions): total < 100 tickers returned from get_market_breadth. Still persist; consumer can decide to exclude thin sessions.
- **Early McClellan warmup:** With only 20 sessions, `mclellan_osc` is null. The P1 gauge knows this (checks `history_quality` field).

---

## Acceptance Criteria

- [ ] `market_breadth_history` table created with session_date UNIQUE constraint
- [ ] Scheduler job `breadthHistoryPersisterJob.ts` created (cron: 37 8 * * 1-5)
- [ ] Job calls get_market_breadth (or internal equivalent) to fetch advancing/declining/ceiling/floor counts
- [ ] Job writes one row per session_date to market_breadth_history (idempotent ON CONFLICT IGNORE)
- [ ] accruing_since marker tracked (MIN(session_date) or meta table)
- [ ] A-D line computed as cumulative sum (adl_today = adl_yesterday + (adv - decl))
- [ ] RANA daily computed ((adv - decl) / total × 100)
- [ ] McClellan Osc computed (EMA19 - EMA39 of RANA); null until 39 sessions
- [ ] McClellan Summation computed as running sum of McClellan Osc
- [ ] Floor panic flag: floor/total > 15%
- [ ] Ceiling FOMO flag: ceiling/total > 15%
- [ ] Zweig thrust: 10 consecutive sessions with breadth >61.5% within 14-session window; null until 14 sessions
- [ ] `breadth_z_score` gauge-ready scalar included (z of mclellan_osc vs rolling stats; null <21 sessions)
- [ ] `history_quality` field includes (INSUFFICIENT <10, WARMUP 10-39, SUFFICIENT ≥40)
- [ ] Tool returns `{error: '...'}` on failure (table empty, not enough data)
- [ ] Tests: integration with get_market_breadth; idempotency (ON CONFLICT IGNORE); history_quality transitions (INSUFFICIENT→WARMUP→SUFFICIENT); Zweig 14-session window logic; McClellan null until 39 sessions; floor/ceiling % calculations
- [ ] Existing tests still pass: `pnpm check` and `pnpm test` on mcp-server module

---

## Verified Paths (from Architect)

- **Breadth fetch reference:** `apps/mcp-server/src/interface/mcp/tools/market-data/marketTools.ts` — `get_market_breadth` (L501–L584): existing snapshot tool that returns HOSE advancing/declining/unchanged/ceiling/floor counts from `vnmarket_prices`. The persister job queries the SAME underlying data source (not the MCP tool itself — scheduler calls internal function).
- **Scheduler cron:** `apps/mcp-server/src/scheduler/cronConfig.ts` — verified FREE slot: minute `37` in hour `08` weekdays. No existing entry at `37 8 * * 1-5`. Nearest neighbours: `reputationCompute` (33 8) and `alertOutcomeJob` (45 8).
- **Technical analysis:** `apps/technical-analysis/src/domain/services.ts` — extend with `BreadthService` for McClellan/Zweig calculations (pure functions, zero I/O).

---

## New Files to Create

- `apps/mcp-server/src/scheduler/market-data/breadthHistoryPersisterJob.ts` — persister job (cron: 37 8 * * 1-5)
- `apps/technical-analysis/src/domain/services/BreadthService.ts` — pure breadth calculations (ADL, RANA, McClellan, Zweig)
- `apps/technical-analysis/src/domain/models/BreadthModels.ts` — BreadthRow interface
- `apps/technical-analysis/src/infrastructure/repositories/BreadthDataRepository.ts` — read market_breadth_history rows
- `apps/mcp-server/src/interface/mcp/tools/market-data/breadthThrustTools.ts` — MCP tool wrapper for `get_breadth_thrust`

---

## Modified Files

- `apps/mcp-server/src/infrastructure/db/schema-market-data.ts` — add `market_breadth_history` table + index
- `apps/mcp-server/src/scheduler/cronConfig.ts` — add `breadthHistoryPersister: '37 8 * * 1-5'` key
- `apps/mcp-server/src/scheduler/jobs.ts` — register breadthHistoryPersisterJob
- `apps/technical-analysis/src/domain/models.ts` — add BreadthRow interface
- `apps/technical-analysis/src/interface/handlers.ts` — add POST /ta/breadth-thrust route
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — register `get_breadth_thrust` tool
- `docs/data/project-stats.json` — update `toolCount` (re-derived, not baked)

---

## Gauge-Readiness Contract (P1 dependency)

**Gauge-ready scalar:** `breadth_z_score` (float)
- Null condition: fewer than 21 sessions in market_breadth_history
- Usage: P1 Fear & Greed gauge's breadth leg

---

## Risk Flags (from Architect)

- **RISK-BREADTH-FIRST-RUN [LOW]:** `market_breadth_history` starts empty. `get_breadth_thrust` returns `{ error: 'no breadth history' }` when table empty (per NFR-BR-3). All consumers (market-watcher, P1 gauge, etc.) must handle this error response. The P1 gauge also reads `breadth_z_score` which will be null for 21+ sessions after first deploy.

---

## Done Criteria

- Code review approved (forward-accruing constraint verified, idempotency tested)
- `pnpm check` and `pnpm test` pass on both mcp-server and technical-analysis modules
- Scheduler cron verified: `37 8 * * 1-5` (free slot)
- Integration test confirms market_breadth_history populated daily (idempotent on rerun)
- Tool tested via gateway (history_quality transitions INSUFFICIENT→WARMUP→SUFFICIENT, McClellan null until 39 sessions, breadth_z_score null until 21 sessions)
- Commit message: `feat(BREADTH): market_breadth_history table + daily persister cron, A-D line, RANA, McClellan Osc, Zweig thrust, floor-panic/ceiling-FOMO flags`

---

## Developer Notes

**Forward-accruing only:** No backfill. The persister starts fresh and accrues ~40 sessions before McClellan stabilizes, and ~10 sessions before Zweig can trigger. This is intentional (no fabricated history). Mark `accruing_since` so P1 gauge knows when the warmup clock started.

**Scheduler slot:** Cron `37 8 * * 1-5` is confirmed free. This is 08:37 UTC = 15:37 VN time, well after market close (14:45 VN). Adjacent to vnstockTradingStatsRefresh (08:30 UTC).

**Idempotency:** ON CONFLICT(session_date) IGNORE means re-running the job over the same session_date produces no error and no row change (first write wins). This is safe for double-fire scenarios.

**No-fake-data:** The persister MUST log the live fetch source (get_market_breadth or internal function call that reads vnmarket_prices). If someone tries to seed synthetic breadth data, NFR-BR-1 catches it (log + reject).

**Gauge scalar:** `breadth_z_score` is the single scalar the P1 gauge reads. Ensure this field is always present (or null if <21 sessions), never omitted.

**McClellan warmup:** EMA(39) needs 39 sessions to stabilize. Before that, mclellan_osc is null. This is correct (no fabrication). After 40 sessions, the P1 gauge can use breadth_z_score.

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/src/ ONLY — ZERO changes to apps/technical-analysis
- **Files modified:**
  - NEW `domain/services/market-data/breadthCalculator.ts` — pure domain: EMA, ADL, RANA, McClellan Osc (null idx<38), McClellan Summation, FloorCeiling (>15%/halt >50%), Zweig Thrust (>61.5% for 10/14 sessions), breadth_z_score (null <21s, std=0→0), history_quality, 6-field GaugeReadyScalar (confidence 1.0/0.5/null)
  - NEW `infrastructure/db/breadthHistoryStore.ts` — getAllBreadthHistory (ASC), getRecentBreadthHistory, getBreadthHistoryCount, getAccruingSince, upsertBreadthRow (INSERT OR IGNORE)
  - MOD `infrastructure/db/schema-market-data.ts` — market_breadth_history DDL + idx_mbh_date DESC index
  - NEW `application/usecases/getBreadthThrust.ts` — {error:'no breadth history...'} on empty (NFR-BR-3); ADL capped 60s; history_quality always present
  - NEW `scheduler/market-data/breadthHistoryPersisterJob.ts` — LIVE_FETCH_SOURCE logged (NFR-BR-1); skip total=0 AND ceiling=0 AND floor=0; _isRunning guard; recordJobRun {rowsWritten: inserted?1:0}
  - NEW `interface/mcp/tools/market-data/breadthThrustTools.ts` — get_breadth_thrust (#179)
  - NEW `interface/mcp/tools/market-data/volatilityIndicatorTools.ts` — get_volatility_indicators (#180) proxy to Go TA :5003; honest-NULL on rv_60d/drawdown_252d; {error:'...'} on upstream failure (NFR-P01-1)
  - MOD `infrastructure/microservices/clients.ts` — computeVolatilityIndicators(), ComputeVolatilityRequest/Response/TickerAtrResult types
  - MOD `scheduler/cronConfig.ts` — breadthHistoryPersister key
  - MOD `scheduler/startScheduler.ts` — scheduleCron block for breadthHistoryPersister
  - MOD `interface/mcp/tools/registry.ts` — registerBreadthThrustTools (#179) + registerVolatilityIndicatorTools (#180)
- **Tests written:** `__tests__/P0-BREADTH-TIME-SERIES.test.ts` — 45 tests (AC-1..AC-20), 94 expect() calls, 0 fail
- **Git commits:** ee380fdf feat(BREADTH-TIME-SERIES): breadth time-series persister + McClellan/Zweig + volatility proxy
- **Type check:** clean (bun tsc --noEmit EXIT 0)
- **bun test:** 45 pass / 0 fail
- **Tool count:** 178 tools (176→178, +get_breadth_thrust+get_volatility_indicators; gen-tool-registry + gen-project-stats regenerated)
- **Scheduler count:** cronConfig key added; scheduleCron block added in startScheduler.ts (scheduleCron() wrapper, not cron.schedule — pre-existing architecture per _cronJobCountNote)
- **Stale-handoff deviation:** Handoff cited apps/technical-analysis/BreadthService.ts for McClellan/Zweig. TA zone is Go-primary; task prompt overrode to mcp-server-only. All math in breadthCalculator.ts. Documented in DJ.
- **Docs updated:** NONE (no microservice architecture doc change; schema addition is self-documenting via DDL comments)
- **Graphify:** skipped (no docs impacted)
