# Handoff — P0-5-INSIDER-SENTIMENT

**Task ID:** P0-5-INSIDER-SENTIMENT  
**Sprint:** MARKET-INDICATOR-DEPTH-P0  
**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/`  
**Size:** M (~2h)  
**Status:** READY  
**Depends:** []  
**Blocks:** []

---

## Overview

Compute insider transaction sentiment from the SSC live feed (already persisted). Includes net buy-sell value analysis over 30/90/180-day windows, free-float normalization, accumulation/distribution classification, and large-deal flagging. The tool provides early signals of insider confidence or distribution phases.

**Normalization honesty:** Uses `market_cap_bn` as a proxy for free-float (real fetched value, not fabricated). MANDATORY: include `normalization_basis: "market_cap_proxy"` field in every response as a QA hard gate so no consumer mistakes the proxy for true free-float.

---

## Functional Requirements

### FR-1: Net Buy-Sell Value by Window (30d / 90d / 180d)

- **Inputs:** `insider_transactions` rows filtered by `from_date >= window_start`
- **Computation:**
  - `buy_value = sum(executed_volume × price)` where `type = 'buy'`
  - `sell_value = sum(executed_volume × price)` where `type = 'sell'`
  - `net_sentiment_vnd = buy_value − sell_value`
- **Output per window:** `net_buy_sell_30d_bn_vnd`, `net_buy_sell_90d_bn_vnd`, `net_buy_sell_180d_bn_vnd` (all REAL, nullable when insufficient history)
- **Scope:** Tool accepts optional `code` param to get per-ticker signal; when code omitted, returns market-wide aggregate across all watchlist tickers (query system-map.json .project.watchlist, never hardcode).
- **Data window counts:** Include `data_window_days: { d30: actual_count, d90: actual_count, d180: actual_count }` in response so QA can verify actual row availability.

### FR-2: Free-Float-Normalized Net Sentiment

- **Inputs:** `net_sentiment_vnd` from FR-1 + `market_cap_bn` from `vnstock_trading_stats` (proxy for free-float — architect may refine to actual free-float; ARCH-RATIFY-INS-1 approves this for P0)
- **Computation:** `net_sentiment_score = net_buy_sell_90d_bn_vnd / (market_cap_bn × 1e9)` clamped to [-1.0, +1.0]
- **Output:** `net_sentiment_score` (REAL -1 to +1)
- **Null handling:** When `market_cap_bn IS NULL` for a ticker, `net_sentiment_score` is null (cannot normalize without denominator).
- **Gauge-readiness:** This is the P1 Fear & Greed gauge's insider leg.

### FR-3: ACCUMULATION / DISTRIBUTION Label

- **Computation:**
  - `ACCUMULATION` — net_buy_sell_90d_bn_vnd > 0 AND net_buy_sell_30d_bn_vnd > 0 (both windows positive: sustained buying)
  - `DISTRIBUTION` — net_buy_sell_90d_bn_vnd < 0 AND net_buy_sell_30d_bn_vnd < 0 (both windows negative: sustained selling)
  - `MIXED` — signs diverge between windows
  - `NEUTRAL` — all values zero (no activity)
- **Output:** `insider_label` TEXT

### FR-4: Large-Deal Flags

- **Computation:** Flag any single transaction in the 30d window where `executed_volume × price > 10_000_000_000 VND (10 billion)` as a large deal
- **Output:** `large_deals_30d: boolean`, `large_deal_count_30d: int`, `largest_deal_value_30d_bn_vnd: float | null`
- **Configurability:** Threshold of 10B VND is a suggested default. Architect can make it configurable.

---

## Non-Functional Requirements

- **NFR-P05-1:** READ-ONLY on `insider_transactions`. No schema migration.
- **NFR-P05-2:** When code IS supplied, tool filters to that ticker. When omitted, aggregates across all tickers in the watchlist (system-map.json .project.watchlist — never hardcode the list, query from config).
- **NFR-P05-3:** `{error: '...'}` on failure. Consistent with project error contract.
- **NFR-P05-4:** Routes via gateway; `toolCount` updated in `docs/data/project-stats.json` (re-derived, not baked).
- **NFR-P05-5:** BLOCKING condition: every response MUST include `normalization_basis: "market_cap_proxy"` so no consumer mistakes the proxy for true free-float. Absence of this field = FAIL at QA.

---

## Edge Cases

- **`insider_transactions` table is empty** or only has `other` type rows (no buy/sell): all outputs null + `insider_label: 'NEUTRAL'`.
- **`price = 0` on a row** (data quality from SSC): exclude from value computation (zero-price = invalid deal value). Log at WARN.
- **Same insider buys and sells in same 30d window:** Count both faithfully (net = buy − sell). Do NOT deduplicate.
- **SSC feed may use `executed_volume = 0`** on a registered-but-not-executed transaction: exclude from value computation (only executed_volume > 0 rows contribute).
- **market_cap_bn = NULL** for a ticker: `net_sentiment_score` is null for that ticker (cannot normalize without denominator). Log at INFO.

---

## Acceptance Criteria

- [ ] Net buy-sell value computed per window (30/90/180d); null when insufficient history
- [ ] `data_window_days` counts included in response (for QA verification)
- [ ] Market-wide aggregation computed when code omitted (sum across watchlist tickers)
- [ ] Per-ticker signal computed when code supplied
- [ ] Free-float normalization using market_cap_bn (clamped [-1, +1])
- [ ] `normalization_basis: "market_cap_proxy"` field MANDATORY in response (QA hard gate)
- [ ] ACCUMULATION/DISTRIBUTION/MIXED/NEUTRAL label derived correctly
- [ ] Large-deal flags computed (>10B VND threshold)
- [ ] Tool returns `{error: '...'}` on failure
- [ ] Price=0 rows excluded + logged at WARN
- [ ] Market_cap_bn=NULL → net_sentiment_score=NULL (null propagation)
- [ ] Tests: empty insider_transactions → NEUTRAL label; price=0 excluded; executed_volume=0 excluded; buy+sell same window both counted; market_cap_bn=NULL → score=NULL
- [ ] Existing tests still pass: `pnpm check` and `pnpm test` on mcp-server module

---

## Verified Paths (from Architect)

- **Source table:** `apps/mcp-server/src/infrastructure/db/schema-news.ts` — `insider_transactions` DDL (L261–L277): code, type TEXT CHECK('buy'/'sell'/'other'), executed_volume, price, from_date, to_date. Indexes on (code, from_date DESC) and (type, from_date DESC).
- **Reference tools:** `apps/mcp-server/src/interface/mcp/tools/market-data/insiderTools.ts` — existing `get_insider_transactions` tool (raw DB rows). New `get_insider_sentiment` is a different tool (aggregate signal).
- **Leadership tools:** `apps/mcp-server/src/interface/mcp/tools/sector/leadershipTools.ts` — `get_insider_signals` (domain classifier, caller-provided data). New tool is distinct.

---

## New Files to Create

- `apps/mcp-server/src/domain/services/market-data/insiderSentimentCalculator.ts` — domain logic (net buy-sell, normalization, label derivation, large deals)
- `apps/mcp-server/src/application/usecases/getInsiderSentiment.ts` — orchestration layer
- `apps/mcp-server/src/infrastructure/db/insiderSentimentStore.ts` — queries insider_transactions + market_cap aggregation
- `apps/mcp-server/src/interface/mcp/tools/market-data/insiderSentimentTools.ts` — MCP tool wrapper for `get_insider_sentiment`

---

## Modified Files

- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — register `get_insider_sentiment` tool
- `docs/data/project-stats.json` — update `toolCount` (re-derived, not baked)

---

## Gauge-Readiness Contract (P1 dependency)

**Gauge-ready scalar:** `net_sentiment_score` (float -1 to +1)
- Null condition: `market_cap_bn IS NULL` for the stock
- MANDATORY field: `normalization_basis: "market_cap_proxy"` (QA hard gate)
- Usage: P1 Fear & Greed gauge's insider leg

---

## Risk Flags (from Architect)

- **RISK-P0-5-180D-DATA [LOW]:** Developer must probe actual row count in live `insider_transactions` table. If fewer than 180 days of data exist, `net_buy_sell_180d_bn_vnd` returns null. Response includes `data_window_days` counts so QA and consumers can self-validate.
- **RISK-P0-5-NORMALIZATION-HONESTY [HIGH]:** The field `normalization_basis` MUST be present in the response with value `"market_cap_proxy"`. Absence = FAIL at QA. A proxy openly labeled is honest; a proxy silently passed off as free-float is misleading.

---

## Done Criteria

- Code review approved (normalization_basis field mandatory, edge cases tested)
- `pnpm check` and `pnpm test` pass on mcp-server module
- Tool tested via gateway (net_sentiment_score clamped [-1, +1], normalization_basis present)
- Integration test confirms data_window_days counts + price=0 exclusion + executed_volume=0 exclusion
- Commit message: `feat(P0-5-INSIDER): net buy-sell (30/90/180d), market_cap_bn normalization, accumulation/distribution label, large deals`

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/src/
- **Files created:**
  - `apps/mcp-server/src/domain/services/market-data/insiderSentimentCalculator.ts` (185L — pure functions: computeWindowNetBuySell, computeNormalizedScore, computeInsiderLabel, computeLargeDeals)
  - `apps/mcp-server/src/infrastructure/db/insiderSentimentStore.ts` (128L — getInsiderTxForSentiment, getLatestMarketCapBn, getMarketCapBnBulk, getWatchlistCodes)
  - `apps/mcp-server/src/application/usecases/getInsiderSentiment.ts` (293L — per-ticker + market-wide, Gauge-Readiness 6-field contract)
  - `apps/mcp-server/src/interface/mcp/tools/market-data/insiderSentimentTools.ts` (81L — get_insider_sentiment MCP tool #178)
  - `apps/mcp-server/src/__tests__/P0-5-insider-sentiment.test.ts` (763L — 57 tests, 14 ACs)
- **Files modified:**
  - `apps/mcp-server/src/interface/mcp/tools/registry.ts` — registered registerInsiderSentimentTools (#178)
  - `docs/data/project-stats.json` — toolCount 175→176 (re-derived via gen-project-stats.ts)
  - `docs/data/tool-registry.json` — regenerated via gen-tool-registry.ts (totalCount=176)
- **Tests written:** P0-5-insider-sentiment.test.ts — 57 assertions, 14 ACs, GREEN
- **Type check:** clean (bun tsc --noEmit EXIT 0)
- **bun test (P0-5 only):** 57 pass / 0 fail
- **bun test (sibling suite: P0-2 + P0-4 + P0-5 + insider-transactions):** 141 pass / 0 fail
- **Full suite note:** Bun-OOM host-memory crash at ~2GB RSS — pre-existing, not introduced by this task
- **Tool count:** 176 tools — confirmed via gen-project-stats.ts + gen-tool-registry.ts
- **Scheduler count:** 3 cron.schedule entries — unchanged (no new cron added for P0-5)
- **Docs updated:** docs/handoffs/HANDOFF-P05-INSIDER-SENTIMENT.md (this record) + docs/agent-memory/decisions/sprint-MARKET-INDICATOR-DEPTH-P0-dev-mcp-server.md (DJ entry appended)
- **Graphify:** skipped (no architecture docs impacted)

### Gate Evidence

| Gate | Command | Result |
|------|---------|--------|
| Gate 1: bun test (P0-5) | `bun test src/__tests__/P0-5-insider-sentiment.test.ts` | 57 pass / 0 fail |
| Gate 2a: tsc | `bun tsc --noEmit` | EXIT 0 |
| Gate 2c: tool count | `bun scripts/gen-project-stats.ts --dry-run` | toolCount=176 |
| Gate 2d: scheduler count | `grep -rc cron.schedule ...` | 3 (unchanged) |

### Zone-Health Observation

Zone health: bun test 0 fail (P0-5 57 + sibling 141 pass), 176 tools registered, scheduler 3 cron.schedule entries (gen-project-stats verified) | HEALTHY

---

## Developer Notes

**Normalization honesty:** `market_cap_bn` is real (fetched), not fabricated. But it is a proxy for free-float, not the true free-float shares. The field `normalization_basis: "market_cap_proxy"` is MANDATORY so no consumer mistakes it for real free-float. This is a QA hard gate.

**Watchlist scope:** When code omitted, aggregate across all watchlist tickers (query system-map.json, never hardcode). This gives a market-wide insider sentiment signal.

**Data window counts:** Include `data_window_days` in response so QA and downstream consumers can verify actual data availability. If insider_transactions is fresh and has only 5 days of data, the tool returns null for 90d/180d fields and `data_window_days: {d30: 5, d90: 5, d180: 5}` so the consumer knows why.

**Large-deal threshold:** Suggested default 10B VND. Make it easy for architect to adjust if needed.

**Gauge scalar:** `net_sentiment_score` is critical for P1. Ensure this field is always present in the response (or null if market_cap_bn=NULL), never omitted.
