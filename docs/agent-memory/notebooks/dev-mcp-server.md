# dev-mcp-server -- Notebook

## 2026-06-30 — BREADTH-TIME-SERIES → REVIEW

**Sprint:** MARKET-INDICATOR-DEPTH-P0 (LAST mcp-server task, Wave-2 FINAL)
**Session:** d3292ca4-a9ab-471a-8d8c-d0c723546258
**Commit:** ee380fdf

**Part A — market_breadth_history + get_breadth_thrust (#179):**
- NEW: `domain/services/market-data/breadthCalculator.ts` — pure domain: EMA (first-value seed), ADL cumulative, RANA, McClellan Osc (null idx<38 i.e. <39 sessions), McClellan Summation, FloorCeiling (>15%/is_halt_day >50%), Zweig Thrust (>61.5% adv/(adv+dec) for 10 consecutive in 14-session window), breadth_z_score (null <21 sessions or std=0→0), history_quality enum (INSUFFICIENT/WARMUP/SUFFICIENT), 6-field GaugeReadyScalar (confidence: 1.0/0.5/null)
- NEW: `infrastructure/db/breadthHistoryStore.ts` — getAllBreadthHistory (ASC), getRecentBreadthHistory, getBreadthHistoryCount, getAccruingSince (MIN date), upsertBreadthRow (INSERT OR IGNORE)
- MOD: `infrastructure/db/schema-market-data.ts` — market_breadth_history DDL + idx_mbh_date DESC index
- NEW: `application/usecases/getBreadthThrust.ts` — {error:'no breadth history...'} on empty (NFR-BR-3); ADL capped 60s
- NEW: `scheduler/market-data/breadthHistoryPersisterJob.ts` — cron 37 8 * * 1-5; NFR-BR-1 LIVE_FETCH_SOURCE logged; skip if total=0 AND ceiling=0 AND floor=0 (synthetic guard); _isRunning concurrency guard; recordJobRun {rowsWritten: inserted?1:0}
- NEW: `interface/mcp/tools/market-data/breadthThrustTools.ts` — MCP tool `get_breadth_thrust` (#179)
- NEW: `__tests__/P0-BREADTH-TIME-SERIES.test.ts` — 45 tests (AC-1..AC-20), 0 fail
- MOD: `scheduler/cronConfig.ts` — breadthHistoryPersister key
- MOD: `scheduler/startScheduler.ts` — scheduleCron block for breadthHistoryPersister

**Part B — get_volatility_indicators (#180) proxy:**
- NEW: `interface/mcp/tools/market-data/volatilityIndicatorTools.ts` — proxies to Go TA :5003 POST /ta/volatility-indicators; honest-NULL: rv_60d_pct/drawdown_252d_pct null until Sprint-0 backfill; {error:'...'} on upstream failure (NFR-P01-1)
- MOD: `infrastructure/microservices/clients.ts` — computeVolatilityIndicators(), ComputeVolatilityRequest/Response/TickerAtrResult types

Zone health: tsc clean (EXIT 0), 45/0 new tests, toolCount=178 (+2), orch-state BREADTH-TIME-SERIES→REVIEW | HEALTHY

## 2026-06-30 — IND-P1-MCP-PROXY-INDICATORS

**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Session:** d3292ca4-a9ab-471a-8d8c-d0c723546258

Pure proxy wiring: 4 MCP tools (#181–#184) + 4 client functions in clients.ts.
Pattern: identical to volatilityIndicatorTools.ts — import client fn, register server.tool(), try/catch → {error:'...'}.
Honest-NULL discipline enforced: null fields pass through unchanged; room_exhaustion:null not coerced.

- NEW: `market-data/rocMomentumTools.ts` — get_roc_momentum → POST /ta/roc-momentum (TA svc:5003)
- NEW: `market-data/relativeStrengthTools.ts` — get_relative_strength → POST /ta/relative-strength (TA svc:5003)
- NEW: `market-data/52wProximityTools.ts` — get_52w_proximity → POST /ta/52w-proximity (TA svc:5003)
- NEW: `market-data/foreignAccumRankTools.ts` — get_foreign_accum_rank → POST /price/foreign-accum-rank (stock-price:5000)
- MOD: `infrastructure/microservices/clients.ts` — 4 new typed client fns + response interfaces
- MOD: `interface/mcp/tools/registry.ts` — 4 imports + 4 registrations (#181–#184)
- NEW: `src/__tests__/IND-P1-MCP-PROXY-INDICATORS.test.ts` — 22 tests (globalThis.fetch stub pattern)

Zone health: tsc clean (EXIT 0), 22/0 new tests, toolCount=182 (+4), orch-state IND-P1-MCP-PROXY-INDICATORS→REVIEW | HEALTHY

## 2026-06-30 — IND-P1-MCP-REST-GAUGES-ENDPOINT → REVIEW

**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Session:** d3292ca4-a9ab-471a-8d8c-d0c723546258

GET /api/indicator-gauges — aggregates 5 P0 indicator sources into IndicatorGaugesDto.
Pattern: `Promise.allSettled` isolation — one source failure degrades ONLY that section.
No MCP tools added (REST endpoint only) — toolCount=182 unchanged.

- NEW: `interface/mcp/routes/indicatorGaugesHandler.ts` — handleGetIndicatorGauges + aggregateIndicatorGauges + 5 pure section builders + IndicatorGaugesDto types + IndicatorGaugesDeps injectable deps
- MOD: `interface/mcp/server.ts` — import + dispatch block at GET /api/indicator-gauges
- NEW: `__tests__/IND-P1-MCP-REST-GAUGES-ENDPOINT.test.ts` — 35 tests: REG/GEN/200/ISO/NULL/PROJ/LIQ all GREEN
- MOD: `docs/architecture/microservice/mcp-server/testing.md` — REST Endpoint Handlers section added

Key design: IndicatorGaugesDeps injectable (5 fn overrides) — all 35 tests zero real HTTP/DB. foreign_room: ONLY .market scalars (never .tickers[]). liquidity source_tier endpoint-assigned: 2=live, 3=estimate. breadth=null on {error} shape.

Zone health: tsc 0 errors, 35/35 new tests GREEN, toolCount=182 unchanged, scheduler=3 unchanged | HEALTHY
