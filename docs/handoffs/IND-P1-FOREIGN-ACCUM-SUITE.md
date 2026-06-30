# Dev Task — IND-P1 Foreign-Accumulation Momentum Rank

**Task ID:** IND-P1-FOREIGN-ACCUM-RANK (1 backlog placeholder)
**Sprint:** MARKET-INDICATOR-DEPTH-P0
**Tier:** P1
**Zone:** apps/stock-price (Go)
**Dev Agent:** dev-stock-price
**Created:** 2026-06-30T03:00:00Z
**PM Decomposition of:** BA-IND-P1-MOMENTUM-RS

---

## Scope

Implement the **single foreign-accumulation indicator tool:**

**Tool: `get_foreign_accum_rank`** (Backlog ID: IND-P1-FOREIGN-ACCUM-RANK)

Reads from `daily_ohlcv` (foreign flow columns) and `foreign_room_events` (room exhaustion flag). Owned by stock-price service (foreign flow data plane).

---

## Critical Corrections (Carry Verbatim into Code)

**RISK-1 [HIGH] — FA-DATA-SOURCE-MISMATCH:** 
Foreign flow data source is **`daily_ohlcv`** (columns `foreign_buy_vol`, `foreign_sell_vol`, `foreign_net_vol`, `volume`), **NOT `vnstock_trading_stats`** (which has no per-day buy/sell columns). ADTV unit = **shares** (`mean(volume)` 20d); response MUST include `adtv_unit: "shares"`.

**RISK-2 [HIGH] — FA-EVENT-TYPE-CORRECTION:**
`foreign_room_events.event_type` enum is **`('ROOM_FULL','ROOM_REOPEN')`** — NOT `ROOM_LOCKED`/`FULL_ROOM_SELL`. `room_exhaustion = true` iff latest event is `ROOM_FULL` with no subsequent `ROOM_REOPEN`; no event row → `room_exhaustion: null` + `null_reason: "room_event_not_found"` (NEVER `false` — that is fabrication).

---

## Mandatory Architecture (from Architect Blueprint)

### Domain Layer (Go `pkg/domain/`)

**New model files:**
- `foreign_accum_models.go` — `ForeignFlowBar` (code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, volume), `ForeignAccumResult`, `AccumLabel` enum (`ACCUMULATING`/`DISTRIBUTING`/`NEUTRAL`), `RoomEvent` model (event_type enum: `ROOM_FULL`, `ROOM_REOPEN`)
- `foreign_accum_ports.go` — `ForeignFlowRepository` port: `GetForeignFlow(codes []string, limit int) (map[string][]ForeignFlowBar, error)`; `RoomEventRepository` port: `GetLatestRoomEvent(code string) (*RoomEvent, error)`
- `foreign_accum_service.go` — `CalculateForeignAccumService`: ADTV normalization (shares), 5d/20d cumulative net flow, cross-sectional z-score, rank, AccumLabel classification; honest-null guards per FR-10/11/12; degenerate-population guard

### Application Layer (Go `pkg/application/`)

**New DTO files:**
- `foreign_accum_dtos.go` — `ForeignAccumRequest`, `ForeignAccumResponse` (includes `adtv_unit: "shares"`, `foreign_accum_z_market` gauge scalar, `computed_as_of`)
- `foreign_accum_usecase.go` — `ComputeForeignAccumUseCase`: reads `WATCHLIST_TICKERS` env var

### Infrastructure Layer (Go `pkg/infrastructure/`)

**New repository files:**
- `foreign_flow_repository.go` — `SQLiteForeignFlowRepository implements ForeignFlowRepository`
  - Reads from `daily_ohlcv` WHERE code IN (...) AND foreign_buy_vol IS NOT NULL
  - SELECT: date, code, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, volume
  - Opens same DB_PATH (market.db) as existing price repository
  - Handles NULL foreign_*_vol gracefully (pre-migration rows) via honest-null guards
  
- `room_event_repository.go` — `SQLiteRoomEventRepository implements RoomEventRepository`
  - Reads from `foreign_room_events` (latest event per ticker)
  - SELECT event_type FROM foreign_room_events WHERE code = ? ORDER BY event_date DESC LIMIT 1
  - Catches table-not-found → returns (nil, nil) for honest-null handling
  - Maps event_type ('ROOM_FULL', 'ROOM_REOPEN') to RoomEvent struct

### Interface Layer (Go `pkg/interface/http/`)

**New handler file:**
- `foreign_accum_handler.go` — `handleForeignAccumRank(uc, logger)` → `POST /price/foreign-accum-rank`

