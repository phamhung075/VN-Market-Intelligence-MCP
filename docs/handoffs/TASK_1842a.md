# TASK 1842a — Architect Design Sprint: Portfolio Backtesting Engine (U-8)

> **Sprint:** 1842 | **Task ID:** 1842a | **Type:** SPRINT-GATE (Architect design)
> **Owner:** architect | **Created by:** po | **Date:** 2026-05-03
> **Upgrade Plan item:** U-8

---

## PO Context

All ingredients exist in the codebase to build a portfolio backtesting engine:
- Kinh Dich confidence scores (domain signals)
- Signal outcomes (recorded via `record_signal_outcome`)
- TA indicators (technical-analysis service)
- Full price history (stock-price service, SQLite)

No tool currently replays historical signals against actual prices to validate strategy performance. This is a meaningful gap: agents generate buy/sell/hold signals but we have no way to measure whether following those signals would have been profitable.

**Target MCP tool signature:**
```
run_backtest(strategy: string, start_date: string, end_date: string): BacktestReport
```

**Example call:**
```
run_backtest("kinh-dich-high-confidence", "2025-01-01", "2025-12-31")
```

---

## Architect Deliverables Required

Produce a design document at `docs/handoffs/TASK_1842a-design.md` covering all of the following:

### 1. Domain Interface Design

Define the domain interfaces for the backtesting engine following the repository pattern established in U-4 (Sprint 1838a/1838b). The new domain service MUST have zero direct `getDb()` calls.

Required interfaces:
- `IBacktestStrategyRepository` — fetch historical signals by strategy + date range
- `IPriceHistoryRepository` — fetch OHLCV data for tickers over a date range
- `IBacktestResultRepository` — persist backtest run results for audit trail

### 2. Data Availability Assessment

Before designing the implementation, verify what data actually exists:

a. **Price history**: Query `apps/stock-price/` — what is the actual date range of OHLCV data stored? How many tickers? Is the data dense enough for 2025 backtesting?

b. **Historical signals**: Where are buy/sell/hold signals stored? Are they timestamped with enough precision for replay? Check `record_signal_outcome` storage schema.

c. **Kinh Dich confidence scores**: Are historical scores stored with their generation date? Can they be replayed?

d. **Gap analysis**: If price or signal data is insufficient, what is the minimum data requirement before backtesting is meaningful?

### 3. Backtest Computation Design

Design the computation engine for a single backtest run:

- **Entry/exit rules**: Given a signal at date T, how is the trade entered? (open next day? same day close?)
- **Position sizing**: Equal-weight per ticker, or confidence-weighted?
- **Benchmark**: VN-Index (VNI) for comparison — how is benchmark data sourced?
- **Output metrics**:
  - Total portfolio return (%)
  - VN-Index benchmark return (%) over same period
  - Max drawdown (%)
  - Sharpe ratio (annualized, risk-free rate = 0 baseline)
  - Win rate (% of trades positive)
  - Trade count

### 4. Strategy Registry Design

`run_backtest` takes a `strategy: string`. Design the strategy registry:

- What are the initial supported strategies? (minimum: `"kinh-dich-high-confidence"`, `"ta-buy-signal"`, `"combined-high-confidence"`)
- How are strategies defined? (config file, enum, or pluggable function?)
- How does the engine resolve a strategy name to a signal filter?

### 5. Service Placement

Where does the backtesting domain service live?

Options:
a. New microservice `apps/backtesting-service/` (Python or TypeScript?)
b. Extension of existing `apps/mcp-server/src/domain/backtesting/`
c. Extension of `apps/technical-analysis/`

Recommendation with rationale. Consider: data locality (price data is in stock-price service), language fit (Python for numerical computation vs TypeScript consistency), deployment complexity.

### 6. MCP Tool Integration

Design the MCP tool layer:
- Tool name: `run_backtest`
- Input schema (Zod)
- Output schema (BacktestReport type)
- Expected latency — is this synchronous or should it be async with a job ID?
- Rate limiting / abuse prevention (backtesting is CPU-intensive)

### 7. Phased Implementation Plan

Break the implementation into phases suitable for SPRINT-M or SPRINT-S tasks:

