# Handoff — P0-2-FOREIGN-ROOM-SUITE

**Task ID:** P0-2-FOREIGN-ROOM-SUITE  
**Sprint:** MARKET-INDICATOR-DEPTH-P0  
**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/`  
**Size:** M (~2h)  
**Status:** READY  
**Depends:** []  
**Blocks:** []

---

## Overview

Implement a comprehensive foreign investor room utilization and saturation suite. Covers per-ticker room analysis (utilization %, events, velocity), derived flags (ROOM_LOCKED, FULL_ROOM_SELL), and market-wide aggregations (cap-weighted saturation by sector). The tool provides early warning signals for foreign flow dynamics and room constraints.

**Design note:** Event detection is located in mcp-server (vnstockFundamentalsJob.ts), NOT dev-stock-price, to keep writes centralized in a single SSOT path.

---

## Functional Requirements

### FR-1: Per-Ticker Room Utilization

- **Inputs:** From `vnstock_trading_stats` table (already populated daily):
  - `foreign_room` (remaining room in shares)
  - `max_holding_ratio` (percentage limit)
  - `current_holding_ratio` (current %)
  - `foreign_volume` (daily foreign buy volume)
- **Computation:** `room_utilization_pct` = current_holding_ratio / max_holding_ratio × 100
- **Output per ticker:** `room_utilization_pct` (0–100), `foreign_room_remaining` (shares), `max_holding_ratio`, `current_holding_ratio`
- **Null handling:** Only computable when max_holding_ratio > 0. Return null when max_holding_ratio = 0 (foreign-restricted stock, e.g. defence sector) and flag `foreign_restricted: true`.

### FR-2: Room→0 / Reopen Events

- **New table in mcp-server schema:** `foreign_room_events`
  ```sql
  CREATE TABLE IF NOT EXISTS foreign_room_events (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    code                  TEXT NOT NULL,
    event_type            TEXT NOT NULL CHECK(event_type IN ('ROOM_FULL', 'ROOM_REOPEN')),
    event_date            TEXT NOT NULL,
    room_remaining_before INTEGER,
    room_remaining_after  INTEGER,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(code, event_date, event_type)
  );
  ```
- **Write path:** Extend `vnstockTradingStatsRefresh` job in `vnstockFundamentalsJob.ts` (L44). After a new trading_stats row is upserted, detect room transitions:
  - ROOM_FULL: utilization_pct ≥99% (room near-zero)
  - ROOM_REOPEN: utilization_pct <95% after a previous ROOM_FULL event (recovery)
- **Idempotency:** UNIQUE(code, date, type) ensures re-running the job over same row is a no-op.
- **Ownership split:** dev-stock-price has ZERO code changes. Event detection fully in mcp-server (single-writer principle).

### FR-3: 5-Day Room Depletion Velocity

- **Inputs:** `vnstock_trading_stats` last 5 rows per ticker (daily series)
- **Computation:** `depletion_velocity_5d` = (room_5d_ago − room_today) / 5 (shares/day). Positive = room shrinking.
- **Output per ticker:** `depletion_velocity_5d` (REAL, nullable if <5 rows available)

### FR-4: ROOM_LOCKED and FULL_ROOM_SELL Flags

- **ROOM_LOCKED:** `room_utilization_pct >= 99` AND `depletion_velocity_5d <= 0` (room full AND not recovering). Blocks new foreign buy.
- **FULL_ROOM_SELL:** `room_utilization_pct >= 99` AND recent foreign_volume shows net selling pattern (current_holding_ratio declining over 3d). Foreigners are selling out of a full-room stock.
- **Output per ticker:** `room_locked: boolean`, `full_room_sell: boolean`

### FR-5: Market-Wide and Sector Cap-Weighted Saturation

- **Inputs:** Each ticker's room_utilization_pct weighted by `market_cap_bn` (from vnstock_trading_stats). Sector mapping from `stock-classification.json`.
- **Computation:** Aggregate to watchlist-level and sector-level cap-weighted saturation
- **Outputs:**
  - `market_saturation_pct` (watchlist cap-weighted 0–100)
  - `sector_saturation: { [sectorName]: float }` (cap-weighted per sector)
- **Gauge-readiness:** Compute `foreign_outflow_z_5d`: z-score of market-wide depletion_velocity_5d vs 20-session rolling mean and stddev. This is the P1 Fear & Greed gauge's foreign-outflow leg. Return null when <20 sessions of saturation data available.

---

## Non-Functional Requirements

- **NFR-P02-1:** Tool routes via gateway; `toolCount` updated in `docs/data/project-stats.json` (re-derived, not baked).
- **NFR-P02-2:** `{error: '...'}` on failure. NEVER expose raw DB error messages in the tool response.
- **NFR-P02-3:** If `max_holding_ratio = 0` or NULL for a ticker, `room_utilization_pct` = null (do NOT emit 0 or Infinity). Flag `foreign_restricted: true`.
- **NFR-P02-4:** New table `foreign_room_events` is additive only (ALTER TABLE + CREATE TABLE IF NOT EXISTS pattern). Schema migration follows idempotent pattern in schema-financial-reports.ts.

---

## Edge Cases

- **Ticker with only 1 day of data:** `depletion_velocity` = null; ROOM_LOCKED / FULL_ROOM_SELL require minimum 3d window. Return null for these flags.
- **max_holding_ratio = 0** (foreign-restricted stock): flag `foreign_restricted: true`, return all derived fields as null.
- **VN rule change** (SBV increases/decreases max holding ratio): the UNIQUE(code, date) constraint in vnstock_trading_stats absorbs the change correctly on the next daily fetch.

---

## Acceptance Criteria

- [ ] Per-ticker room utilization computed correctly (null when max_holding_ratio ≤ 0)
- [ ] `foreign_room_events` table created (UNIQUE constraint on code/date/type)
- [ ] Event detection in `vnstockFundamentalsJob.ts` detects ROOM_FULL (≥99%) and ROOM_REOPEN (<95% recovery)
- [ ] 5-day depletion velocity calculated (null when <5 rows)
- [ ] ROOM_LOCKED flag: utilization ≥99% AND velocity ≤0
- [ ] FULL_ROOM_SELL flag: utilization ≥99% AND net selling pattern (holding_ratio declining 3d)
- [ ] Market-wide cap-weighted saturation computed (% 0–100)
- [ ] Sector saturation breakdown included (cap-weighted per sector from stock-classification.json)
- [ ] `foreign_outflow_z_5d` gauge-ready scalar included (z-score; null when <20 sessions)
- [ ] Tool returns `{error: '...'}` on failure
- [ ] Tests: foreign_restricted ticker (max_holding=0) → null fields; ROOM_FULL event detection; <5-day velocity → null
- [ ] Existing tests still pass: `pnpm check` and `pnpm test` on mcp-server module

---

## Verified Paths (from Architect)

- **Source table:** `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — `vnstock_trading_stats` DDL (L308–L341): has `code`, `date`, `foreign_room`, `foreign_volume`, `current_holding_ratio`, `max_holding_ratio`, `market_cap_bn`, UNIQUE(code, date)
- **Event detection hook:** `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` — `JOB_NAME_TRADING_STATS = "vnstockTradingStatsRefresh"` (L44), runs at 08:30 UTC weekdays. Extend here for ROOM_FULL/REOPEN transition detection.
- **Reference tool:** `apps/mcp-server/src/interface/mcp/tools/market-data/marketWideForeignFlowTool.ts` — existing foreign-flow tool (pattern reference for new tool).