**Modified:**
- `router.go` — add `POST /price/foreign-accum-rank` route
- `pkg/application/usecases.go` (or cmd/server/main.go) — wire new repositories + service + use case

---

## Functional Requirements (Distilled from BA Spec)

### Tool: `get_foreign_accum_rank`

**FR-1 (infrastructure):** Read from `daily_ohlcv` table (NOT `vnstock_trading_stats`):
- For each watchlist ticker, fetch trailing 20 daily rows sorted by date DESC
- Required columns: `foreign_buy_vol`, `foreign_sell_vol`, `volume` (for ADTV)
- Handle NULL foreign_*_vol rows gracefully (pre-migration data)

**FR-2 (domain):** Per-ticker per-day: `net_foreign_flow_vol = foreign_buy_vol - foreign_sell_vol`. Positive = net foreign buy; negative = net foreign sell.

**FR-3 (domain):** ADTV (Average Daily Turnover) in **shares**: `adtv_20d = mean(volume)` over 20-day window.

**FR-4 (domain):** ADTV-normalized daily flow: `normalized_flow_d = net_foreign_flow_vol_d / adtv_20d`. Makes flow comparable across large-cap (high ADTV) and small-cap (low ADTV) names.

**FR-5 (domain):** Cumulative normalized flow:
- `cum_net_flow_5d = sum(normalized_flow_d)` for last 5 rows
- `cum_net_flow_20d = sum(normalized_flow_d)` for all 20 rows

**FR-6 (domain):** Cross-sectional z-score of `cum_net_flow_5d` across all tickers with >=5 bars: `z = (cum_net_flow_5d_i - mean) / stddev`.

**FR-7 (application):** Rank tickers by z-score descending. Include `rank` integer (1 = most accumulated, N = most distributed).

**FR-8 (application):** Classification label per ticker: `ACCUMULATING` (z>=1.5), `DISTRIBUTING` (z<=-1.5), `NEUTRAL`.

**FR-9 (infrastructure):** `room_exhaustion` flag per ticker: read from `foreign_room_events` table (P0-2 output).
- Flag = true if latest event for ticker has event_type = 'ROOM_FULL' with no subsequent 'ROOM_REOPEN'
- No event row for ticker → flag = `null` with `null_reason: "room_event_not_found"` (NOT `false` — that is fabrication)

**FR-10 (domain/honest-null):** Tickers with <5 bars in `daily_ohlcv` (foreign flow data):
- All flow fields = `null` + `null_reason: "insufficient_flow_history"`

**FR-11 (domain/honest-null):** Tickers with >=5 but <20 bars:
- `cum_net_flow_5d` and z-score are REAL
- `cum_net_flow_20d` = `null` + `null_reason: "insufficient_20d_history"`
- Partial results are VALID and PREFERRED

**FR-12 (domain/honest-null):** If `adtv_20d = 0` for a ticker (e.g., suspended stock with zero volume):
- ADTV-normalized flow is undefined → `null` + `null_reason: "zero_adtv"`
- Raw `net_foreign_flow_vol` may still be reported

**FR-13 (degenerate population):** Fewer than 3 tickers with >=5 bars:
- Cross-sectional z-score = `null` for all with `null_reason: "insufficient_cross_section"`

### Non-Functional Requirements

**NFR-1:** Computation for full watchlist within 2 seconds.
**NFR-2:** `computed_as_of` = latest date in `daily_ohlcv` rows used.
**NFR-3:** Flow values in **volume units (shares)**; response includes `adtv_unit: "shares"` field.
**NFR-4:** `room_exhaustion` lookup is read-only — NEVER triggers a re-fetch of room data during this tool call.

---

## Honest-NULL Discipline (Standing Contract)

- **No fake data:** Every value is REAL or NULL (with `null_reason`).
- **Insufficient flow history:** <5 bars = `null` + `null_reason: "insufficient_flow_history"`.
- **Partial results valid:** >=5 but <20 bars = 5d real + 20d null (preferred over all-null).
- **Zero ADTV:** Normalized flow undefined → `null` + `null_reason: "zero_adtv"` (raw net flow may be emitted).
- **No room event:** `room_exhaustion: null` + `null_reason: "room_event_not_found"` (NEVER `false`).
- **Degenerate z-score:** <3 tickers with >=5 bars → z-score `null` + `null_reason: "insufficient_cross_section"` for all.

---

## Feed-Forward Scalar (for P1 Fear & Greed Composition)