- **Phase 1** (SPRINT-M): Data layer — repositories + data availability validation
- **Phase 2** (SPRINT-M): Computation engine — single-strategy backtest, 3 output metrics
- **Phase 3** (SPRINT-S): Full metrics + strategy registry + MCP tool wiring

### 8. Risk Assessment

- What breaks if price history is sparse or missing dates?
- Can backtesting corrupt any live data? (Must be read-only)
- Test strategy: can backtesting logic be unit-tested with fixture price data?

---

## Acceptance Criteria for This Design Task (1842a)

- [x] AC-1: Design document created at `docs/architecture/1842a-backtesting-engine.md`
- [x] AC-2: Domain interfaces defined for all 3 repositories (signals, prices, results)
- [x] AC-3: Data availability verified — actual date range + ticker count confirmed from live DB
- [x] AC-4: Service placement decision made with rationale
- [x] AC-5: MCP tool schema (input + output types) defined in TypeScript
- [x] AC-6: Phased implementation plan with 3 phases, each sized as SPRINT-S or SPRINT-M
- [x] AC-7: Risk assessment covers data sparsity, read-only guarantee, and test strategy
- [x] AC-8: No implementation written — design document only

---

## [Architect] Design Record

**Date:** 2026-05-03
**Design document:** `docs/architecture/1842a-backtesting-engine.md`

### Critical Finding: Data Blocker

Live DB query results (data/market.db):
- `daily_ohlcv`: 219 rows, 111 tickers, **only 2026-04-23 to 2026-04-24** — no 2025 history
- `kinhdich_readings`: 23,285 rows, 49 tickers, 2026-04-05 to 2026-04-28 (23 days)
- `market_prices_history`: empty (pruned rolling window)
- VNI OHLCV: not stored

The PO example call `run_backtest("kinh-dich-high-confidence", "2025-01-01", "2025-12-31")` cannot be executed until a historical OHLCV backfill is run. Phase 1 must address this before any engine work.

Second finding: Kinh Dich signals are stored in Vietnamese (`MUA`, `BAN`, `GIU`) not English (`BUY`, `SELL`, `HOLD`). A normalizer adapter is required.

### Key Decisions

1. **Service placement:** New domain module inside `apps/mcp-server/` (not a new microservice). Rationale: data locality (same SQLite file), TypeScript consistency, zero new containers.
2. **Entry rule:** T+1 open (avoids look-ahead bias).
3. **Phase 1 is a data sprint** — OHLCV backfill via VNDirect API is the critical path blocker.
4. **Tool #120** reserved for `run_backtest` in `registry.ts`.
5. **4 implementation tasks:** 1842b (SPRINT-M) + 1842c (SPRINT-S) + 1842d (SPRINT-M) + 1842e (SPRINT-S).

### Implementation Sprint Breakdown

| Task | Size | Deliverable |
|------|------|-------------|
| 1842b | SPRINT-M | OHLCV backfill + 3 repo interfaces + SQLite impls |
| 1842c | SPRINT-S | Nightly backfill cron + VNI backfill |
| 1842d | SPRINT-M | Computation engine + MCP tool #120 |
| 1842e | SPRINT-S | Sharpe + benchmark + confidence-weighted allocation |

---

## Constraints

- Zero `getDb()` calls in new domain code (follow U-4 pattern from 1838a)
- Read-only — backtest must not mutate any live signal, position, or price data
- Must integrate with existing MCP tool registry (tool #120 reserved for `run_backtest`)
- Design must be approvable by PO before implementation sprint opens

---

## Related Files

- `docs/UPGRADE_PLAN.md` — U-8 definition
- `docs/handoffs/TASK_1838a.md` — U-4 Architect design (repository pattern reference)
- `apps/mcp-server/src/domain/repositories/` — existing repository interfaces to follow
- `apps/stock-price/` — price history data source
- `apps/mcp-server/src/tools/` — MCP tool registration pattern

---

## Return Format

When design is complete, return:

```
DONE: [design doc path + key decisions]
NEXT: po | review design and open implementation sprint
HANDOFF: docs/handoffs/TASK_1842a-design.md
PIPELINE: continue
PIPELINE_STATE_WRITE: written — status=in_progress, nextAgent=po
```
