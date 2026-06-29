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