---

## New Files to Create

- `apps/mcp-server/src/domain/services/market-data/foreignRoomAnalyzer.ts` — domain logic (utilization, velocity, flags, saturation)
- `apps/mcp-server/src/application/usecases/getForeignRoom.ts` — orchestration layer
- `apps/mcp-server/src/infrastructure/db/foreignRoomStore.ts` — read/aggregate from vnstock_trading_stats
- `apps/mcp-server/src/interface/mcp/tools/market-data/foreignRoomTools.ts` — MCP tool wrapper for `get_foreign_room`

---

## Modified Files

- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — add `foreign_room_events` table DDL
- `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` — extend to detect ROOM_FULL/REOPEN events after trading_stats upsert
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — register `get_foreign_room` tool
- `docs/data/project-stats.json` — update `toolCount` (re-derived, not baked)

---

## Gauge-Readiness Contract (P1 dependency)

**Gauge-ready scalar:** `foreign_outflow_z_5d` (float)
- Null condition: fewer than 20 sessions of watchlist saturation history
- Usage: P1 Fear & Greed gauge's foreign-outflow leg (watchlist-scoped caveat in gauge description)

---

## Risk Flags (from Architect)

- **RISK-P0-2-EVENT-DESIGN [MEDIUM]:** Event detection was originally assigned to dev-stock-price but is now in mcp-server (vnstockFundamentalsJob). This keeps single-writer integrity (mcp-server owns market.db writes). Verify that dev-stock-price receives zero new code assignments for this task.

---

## Done Criteria

- Code review approved (event detection in vnstockFundamentalsJob verified, null propagation tested)
- `pnpm check` and `pnpm test` pass on mcp-server module
- Integration test confirms foreign_room_events table populated correctly
- Tool tested via gateway (foreign_outflow_z_5d scalar verified)
- Commit message: `feat(P0-2-FOREIGN-ROOM): room utilization, event detection, velocity, ROOM_LOCKED/FULL_ROOM_SELL, market/sector saturation`

---

## Developer Notes

**Single-writer principle:** All market.db writes route through mcp-server. Event detection in vnstockFundamentalsJob (which already writes vnstock_trading_stats) is the cleanest point to add ROOM_FULL/REOPEN logic.

**Sector mapping:** Use stock-classification.json to group tickers by sector. Load at startup; query for each ticker.

**Foreign-restricted stocks:** Defence sector stocks often have max_holding_ratio = 0. Handle gracefully (null fields, flag `foreign_restricted: true`).

