# dev-mcp-server -- Notebook

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

## 2026-06-30 — TASK-501-MOMENTUM-API-HANDLER → REVIEW

**Sprint:** BA-IND-P1-MOMENTUM-FRONTEND (dispatcher session e71c7736)
**Commit:** 034ad1d2

GET /api/momentum-indicators — aggregates 4 P1 momentum sources into MomentumIndicatorsDto.
Pattern mirrors indicatorGaugesHandler.ts exactly. NO db param (ARCH-RATIFY M3 — all sources remote HTTP).
source_tier=3 hardcoded per M3 decision; honest-NULL + null_reason per section; NEVER forwards .tickers[] arrays.

- NEW: `interface/mcp/routes/momentumIndicatorsHandler.ts` — handleGetMomentumIndicators + aggregateMomentumIndicators + 4 pure section builders (ROC/RS/52W/ForeignAccum) + MomentumIndicatorsDto types + MomentumIndicatorsDeps DI interface
- MOD: `interface/mcp/server.ts` — import + dispatch block at GET /api/momentum-indicators (no db arg)
- NEW: `__tests__/momentum-indicators.test.ts` — 37 tests: REG/GEN/200/ISO/ROC/RS/PROX/FA/TIER all GREEN

Key design: MomentumIndicatorsDeps injectable (4 fn overrides) — all 37 tests zero real HTTP.
No .tickers[] in any section output (NFR-6). null_reason synthesized per AC-4 spec.
10/10 ACs PASS. bun test 14070/0 (full suite).

Zone health: tsc 0 errors, 37/37 new tests GREEN, toolCount=182 unchanged, /health ok | HEALTHY

## 2026-06-30 — OHLCV-DEPTH-SUBTASK-B

**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Session:** e71c7736-a95a-4040-b741-1d48454354f6

Server-side depth-probe + re-queue + retry-cap in POST /api/ohlcv-backfill-done.

Key design decisions:
- LEFT JOIN watchlist→daily_ohlcv returns zero-bar codes without dynamic IN clause.
- retry_count column added to ohlcv_backfill_queue (guarded ALTER TABLE migration).
- Depth probe wrapped in inner try/catch — non-fatal; HTTP 200 always returned if UPDATE succeeds.
- Retry cap: query retry_count of last done=1 row (id DESC LIMIT 1) → if ≥5: BUG alert, no insert.
- Empty body (secondary poll): `bodyStr.trim()` falsy → barsPushedTotal=null, probe still runs.

Files changed:
- MOD: `infrastructure/db/schema-market-data.ts` — retry_count column + guarded migration
- MOD: `interface/mcp/server.ts` — sendTelegramBug import + extended handler (body parse + probe + re-queue + cap)
- NEW: `__tests__/ohlcv-backfill-done-subtask-b.test.ts` — 5 BT-* tests GREEN

Zone health: bun test 5 pass 0 fail (new), 9 pass 0 fail (existing 1360), 92 pass 0 fail (combined), tsc clean, toolCount=182 unchanged | HEALTHY

## 2026-06-30 — OHLCV-DEPTH-SUBTASK-C

**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Session:** e71c7736-a95a-4040-b741-1d48454354f6
**Commit:** cc491b4a

Observability-only threshold split in taOhlcvBackfillJob. TA gate at 35 UNCHANGED.

Key design decisions:
- MOMENTUM_MIN_BARS=252 placed in the Constants section alongside TA_MIN_ROWS=35.
- Depth check runs INSIDE the `if (cnt >= TA_MIN_ROWS && corruptCnt === 0)` branch — only tickers that passed the TA gate (covered path) can set the flag. Fetch-path tickers never inflate the counter.
- Log format: `[taOhlcvBackfill] depth-insufficient: <code> <N> bars` — exact spec text from §2.2-C.
- TaOhlcvBackfillResult extended with `momentumDepthInsufficient: number` (additive, backward-compatible).
- 6 SUBTASK-C tests added: bars>=252 no flag; 49 bars flag set; bars<35 fetch path (no flag); boundary at 35; boundary at 252; multi-ticker mix.

