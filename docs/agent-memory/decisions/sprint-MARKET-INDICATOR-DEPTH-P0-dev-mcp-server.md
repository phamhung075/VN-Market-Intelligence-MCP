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
