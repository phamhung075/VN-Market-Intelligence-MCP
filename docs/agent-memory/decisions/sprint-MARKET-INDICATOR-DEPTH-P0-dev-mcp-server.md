# Decision Journal — Sprint MARKET-INDICATOR-DEPTH-P0 · dev-mcp-server

**Sprint goal:** P0 indicator depth suite — foreign-room utilization, news-sentiment z-score, insider-sentiment, breadth time-series (mcp-server zones).
**Agent:** dev-mcp-server
**Started:** 2026-06-30T00:00:00Z

---

### STEP P0-2 · dev-mcp-server · 2026-06-30T00:00:00Z

**task-id:** P0-2-FOREIGN-ROOM-SUITE

**what-done:**
- Created `foreignRoomAnalyzer.ts` (domain layer) — pure functions: computeRoomUtilization, computeDepletionVelocity5d, computeRoomFlags, computeMarketSaturation, computeForeignOutflowZ5d, detectRoomEvent.
- Created `foreignRoomStore.ts` (infrastructure) — getAllTickersHistory (ROW_NUMBER PARTITION), getMarketWideDailyVelocities (LAG-5 SQLite CTE), upsertForeignRoomEvent (idempotent INSERT OR IGNORE).
- Created `getForeignRoom.ts` (application) — orchestrates domain + store, lazy-loads sector map from stock-classification.json.
- Created `foreignRoomTools.ts` (interface) — registers `get_foreign_room` MCP tool (#176).
- Added `foreign_room_events` DDL to `schema-financial-reports.ts` (additive CREATE TABLE IF NOT EXISTS + 2 indexes).
- Extended `vnstockFundamentalsJob.ts` — `detectAndPersistRoomEvents()` function called post-sweep, non-blocking (WARN on failure, does not abort sweep result). Single-writer principle: dev-stock-price has ZERO changes.
- Registered tool in registry.ts; regenerated tool-registry.json and project-stats.json (toolCount 173→174).
- Written 31 tests covering 11 ACs (all GREEN).

**what-considered:**
- **Event detection location**: Spec says detect in vnstockFundamentalsJob after trading_stats upsert. Architect confirmed: event detection belongs in mcp-server (single-writer principle) not dev-stock-price. Implemented accordingly.
- **Market-wide velocity z-score (foreign_outflow_z_5d)**: Used SQLite LAG(5) window function CTE to compute per-session cap-weighted velocities without fabrication. Returns null when <20 sessions. Alternative (in-memory computation from raw rows) was considered but the SQLite approach is cleaner and more testable.
- **Sector map loading**: Lazy-loaded on first use with in-memory cache. Alternative (pass as parameter) would complicate the API unnecessarily.
- **depletion_velocity_5d computation**: Uses rows[0] (today) and rows[4] (5 days earlier) from DESC-sorted history. Edge: if foreign_room is NULL in either row, returns null velocity — honest null.

**why-decision:**
- DDD layering: domain (pure), infrastructure (DB access), application (orchestration), interface (MCP tool) — consistent with existing patterns in the codebase.
- Event detection post-sweep (not per-ticker inline) avoids coupling to syncVnstockData; easier to test independently via `detectAndPersistRoomEvents(db)`.
- Non-blocking event detection: failure in room event detection must not affect the sweep result (rowsWritten accuracy). Wrapped in try/catch with WARN log.
- UNIQUE(code, event_date, event_type) idempotency: re-running the job over same rows is a no-op — AC-9 verified.

**why-change:** No divergence from P0-2 spec. RISK-P0-2-EVENT-DESIGN resolved by keeping all writes in mcp-server zone (dev-stock-price = ZERO changes).

---

### STEP P0-4 · dev-mcp-server · 2026-06-30T00:00:00Z

**task-id:** P0-4-MARKET-SENTIMENT-INDEX

**what-done:**
- Created `marketSentimentCalculator.ts` (domain layer) — pure functions: computeDailyScores, computeZScores (with HARD CONSTRAINT: both null + INSUFFICIENT when <21 days), computeEMA5d (alpha=2/6, null <5d), computeDispersion5d, computeArticleSpike.
- Created `marketSentimentStore.ts` (infrastructure) — `getRagRowsForWindow`: read-only query on rag_analyses, no try/catch (errors propagate to tool handler — P0-2 pattern).
- Created `getMarketSentimentIndex.ts` (application) — orchestrates store + domain; computes 30d/5d sub-windows in-memory from the 90d fetch; exposes gauge-ready scalar `news_sentiment_z` = z_60d ?? z_90d.
- Created `marketSentimentTools.ts` (interface) — registers `get_market_sentiment_index` MCP tool (#177).
- Added covering index `idx_rag_sentiment_covering ON rag_analyses(created_at DESC, sentiment, confidence, impact_score)` to `schema-news.ts` (CREATE INDEX IF NOT EXISTS — idempotent) per NFR-P04-2.
- Registered tool in `registry.ts`; regenerated `tool-registry.json` and `project-stats.json` (toolCount 174→175).
- Written 36 tests covering all 12 ACs (36 pass, 0 fail).
- `bun tsc --noEmit` EXIT 0; full sentiment test batch (175 tests) 0 fail; P0-2+P0-4 combined 67 pass, 0 fail.

**what-considered:**
- **Store try/catch**: Initially added try/catch returning `[]` on error. Reverted to match P0-2 pattern (no try/catch) so errors propagate to the tool handler's catch block — makes AC-9 testable with a closed DB.
- **Z-score window**: "last 60 days" means the last 60 entries of the 90d daily series (not 60 calendar days from query). This gives z_60d based on the most recent 60 valid trading days.
- **Gauge-ready scalar**: `news_sentiment_z = z_60d ?? z_90d`. When INSUFFICIENT/EMPTY, both are null so news_sentiment_z = null.
- **today_daily_score**: Falls back to most recent available day if no data today (e.g., weekend/holiday). This makes the gauge meaningful even on non-trading days.
- **article_volume_30d_avg**: Uses ALL rows (not just valid-sentiment rows) to count articles per day, matching spec FR-5.
- **EMA seed**: First valid score seeds the EMA (standard practice). Null when <5 valid days.

**why-decision:**
- DDD layering: domain (pure), infrastructure (DB access), application (orchestration), interface (MCP tool) — consistent with P0-2 patterns.
- No try/catch in store: matches P0-2 (foreignRoomStore) pattern; tool handler's catch block is the correct error boundary.
- Population std (not sample std): the spec says "stdev of daily_score over last N days" — population std is appropriate since we use the full available window, not a sample.
- Covering index: idempotent (CREATE INDEX IF NOT EXISTS), same file (schema-news.ts), no migration needed.

**why-change:** No divergence from P0-4 spec. RISK-P0-4-Z-SCORE-HONESTY: resolved by enforcing <21d → both null + INSUFFICIENT (hard constraint). RISK-P0-4-COVERING-INDEX: resolved by adding idx_rag_sentiment_covering in schema-news.ts.

---

### STEP P0-5 · dev-mcp-server · 2026-06-30T00:00:00Z

**task-id:** P0-5-INSIDER-SENTIMENT

**what-done:**
- Created `insiderSentimentCalculator.ts` (domain layer) — pure functions: computeWindowNetBuySell (price=0 WARN + vol=0 exclude), computeNormalizedScore (clamped [-1,+1], honest null when marketCapBn unavailable), computeInsiderLabel (ACCUMULATION/DISTRIBUTION/MIXED/NEUTRAL), computeLargeDeals (threshold 10B VND configurable).
- Created `insiderSentimentStore.ts` (infrastructure) — getInsiderTxForSentiment (single 180d query; caller filters sub-windows), getLatestMarketCapBn, getMarketCapBnBulk (ROW_NUMBER window function), getWatchlistCodes. No try/catch (P0-2 pattern).
- Created `getInsiderSentiment.ts` (application) — orchestrates store + domain; per-ticker (code supplied) and market-wide (code omitted, sums across watchlist) modes; Gauge-Readiness 6-field contract on net_sentiment_score; normalization_basis='market_cap_proxy' MANDATORY in all responses.
- Created `insiderSentimentTools.ts` (interface) — registers `get_insider_sentiment` MCP tool (#178).
- Registered tool in registry.ts; regenerated tool-registry.json and project-stats.json (toolCount 175→176).
- Written 57 tests covering 14 ACs (57 pass, 0 fail). Gate 2a tsc EXIT 0. Full sibling suite (P0-2+P0-4+P0-5+insider-transactions = 141 tests) 0 fail.

**what-considered:**
- **180d window fetch strategy**: Option A (single 180d DB fetch + in-memory sub-window filter) vs Option B (3 separate DB queries for 30/90/180d). Chose A: same as P0-4 pattern (getRagRowsForWindow 90d + in-memory 30d/5d). Avoids 3 round-trips; rows180 is the superset.
- **market-wide normalization denominator**: For code=omitted, sum of market_cap_bn across all watchlist tickers with non-null cap (excluding nulls from sum). Alternative (error on any null cap) would be too strict; sum of available caps is the honest proxy.
- **computeWindowNetBuySell null logic**: Return null when distinctDates=0 (no valid buy/sell rows) — not 0.0. This is distinct from "zero activity" (where buy and sell perfectly cancel) which returns 0.0.
- **exactOptionalPropertyTypes**: code? field required `as string` cast + conditional spread for ExactOptionalPropertyTypes compliance.
- **NO schema changes**: insider_transactions is read-only (NFR-P05-1). No migration.

**why-decision:**
- DDD layering: domain (pure), infrastructure (DB access), application (orchestration), interface (MCP tool) — consistent with P0-2 + P0-4 patterns.
- No try/catch in store: matches P0-2 (foreignRoomStore) and P0-4 (marketSentimentStore) patterns; tool handler's catch block is the correct error boundary.
- normalization_basis='market_cap_proxy' ALWAYS present: QA hard gate NFR-P05-5 — never silently pass market_cap_bn proxy as true free-float. Field is hardcoded in the response struct, impossible to omit.
- In-memory sub-window filtering: rows180 ⊃ rows90 ⊃ rows30 (always true because from_date is monotonic); avoids 3 DB round-trips; consistent with P0-4 pattern.

**why-change:** No divergence from P0-5 spec. RISK-P0-5-NORMALIZATION-HONESTY resolved: normalization_basis field hardcoded in response type. RISK-P0-5-180D-DATA: data_window_days.d180 shows actual distinct dates in 180d window; null returned when 0 valid rows (not a minimum-day-count threshold).

---

### STEP BREADTH-TIME-SERIES · dev-mcp-server · 2026-06-30T00:00:00Z

**task-id:** BREADTH-TIME-SERIES

**what-done:**
- Created `domain/services/market-data/breadthCalculator.ts` (domain layer) — pure functions: computeEMA (first-value seed), computeADL (cumulative running sum), computeRANA (ratio-adjusted net advances), computeMcLellanOsc (EMA19−EMA39, null for index < 38 i.e., < 39 sessions), computeMcLellanSummation (running sum of osc), computeFloorCeiling (>15% stocks at limit flag, >50% is_halt_day), computeZweigThrust (>61.5% advances / (adv+dec) for ≥10 consecutive sessions in last 14-session window), computeBreadthZScore (z of latest osc vs all non-null osc values; null when totalSessions < 21 or fewer than 2 non-null; returns 0 when std=0), computeHistoryQuality (INSUFFICIENT <10, WARMUP 10-39, SUFFICIENT ≥40), toGaugeScalar (6-field Gauge contract: value/unit/asof/source_tier/confidence/null_reason; confidence: 1.0=SUFFICIENT, 0.5=WARMUP, null=INSUFFICIENT).
- Created `infrastructure/db/breadthHistoryStore.ts` — getAllBreadthHistory (all rows ASC), getRecentBreadthHistory (last N rows reversed to ASC), getBreadthHistoryCount (COUNT(*)), getAccruingSince (MIN session_date), upsertBreadthRow (INSERT OR IGNORE, returns changes>0).
- Created `infrastructure/db/schema-market-data.ts` DDL addition — `market_breadth_history` table (id/session_date UNIQUE/advancing/declining/unchanged/ceiling/floor/total/created_at) + idx_mbh_date DESC index. ON CONFLICT IGNORE idempotency.
- Created `application/usecases/getBreadthThrust.ts` — orchestrates store + domain; ADL history capped at 60 sessions; breadth_z_score exposed as Gauge scalar; returns {error:'no breadth history...'} when table empty (NFR-BR-3, never fabricates); history_quality enum in every response.
- Created `scheduler/market-data/breadthHistoryPersisterJob.ts` — JOB_NAME_BREADTH_PERSISTER='breadthHistoryPersisterJob'; LIVE_FETCH_SOURCE logged on every run (NFR-BR-1); skip when all counters zero (synthetic guard); module-level `_isRunning` concurrency guard; `runBreadthHistoryPersisterJobCron()` wraps with recordJobRun returning {rowsWritten: result.inserted ? 1 : 0}. Cron slot: 37 8 * * 1-5.
- Created `interface/mcp/tools/market-data/breadthThrustTools.ts` — registers `get_breadth_thrust` MCP tool (#179).
- Created `interface/mcp/tools/market-data/volatilityIndicatorTools.ts` — registers `get_volatility_indicators` MCP tool (#180); proxies to computeVolatilityIndicators() at Go TA :5003; honest-NULL preserved (rv_60d_pct/drawdown_252d_pct null until Sprint-0 backfill); {error:'...'} on upstream failure (NFR-P01-1).
- Extended `infrastructure/microservices/clients.ts` — added ComputeVolatilityRequest, TickerAtrResult, ComputeVolatilityResponse interfaces + computeVolatilityIndicators() function (POST /ta/volatility-indicators).
- Added `scheduler/cronConfig.ts` entry: breadthHistoryPersister cron key.
- Extended `scheduler/startScheduler.ts` — added scheduleCron block for CRONS.breadthHistoryPersister.
- Registered both tools in `interface/mcp/tools/registry.ts`; regenerated tool-registry.json and project-stats.json (toolCount 176→178, market-data group 18→20).
- Written 45 tests covering AC-1 through AC-20 (45 pass, 0 fail). `bun tsc --noEmit` EXIT 0.

**what-considered:**
- **Stale-handoff deviation (CRITICAL):** The task handoff doc cited `apps/technical-analysis/src/domain/services/BreadthService.ts` for McClellan/Zweig math. The task prompt explicitly flagged this as STALE — the TA zone is Go-primary hybrid; no new TS files belong there. ALL breadth math implemented as pure mcp-server domain service (`breadthCalculator.ts`). ZERO changes to apps/technical-analysis. This deviation is by design per the task's own stale-handoff override note.
- **EMA seeding strategy:** Standard first-value seed (not Wilder simple-mean seeding for first N periods). This matches the conventional McClellan convention used by most implementations.
- **McClellan null threshold:** Spec requires null until ≥39 sessions. Implemented as `if (i < 38) return null` (0-indexed: indices 0..37 = 38 items = <39 sessions). Verified via AC-5 (WARMUP 10-38 sessions) and AC-7 (both EMA arrays null at index 38 tested).
- **breadth_z_score null conditions:** Multiple gates: totalSessions < 21 (spec gate), or fewer than 2 non-null osc values (can't compute std), or std=0 → return 0 not null. All handled in computeBreadthZScore.
- **Part B scope (get_volatility_indicators):** Pure proxy to existing Go endpoint. No domain math added — the Go service already owns volatility computation. Only interface layer added.
- **cronJobCount discrepancy:** gen-project-stats counts `cron.schedule()` calls but startScheduler.ts uses `scheduleCron()` wrapper — known pre-existing mismatch per project-stats _cronJobCountNote comment. Not a new regression introduced here.

**why-decision:**
- DDD layering: domain (pure) → infrastructure (DB access) → application (orchestration) → interface (MCP tool) — consistent with P0-2, P0-4, P0-5 patterns throughout the sprint.
- All math self-contained in mcp-server domain: avoids cross-zone coupling to stale TA TS files; testable independently; no Go service dependency for breadth computations.
- ON CONFLICT IGNORE: idempotent by design — running the cron twice on the same market session is a no-op (AC-2 verified). Prevents duplicate rows without requiring a separate existence check.
- Forward-accruing only: No backfill loop avoids synthetic data risk. History builds naturally from first cron fire. history_quality enum communicates warmup state to callers honestly.
- ADL capped at 60 sessions: Prevents unbounded payload growth; ADL trend readable from 60-session window.
- Zweig 14-session window: matches the Zweig Breadth Thrust definition (10 consecutive sessions within a 14-session lookback window).

**why-change:** STALE-HANDOFF deviation: TA paths stale/out-of-zone; math self-contained in mcp-server. All other specs followed exactly. NFR-BR-1 synthetic guard: skip when total=0 AND ceiling=0 AND floor=0. NFR-BR-3: {error:'no breadth history...'} on empty table. toolCount 176→178 regenerated via gen-tool-registry.ts + gen-project-stats.ts (never baked).

### STEP dev-mcp-server-S5 · dev-mcp-server · 2026-06-30T06:00:00Z
**task-id:** IND-P1-MCP-REST-GAUGES-ENDPOINT
**what-done:** Built GET /api/indicator-gauges REST endpoint in indicatorGaugesHandler.ts + registered in server.ts + 35-test suite passing.
**what-considered:**
- Option A: Injectable deps (IndicatorGaugesDeps) for all 5 source functions — enables test isolation without real DB or HTTP calls.
- Option B: Stub/mock at the Bun runtime globalThis.fetch level (used for some MCP tool tests).
**why-decision:** Option A chosen — macroRegimeHandler pattern uses optional baseUrl param; extending that idiom to full function injection gives cleaner isolation for the 4 DB sources (sentiment, breadth, foreignRoom, breadth) and the macroFetch source. Section builders are pure functions; test fixtures are explicit and readable.
**why-change:** No plan deviation. foreign_room tickers[] exclusion + honest-NULL per section + source_tier endpoint-assigned for liquidity all implemented per spec. toolCount unchanged at 182 (REST endpoint, not MCP tool).

### STEP dev-mcp-server-S7 · dev-mcp-server · 2026-06-30T21:00:00Z
**task-id:** OHLCV-DEPTH-SUBTASK-E
**what-done:** Verified SSH access to Vinahost VPS (125.212.251.27); confirmed local `vps-scripts/fetch-ohlcv-backfill.sh` exists (6748B, executable); deployed it to VPS via scp + chmod +x; confirmed `-rwxr-xr-x 1 root root 6748 Jun 30 20:59 /root/fetch-ohlcv-backfill.sh` on VPS.
**what-considered:**
- only: No alternatives — SUBTASK-E is a pure ops gate (SSH verify + deploy if absent). Script absent on VPS so deploy path was the only path.
**why-decision:** Script present locally and absent on VPS; scp+chmod is the documented deploy pathway per SUBTASK-E spec.
**why-change:** No plan deviation. Local script was already authored (6748B); deployment was the sole action required.

---

### STEP dev-mcp-server-S6 · dev-mcp-server · 2026-06-30T06:30:00Z
**task-id:** TASK-501-MOMENTUM-API-HANDLER
**what-done:** Built GET /api/momentum-indicators REST endpoint (momentumIndicatorsHandler.ts) + server.ts registration + 37-test suite passing GREEN. No db param — all 4 sources remote HTTP via clients.ts. source_tier=3 all sections (ARCH-RATIFY M3).
**what-considered:**
- Option A: Mirror indicatorGaugesHandler.ts exactly (NO db param, 4-source Promise.allSettled, pure section builders, DI deps interface, honest-NULL per section).
- Option B: Thread db handle for parity with P0 handler signature. Architect explicitly flagged NO db — all 4 P1 sources are remote HTTP compute-on-read, not local SQLite reads.
**why-decision:** Option A strictly followed — architect flag takes precedence. All 4 client fns (computeROCMomentum/computeRelativeStrength/compute52WProximity/computeForeignAccumRank) already existed in clients.ts. Section builders NEVER forward .tickers[] arrays (NFR-6). null_reason synthesized per AC-4 exact strings.
**why-change:** No plan deviation. 10/10 ACs PASS. toolCount 182 unchanged (REST endpoint, not MCP tool). Commit 034ad1d2.

### STEP dev-mcp-server-S7 · dev-mcp-server · 2026-06-30T14:30:00Z
**task-id:** OHLCV-DEPTH-SUBTASK-A
**what-done:** Hardened `vps-scripts/fetch-ohlcv-backfill.sh`: switched API source from TCBS (HTTP 404 from VPS — backend gone) to VNDirect; added R-1 normalizeThousandVnd (×1000 when close<100, thousand-VND confirmed VCB=62.2); added R-3 flat seed filter; added VNINDEX guard; added R-2 /api/ohlcv-codes fallback; added bars_pushed_total done-signal. Re-deployed to VPS. Acceptance test: 750 bars fetched, 746 inserted for VCB, range 2023-06-29..2026-06-30.
**what-considered:**
- Keep TCBS URL (broken) and report BLOCKED → rejected: VNDirect confirmed accessible from VPS with correct q=code:TICKER syntax.
- Use VNDirect as primary (accessible, thousand-VND scale confirmed) → chosen.
- Threshold close<100 vs max(OHLC)<100 → brief mandates close<100; known edge case at 100-102 VND for historical VCB bars (CONTAM repair covers it).
**why-decision:** VNDirect works from VPS, returns per-ticker history with correct field mapping. TCBS endpoint completely inaccessible (x-backside-transport: FAIL FAIL from AWS NLB). Scale verified: VCB close=62.2 → 62,200 VND. All 5 required changes implemented. sha256 matched local↔VPS.
**why-change:** API source switch was unplanned but necessary — TCBS migrated/removed its bars-long-term endpoint. SUBTASK-B unblocked: bars_pushed_total=N now in done POST body.

### STEP dev-mcp-server-S8 · dev-mcp-server · 2026-06-30T15:00:00Z
**task-id:** OHLCV-DEPTH-SUBTASK-B
**what-done:** Extended `/api/ohlcv-backfill-done` handler: body parse (bars_pushed_total optional), depth probe via LEFT JOIN watchlist→daily_ohlcv (DEPTH_FLOOR=252), re-queue with retry_count+1 on shortfall, R-5 retry-storm cap (retry_count≥5 → sendTelegramBug, no re-queue). Schema migration: added retry_count column to ohlcv_backfill_queue (guarded ALTER TABLE). 5 BT-* tests written (body parse, empty body, re-queue, cap, success). Commit c8557899. tsc clean, 5 new tests pass, 9 existing 1360 tests pass, 92/92 combined.
**what-considered:**
- LEFT JOIN vs two separate queries: LEFT JOIN watchlist→daily_ohlcv returns codes with 0 bars without a separate codes fetch — cleaner and avoids placeholder injection.
- Retry cap: query most recent done=1 row's retry_count (id DESC LIMIT 1) → increment for re-queue. Cap check: if current done row retry_count ≥ 5 → BUG (not next insert).
- Depth probe advisory (non-fatal): wrap in inner try/catch; probe failure must never break the HTTP 200 response.
**why-decision:** LEFT JOIN is the correct SQL pattern for "find rows with 0 matches in a joined table". Retry_count from last done row is the simplest durable counter without a separate sessions table. Inner try/catch isolation prevents probe failures from masking the UPDATE (already done when probe fires).
**why-change:** No deviation from SUBTASK-B spec. R-5 cap implemented server-side as required.
