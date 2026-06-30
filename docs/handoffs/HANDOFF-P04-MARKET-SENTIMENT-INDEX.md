# Handoff — P0-4-MARKET-SENTIMENT-INDEX

**Task ID:** P0-4-MARKET-SENTIMENT-INDEX  
**Sprint:** MARKET-INDICATOR-DEPTH-P0  
**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/`  
**Size:** M (~2h)  
**Status:** READY  
**Depends:** []  
**Blocks:** []

---

## Overview

Compute market-wide news sentiment aggregates from the RAG analyses store. Includes confidence-weighted daily sentiment scores, z-score normalization against historical baselines, EMA smoothing, bull/bear dispersion, and article volume spike detection. The tool is a core sentiment leg of P1's Fear & Greed gauge.

**Honest null pattern:** When fewer than 21 days of data exist, z-score fields return null with `history_quality: 'INSUFFICIENT'`. This respects the no-fake-data gate (roadmap §4 reject: no back-filled z-scores).

---

## Functional Requirements

### FR-1: Confidence-Weighted Daily Sentiment Score

- **Inputs:** `rag_analyses` rows where `sentiment IN ('bullish','bearish','neutral')` and `confidence IS NOT NULL` and `confidence > 0`
- **Computation per day:**
  - Assign sentiment_value: bullish=+1, bearish=−1, neutral=0
  - `daily_score_d = sum(sentiment_value × confidence × impact_score) / sum(confidence)` where impact_score defaults to 1.0 when NULL
  - Group by DATE(created_at), one score per day
- **Output:** `daily_score` time series (REAL, range roughly -1 to +1) for last 90 days

### FR-2: Z-Score vs 60/90-Day Baseline

- **Inputs:** `daily_score` series from FR-1
- **Computation:**
  - `baseline_mean_60d` = mean of daily_score over last 60 days
  - `baseline_std_60d` = stdev of daily_score over last 60 days
  - `sentiment_z_60d` = (today_daily_score − baseline_mean_60d) / baseline_std_60d
  - Same for 90d baseline
- **HARD CONSTRAINT (no-fake-data):** Do NOT back-fill or extrapolate to claim a z-score distribution if we have fewer than 21 actual days of data. When days < 21, set both z-scores to null and set `history_quality: 'INSUFFICIENT'`. The z-score IS the fabricated distribution when history is thin.
- **Outputs:** `sentiment_z_60d` (REAL, nullable), `sentiment_z_90d` (REAL, nullable), `history_quality: 'EMPTY'|'INSUFFICIENT'|'SUFFICIENT'`
- **Gauge-readiness:** Field `news_sentiment_z` = `sentiment_z_60d` (preferred) or `sentiment_z_90d` when 60d unavailable. This is the P1 gauge field.

### FR-3: 5-Day EMA of Sentiment

- **Computation:** EMA(5) over the daily_score time series. alpha = 2/(5+1) = 0.333.
- **Output:** `sentiment_ema_5d` (REAL, nullable when <5d)

### FR-4: Bull/Bear Dispersion

- **Inputs:** Last 5 days of rag_analyses rows
- **Computation:**
  - `bull_ratio_5d` = count(bullish) / total_articles_5d
  - `bear_ratio_5d` = count(bearish) / total_articles_5d
  - `neutral_ratio_5d` = count(neutral) / total_articles_5d
- **Output:** `bull_ratio_5d`, `bear_ratio_5d`, `neutral_ratio_5d` (all REAL 0–1)

### FR-5: Article-Volume Spike Flag

- **Inputs:** Daily article count series (count(rag_analyses rows) per day over 30d)
- **Computation:**
  - `article_volume_30d_avg` = mean articles/day over 30d
  - `today_article_count` = count(rag_analyses) for today
  - `article_spike: boolean` = today_article_count > 2.0 × article_volume_30d_avg
- **Output:** `article_spike: boolean`, `today_article_count: int`, `article_volume_30d_avg: float`

---

## Non-Functional Requirements

- **NFR-P04-1:** Tool is READ-ONLY query on `rag_analyses`. No writes. No schema migration required.
- **NFR-P04-2:** The 90-day window queries are indexed by `idx_rag_created`. MUST add a covering index for the GROUP BY query: `idx_rag_sentiment_covering ON rag_analyses(created_at DESC, sentiment, confidence, impact_score)`. If the query exceeds 1s, covering index is required.
- **NFR-P04-3:** `{error: '...'}` on failure; never expose raw SQL error.
- **NFR-P04-4:** Routes via gateway; `toolCount` updated in `docs/data/project-stats.json` (re-derived, not baked).
- **NFR-P04-5:** Tool respects the language boundary — response field names and enum values are in English. Display-layer Vietnamese is the consumer's job.

---

## Edge Cases

- **`rag_analyses` is empty** (fresh deployment): all outputs null + `history_quality: 'EMPTY'`.
- **All rows for a given day have `confidence = 0`:** divide-by-zero guard — daily_score = null for that day (not 0).
- **Unexpected sentiment value** (not bullish/bearish/neutral): exclude from computation; log at WARN. Do not crash.
- **Weekend/holiday:** no rag_analyses rows for Saturday/Sunday in VN market context. Skip in daily series rather than treating as score=0.

---

## Acceptance Criteria

- [ ] Confidence-weighted daily sentiment score computed correctly (bullish=+1, bearish=-1, neutral=0)
- [ ] Z-score vs 60d and 90d baselines computed (null when <21d per hard constraint)
- [ ] `history_quality` enum field always present (EMPTY, INSUFFICIENT, SUFFICIENT)
- [ ] EMA(5) computed over daily_score time series (null when <5d)
- [ ] Bull/bear/neutral ratios computed from last 5 days (0–1 range)
- [ ] Article volume spike detected (>2× 30d average)
- [ ] `news_sentiment_z` gauge-ready scalar included (z_60d or z_90d; null when insufficient)
- [ ] Covering index `idx_rag_sentiment_covering` created (CREATE INDEX IF NOT EXISTS)
- [ ] Tool returns `{error: '...'}` on failure
- [ ] Divide-by-zero guard: confidence=0 day → daily_score=null
- [ ] Unexpected sentiment values excluded + logged at WARN (not crash)
- [ ] Tests: empty rag_analyses → history_quality=EMPTY; <21d → INSUFFICIENT; ≥21d → SUFFICIENT; divide-by-zero; dispersion ratios sum to 1.0
- [ ] Existing tests still pass: `pnpm check` and `pnpm test` on mcp-server module

---

## Verified Paths (from Architect)

- **Source table:** `apps/mcp-server/src/infrastructure/db/schema-news.ts` — `rag_analyses` DDL (L20–L46): id, created_at, level, sentiment TEXT, confidence REAL, impact_score REAL. Existing indexes: `idx_rag_created ON rag_analyses(created_at)` (L43), `idx_rag_level`, `idx_rag_sentiment`.
- **Tools folder:** `apps/mcp-server/src/interface/mcp/tools/news-analysis/` — existing folder with news tools (pattern reference).

---

## New Files to Create

- `apps/mcp-server/src/domain/services/news-analysis/marketSentimentCalculator.ts` — domain logic (daily scores, z-scores, EMA, dispersion)
- `apps/mcp-server/src/application/usecases/getMarketSentimentIndex.ts` — orchestration layer
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/marketSentimentTools.ts` — MCP tool wrapper for `get_market_sentiment_index`