Files changed:
- MOD: `scheduler/market-data/taOhlcvBackfillJob.ts` — MOMENTUM_MIN_BARS const + result type + gate split + summary log + return
- MOD: `__tests__/1970-ta-ohlcv-backfill.test.ts` — 6 SUBTASK-C tests (16 total, all GREEN)

Zone health: tsc clean (EXIT 0), 16 pass 0 fail (1970 suite), 68 pass 0 fail (3 related files), toolCount=182 unchanged, scheduler count unchanged | HEALTHY

## 2026-06-30 — OHLCV-DEPTH-PROD-BACKFILL-GATE

**Sprint:** FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR / MARKET-INDICATOR-DEPTH-P0
**Session:** e71c7736-a95a-4040-b741-1d48454354f6

R-2 full-universe VPS backfill gate completed and persistence verified.

VPS script `/root/r2-backfill-gate.sh` (API_KEY VPS-only, NOT committed) processed 1,434 codes from `/tmp/ohlcv-codes.txt`. Duration: 59 min 16 sec. Result: ok=1377 skip=56 err=1 bars_pushed_total=729,826. Done signal ok=true.

Gate (b) POST-backfill: 731,272 rows, 1,437 distinct codes, median=613 bars, codes≥252=1,145 (79.7%). Watchlist: 36/41 ≥252. Five below-252 watchlist tickers: JSH=0/SIS=0/VDC=0 (VNDirect no data), BDI=1/DLC=41 (illiquid, not in codes file).

Gate (d) PERSISTENCE: docker restart at 17:51:53Z, healthy at 17:52:03Z. POST=PRE (rows=731,272, codes≥252=1,145). purgeStrandedSeedRows did NOT purge backfilled bars (real volume/price movement). PASS.

Gate (a): /api/price-history/VCB?days=730 → 253 candles ≥252. PASS.
Gate (c): All momentum null — WATCHLIST_TICKERS env not set in docker-compose for TA service. Pre-existing config gap, not data depth issue. Deferred to dev-team.
Gate (e): 1,396 non-watchlist codes with rows. PASS.

err=1: PLC push timeout (--max-time 60 occasionally insufficient for 750-bar payloads).

## 2026-06-30 — OHLCV-DEPTH-SUBTASK-D

**Sprint:** FIX-OHLCV-DEPTH-PERSIST-DAILY-OHLCV-2YR / MARKET-INDICATOR-DEPTH-P0
**Session:** e71c7736-a95a-4040-b741-1d48454354f6

Observability-only addition to `ohlcvStartupProbe.ts`. Added `SPARSE_THRESHOLD=8` and `DEPTH_FLOOR=252` exported constants. Extended `OhlcvStartupProbeResult` with `shallowTickers[]` and `shallowSent`. Three-bucket classification: sparse (<8, existing), shallow (8–251, new), healthy (≥252, new). ONE aggregated Telegram WORK call per startup for all shallow tickers. Sparse alert and backfill path unchanged. 5 existing TCs updated (row counts shifted to healthy ≥252 range); 5 new SUBTASK-D TCs added covering all required assertions including single-call invariant.

Files changed:
- MOD: `scheduler/market-data/ohlcvStartupProbe.ts` — SPARSE_THRESHOLD + DEPTH_FLOOR constants; shallowTickers classification; early-return guard; Phase 3+4 wrapped in sparse-only guard; shallow ONE-message alert; updated result type + all return points
- MOD: `__tests__/1352-ohlcv-startup-probe.test.ts` — TC-1/2/5 row counts updated to healthy range; 5 new SUBTASK-D TCs (10 total, all GREEN)

Zone health: tsc clean (EXIT 0), 10 pass 0 fail (1352 suite), 27 pass 0 fail (3 ohlcv files), toolCount=182 unchanged, scheduler count unchanged | HEALTHY