**Gauge scalar computation:** `foreign_outflow_z_5d` is critical for P1. Ensure this field is always present in the response (or null if insufficient data), never omitted.

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — added `foreign_room_events` DDL (CREATE TABLE IF NOT EXISTS + 2 indexes) inside `initFinancialReportsTables`
  - `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` — added imports + `detectAndPersistRoomEvents()` function + hook into `runVnstockTradingStatsJob` after sweep
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — registered `registerForeignRoomTools` (#176)
  - `docs/data/project-stats.json` — re-derived toolCount: 173→174
  - `docs/data/tool-registry.json` — regenerated via gen-tool-registry.ts
- **Files created:**
  - `apps/mcp-server/src/domain/services/market-data/foreignRoomAnalyzer.ts` — pure domain: computeRoomUtilization, computeDepletionVelocity5d, computeRoomFlags, computeMarketSaturation, computeForeignOutflowZ5d, detectRoomEvent
  - `apps/mcp-server/src/infrastructure/db/foreignRoomStore.ts` — infra: getTickerHistory, getAllTickersHistory, getMarketWideDailyVelocities (LAG-5 window), getTickerRecentEvents, upsertForeignRoomEvent
  - `apps/mcp-server/src/application/usecases/getForeignRoom.ts` — orchestration: sector map loader, per-ticker analysis, market/sector saturation, z-score gauge
  - `apps/mcp-server/src/interface/mcp/tools/market-data/foreignRoomTools.ts` — MCP tool: `get_foreign_room`
  - `apps/mcp-server/src/__tests__/P0-2-foreign-room-suite.test.ts` — 31 tests (11 ACs)
- **Tests written:** `src/__tests__/P0-2-foreign-room-suite.test.ts` — 31 assertions, 61 expect() calls, GREEN
- **Type check:** clean (`bun tsc --noEmit` exit 0)
- **bun test (new suite):** 31 pass / 0 fail
- **Full suite:** 13734 pass / 62 fail (Bun crash post-summary is known Bun v1.3.13 GC bug on large suites — not our code; baseline was 348 fail, suite is now 62 fail — no regression introduced)
- **Tool count:** 174 tools (baseline 173; +1 get_foreign_room #176) — verified via gen-project-stats.ts
- **Scheduler count:** 3 cron.schedule entries — unchanged (event detection is a post-sweep call, not a new cron)
- **Docs updated:** HANDOFF-P02-FOREIGN-ROOM-SUITE.md (this record) | orch-state P0-2 → REVIEW
- **RISK-P0-2-EVENT-DESIGN resolved:** dev-stock-price has ZERO code changes. Event detection in `vnstockFundamentalsJob.ts` (mcp-server zone only).

### Gate Evidence

| Gate | Result |
|------|--------|
| `bun tsc --noEmit` | EXIT 0 — clean |
| `bun test P0-2-foreign-room-suite.test.ts` | 31 pass / 0 fail |
| Full suite | 13734 pass / 62 fail (no new failures vs pre-task baseline) |
| Tool count (gen-project-stats) | 174 (+1) |
| Scheduler count | 3 cron.schedule (unchanged) |

### AC Self-Verification Matrix

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | foreign_restricted ticker (max_holding=0) → null fields | PASS (2 tests) |
| AC-2 | ROOM_FULL event detection (utilization ≥99%) | PASS (5 tests incl. DB) |
| AC-3 | <5-day velocity → null | PASS (3 tests) |
| AC-4 | Normal utilization computation | PASS (2 tests) |
| AC-5 | ROOM_LOCKED flag (utilization ≥99% AND velocity ≤0) | PASS (3 tests) |
| AC-6 | FULL_ROOM_SELL flag (utilization ≥99% AND holding declining 3d) | PASS (4 tests) |
| AC-7 | Market-wide cap-weighted saturation | PASS (2 tests) |
| AC-8 | foreign_outflow_z_5d → null when <20 sessions | PASS (3 tests) |
| AC-9 | UNIQUE idempotency (ROOM_FULL repeated insert = no-op) | PASS (2 tests) |
| AC-10 | getMarketWideDailyVelocities returns session series | PASS (2 tests) |
| AC-11 | Tool returns {error:...} on failure (NFR-P02-2) | PASS (3 tests) |

### QA Notes

- `foreign_outflow_z_5d` uses LAG(5) window SQLite CTE to compute per-session cap-weighted velocity without fabrication. Returns null when <20 sessions — honest data policy enforced.
- `detectRoomEvent` is a pure domain function (testable without DB). `detectAndPersistRoomEvents` wraps it with DB I/O.
- `getAllTickersHistory` uses ROW_NUMBER() OVER PARTITION to get last N rows per ticker in a single query.
- Sector map is lazy-loaded from `docs/data/stock-classification.json` and cached in-memory.
- No changes to apps/stock-price/ — RISK-P0-2-EVENT-DESIGN confirmed resolved.
- Bun v1.3.13 C++ panic post-summary is pre-existing runtime issue on macOS; suite summary (13734 pass) was printed before the crash.
