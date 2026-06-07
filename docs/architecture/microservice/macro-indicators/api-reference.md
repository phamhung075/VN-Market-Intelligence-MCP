# macro-indicators — API Reference

**File:** `apps/macro-indicators/src/interface/handlers.ts`

## GET /health
```json
{ "status": "ok", "service": "macro-indicators", "port": 5004 }
```

## POST /macro/snapshot
Fetch current macroeconomic indicators with directional signals and prev-session direction+delta.

**Request:** `{}` (empty body, future extensibility for filters)

**Response (200):**
```json
{
  "status": "ok",
  "vnIndex": 1200.5,
  "vnIndexDelta": 20.0,
  "vnIndexDirection": "up",
  "oilUsd": 85.0,
  "oilUsdDelta": null,
  "oilUsdDirection": "unknown",
  "goldUsd": 2100.0,
  "goldUsdDelta": null,
  "goldUsdDirection": "unknown",
  "usdVnd": 24500.0,
  "usdVndDelta": null,
  "usdVndDirection": "unknown",
  "dataSource": "live",
  "signals": { "...": "6 primitives" },
  "fetchedAt": "2026-06-07T10:30:00Z",
  "vnIndex_is_estimate": false,
  "vnIndex_source_tier": 1
}
```

**Direction enum (U4):** `"up"` | `"down"` | `"flat"` | `"unknown"`.

**Delta semantics:**
- `vnIndexDelta`: signed point delta (current_close − prev_session_close) from `daily_ohlcv`. `null` when fewer than 2 rows exist (first trading day safe-degrade).
- `oilUsdDelta` / `goldUsdDelta` / `usdVndDelta`: always `null` — no prev-session history persisted for commodity tables (single-row sources). Never fabricated.
- `vnIndexDirection`: `"flat"` when `|delta/current| < 0.1%` (threshold is ARCH-DEFERRED, tunable in future sprint).

**Note:** Any price field can be from fixture fallback (`*_is_estimate: true`) if live source is absent/stale. `dataSource: "live"` requires all 5 inputs live (oil+gold+usdVnd+fedFunds+vndDeposit).

**500:** `{ "error": "error message" }`