| Tool | Scalar | Description |
|---|---|---|
| `get_foreign_accum_rank` | `foreign_accum_z_market` | Mean z-score of `cum_net_flow_5d_normalized` across tickers with >=5 bars (positive = net market-wide accumulation) |

---

## Testing Strategy (Go `*_test.go`)

- **foreign_accum_service_test.go:**
  - Table-driven: <5 bars = null+reason, >=5 bars = real, zero ADTV = null+reason, degenerate z = null+reason
  - Happy path: 20-bar ticker with real foreign flow, ADTV normalization, z-score computed, rank assigned
  - Partial path: 8-bar ticker = 5d real + 20d null with distinct null_reason
  - Degenerate: <3 tickers total = all z-scores null+reason

- **foreign_flow_repository_test.go:**
  - In-memory SQLite integration test
  - Populate `daily_ohlcv` with foreign_buy_vol, foreign_sell_vol, volume columns
  - Verify multi-ticker read via IN-clause parameterization
  - Verify NULL foreign_*_vol handling (pre-migration rows)

- **room_event_repository_test.go:**
  - In-memory SQLite with `foreign_room_events` table
  - Verify latest event per ticker (ORDER BY event_date DESC LIMIT 1)
  - Verify event_type enum mapping (ROOM_FULL, ROOM_REOPEN)
  - Verify table-not-found → (nil, nil) for honest-null

---

## Acceptance Criteria (QA Gate)

1. Response contains per-ticker fields: `net_flow_5d_raw`, `net_flow_20d_raw`, `cum_net_flow_5d_normalized`, `cum_net_flow_20d_normalized`, `z_score_5d`, `rank`, `label`, `room_exhaustion`.
2. Honest-NULL: tickers with <5 bars return null + `null_reason` (not dropped from response).
3. Partial results: 8-bar ticker shows 5d real + 20d null with distinct `null_reason` values.
4. `room_exhaustion: true` for tickers with latest `ROOM_FULL` event; `room_exhaustion: null` + `null_reason: "room_event_not_found"` for tickers with no event row (NOT `false`).
5. ADTV computed from `daily_ohlcv.volume` (shares); response includes `adtv_unit: "shares"` field.
6. Tool callable via `POST /price/foreign-accum-rank` endpoint.
7. Consumed by >=1 helper agent (MW/CHEF/AC/NS) — verified via session logs or tool_usage_stats.
8. Feeds `foreign_accum_z_market` scalar to Fear & Greed layer.

---

## Dependencies

- **Upstream:** P0-2-FOREIGN-ROOM-SUITE (LIVE_VERIFIED) — `foreign_room_events` table populated with event_type (ROOM_FULL, ROOM_REOPEN).
- **Upstream:** OHLCV-BACKFILL-P0 (LIVE_VERIFIED) — `daily_ohlcv` table with foreign_buy_vol, foreign_sell_vol, foreign_net_vol, volume columns populated (20+ bars per ticker).
- **Shared:** Existing stock-price service repository patterns (DB_PATH, SQLite connections).
- **Downstream:** MCP proxy layer (`dev-mcp-server`) consumes this HTTP endpoint and registers MCP tool.

---

## Files Overview (What to Create/Modify)

**Create (7 new):**
- pkg/domain/foreign_accum_models.go
- pkg/domain/foreign_accum_ports.go
- pkg/domain/foreign_accum_service.go
- pkg/application/foreign_accum_dtos.go, foreign_accum_usecase.go
- pkg/infrastructure/foreign_flow_repository.go, room_event_repository.go
- pkg/interface/http/foreign_accum_handler.go
- pkg/domain/foreign_accum_service_test.go, foreign_flow_repository_test.go, room_event_repository_test.go

**Modify (2):**
- pkg/interface/http/router.go — add 1 route
- pkg/application/usecases.go or cmd/server/main.go — wire dependencies

**Total touched files: 7 new + 2 modified = 9 files in apps/stock-price**

---

## Delivery Timeline

Estimated effort: **Medium** (M per BA).
Single dev, parallel domain/application/infrastructure development.
Target completion: next dev cycle (assume 4–6h delivery, next business day for QA handoff).

---

## Handoff to MCP Layer (Sequential Dependency)

When the HTTP endpoint `POST /price/foreign-accum-rank` is LIVE and tested:
- Handoff to `dev-mcp-server` for MCP proxy layer task (IND-P1-MCP-PROXY-INDICATORS).
- MCP server will call `POST /price/foreign-accum-rank`.