---

## Modified Files

- `apps/mcp-server/src/infrastructure/db/schema-news.ts` — add covering index `idx_rag_sentiment_covering`
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — register `get_market_sentiment_index` tool
- `docs/data/project-stats.json` — update `toolCount` (re-derived, not baked)

---

## Gauge-Readiness Contract (P1 dependency)

**Gauge-ready scalar:** `news_sentiment_z` (float)
- Null condition: fewer than 21 days of real data (hard constraint)
- Usage: P1 Fear & Greed gauge's sentiment leg
- **BLOCKING condition:** `history_quality` field MUST be present in every response so every consumer self-gates on baseline adequacy.

---

## Risk Flags (from Architect)

- **RISK-P0-4-COVERING-INDEX [MEDIUM]:** Without `idx_rag_sentiment_covering`, the 90d GROUP BY query on rag_analyses will full-table scan. Must be added in the same task. The index creation is idempotent (CREATE INDEX IF NOT EXISTS).
- **RISK-P0-4-Z-SCORE-HONESTY [HIGH]:** The hard constraint (never fabricate z-score when <21 days) is BLOCKING at QA. Shipping with `sentiment_z_60d: null, sentiment_z_90d: null, history_quality: 'INSUFFICIENT'` is correct and preferred to delay or interpolation. No compromise on this gate.

---

## Done Criteria

- Code review approved (no-fake-data constraint verified, divide-by-zero tested, covering index present)
- `pnpm check` and `pnpm test` pass on mcp-server module
- Covering index verified: `CREATE INDEX IF NOT EXISTS idx_rag_sentiment_covering ...`
- Tool tested via gateway (z_60d null when <21d, history_quality present)
- Commit message: `feat(P0-4-MARKET-SENTIMENT): confidence-weighted daily score, z-score (60/90d), EMA(5), bull/bear dispersion, article spike — honest null <21d`

---

## Developer Notes

**No-fake-data gate:** The hard constraint is non-negotiable: if rag_analyses has fewer than 21 days of real data, z-score fields MUST be null. This prevents a publishing or gauge issue down the line. Ship the tool early; z_60d populates automatically as rag_analyses accrues natural history.

**Covering index:** The query scans 90 days of rag_analyses rows grouped by date. A covering index on `(created_at DESC, sentiment, confidence, impact_score)` makes this an index-only read, not a full-table scan. This is required by NFR-P04-2.

**Gauge-ready field:** `news_sentiment_z` is the single scalar the P1 gauge reads. Ensure this field is always present (or null when insufficient), never omitted from the response.

**Language boundary:** Tool response uses English field names and enum values (EMPTY, INSUFFICIENT, SUFFICIENT). Display-layer Vietnamese is the consumer's job (frontend, MARKET channel, etc.).
