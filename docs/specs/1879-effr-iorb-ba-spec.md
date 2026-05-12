# Spec 1879 — EFFR-IORB FRED Fetcher + `get_fed_liquidity_spread()` MCP Tool

**Sprint:** 1879
**SSOT layer:** Layer 2.D — Interbank plumbing (liquidity microstructure)
**Status:** SPEC COMPLETE — gates 1879b (depends on 1879a)
**Owner:** dev-mcp-server (both sub-tasks live in `apps/mcp-server`)
**Date:** 2026-05-12

---

## 1. Objective

Persist daily EFFR and IORB series from the FRED public CSV endpoint. Expose
`get_fed_liquidity_spread()` MCP tool returning `{effr, iorb, spread, asOf,
trend30d, samples}`.

Layer 2.D classification (tnb-methodology.md §2.D): the EFFR–IORB spread is the
primary US interbank plumbing gauge — positive spread signals reserve abundance,
negative (or narrowing) spread signals reserve scarcity (funding stress). Funding
stress propagates to EM/VN markets through the dollar liquidity channel (FII
outflow accelerator → USD/VND pressure → SBV defensive intervention).

---

## 2. Scope decision

Single combined spec file with two clearly divided sections.

| Sub-task | Area | Service |
|---|---|---|
| **1879a** | FRED fetcher — fetch + persist EFFR + IORB | `apps/mcp-server` (infra + scheduler) |
| **1879b** | MCP tool — `get_fed_liquidity_spread` | `apps/mcp-server` (domain + interface) |

### Investigation findings (BA layer)

**Architecture of existing FRED fetcher (1423b):**
- Lives entirely in `apps/mcp-server`, NOT in `apps/macro-indicators`.
- `apps/macro-indicators` is a separate microservice for commodity/SBV snapshot (Hono HTTP, port 5004). It has no FRED client, no `tracked_indicators` table, and no scheduler.
- FRED fetches are done inside `apps/mcp-server/src/infrastructure/fetchers/fredApi.ts` and triggered by `macroIndicatorRefreshJob` (scheduler job).
- **Decision: 1879a lives in `apps/mcp-server`, not `apps/macro-indicators`.** This is the correct DDD placement — the existing FRED client, `tracked_indicators` table, and cron wiring are all in `apps/mcp-server`.

**Existing FRED client (`fredApi.ts`):**
- Fetches single series `FEDFUNDS` (monthly Fed Funds Rate) via public CSV endpoint.
- Persists to `tracked_indicators` table: `{indicator, value, unit, source, extracted_at}`.
- Dedup strategy: `tracked_indicators` has UNIQUE constraint on `(indicator, source)` — INSERT uses `ON CONFLICT REPLACE` (last value wins per indicator+source pair).
- This is a coarse dedup (single latest value per indicator+source). For daily time-series with multiple dates, a date-keyed dedup is required — see §3.3.

**`tracked_indicators` schema (confirmed from test files):**
```sql
CREATE TABLE tracked_indicators (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator    TEXT NOT NULL,
  value        REAL NOT NULL,
  unit         TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT '',
  extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
UNIQUE (indicator, source)  -- existing constraint
```

The existing UNIQUE on `(indicator, source)` is per-indicator (one row per
indicator), not per date. EFFR and IORB need a daily time-series (N rows per
indicator). **A new table `fred_series_daily` is required** — see §3.3.

**Scheduler hook:** `macroIndicatorRefreshJob` runs at `CRON_MACRO_INDICATOR_REFRESH`
(default `0 6 * * *` — daily 06:00 UTC). This is the correct hook for 1879a.
EFFR + IORB fetches append to the new job call inside `macroIndicatorRefreshJob`.

**Domain services pattern (`carryTradeSignal.ts`):**
- Pure functions, zero infra imports, plain number arguments.
- DDD contract: domain receives pre-read values from the interface layer (tool handler
  reads DB, calls domain function, formats output).

**FRED series mapping:**
- EFFR → FRED series `EFFR` (daily, published next business day)
- IORB → FRED series `IORB` (daily, published next business day)
- Both use the same public CSV endpoint: `https://fred.stlouisfed.org/graph/fredgraph.csv?id={SERIES}`
- No API key required (confirmed by existing `fredApi.ts` implementation).

---

## 3. 1879a — FRED fetcher (apps/mcp-server)

### 3.1 File paths

Following the existing fetcher convention in `apps/mcp-server/src/infrastructure/fetchers/`:

| File | Action |
|---|---|
| `apps/mcp-server/src/infrastructure/fetchers/fredEffrIorb.ts` | NEW — FRED fetcher for EFFR + IORB |
| `apps/mcp-server/src/infrastructure/fetchers/index.ts` | +1 export |
| `apps/mcp-server/src/infrastructure/db/schema.ts` | +1 table `fred_series_daily` |
| `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts` | +1 call to new fetcher |

### 3.2 FRED series

| Indicator | FRED Series ID | Frequency | Unit |
|---|---|---|---|
| Effective Federal Funds Rate | `EFFR` | Daily (business days) | `%` |
| Interest on Reserve Balances | `IORB` | Daily (business days) | `%` |

FRED public CSV URL pattern: `https://fred.stlouisfed.org/graph/fredgraph.csv?id={SERIES_ID}`

CSV format (confirmed pattern from existing `fredApi.ts`):
```
DATE,VALUE
2025-01-01,4.33
2025-01-02,4.33
...
2026-05-09,4.33
```

### 3.3 Storage — new table `fred_series_daily`

The existing `tracked_indicators` table has a UNIQUE on `(indicator, source)` meaning
only one row per indicator. Daily EFFR + IORB require a per-date row. A dedicated
table is required.

```sql
CREATE TABLE IF NOT EXISTS fred_series_daily (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  series     TEXT NOT NULL,        -- e.g. 'EFFR', 'IORB'
  date       TEXT NOT NULL,        -- ISO-8601 date 'YYYY-MM-DD'
  value      REAL NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (series, date)            -- idempotency: re-run = 0 net new rows
);
CREATE INDEX IF NOT EXISTS idx_fred_series_daily_series_date
  ON fred_series_daily (series, date DESC);
```

The `UNIQUE (series, date)` constraint enables `INSERT OR IGNORE` idempotency:
re-running the fetcher on the same day inserts 0 new rows.

### 3.4 Fetcher behavior

- Fetch EFFR and IORB series in parallel (two HTTP requests).
- Parse ALL data rows from CSV (not just the last row — full historical range on first run).
- Insert using `INSERT OR IGNORE INTO fred_series_daily (series, date, value) VALUES (?, ?, ?)`.
- Idempotency: `ON CONFLICT (series, date) DO NOTHING` — re-runs produce 0 new rows.
- Backfill: first run naturally backfills all history returned by FRED (typically 1–2 years of daily data).
- Date alignment: EFFR and IORB share the same business-day schedule. If FRED returns
  mismatched date sets, the tool (1879b) uses latest common date via inner join or
  `MIN(latest_effr_date, latest_iorb_date)`.

### 3.5 Retry + error handling

- HTTP 4xx/5xx: log WARN, retry up to 3 times with exponential backoff (1s, 2s, 4s).
- On permanent failure after 3 retries: log ERROR, persist nothing, continue (never throw).
- CSV parse failure (empty, malformed): log WARN, persist nothing, return null.
- Missing series: log WARN per series. If both fail, log ERROR.
- Error handling mirrors existing `fredApi.ts` pattern (never throws, returns null on failure).

### 3.6 Scheduler hook

Inside `macroIndicatorRefreshJob()` (already runs daily at 06:00 UTC):

```
// after existing fetchFedFundsRate() call:
const effrIorbResult = await fetchFredEffrIorb(undefined, db);
if (effrIorbResult === null) {
  logger.warn("[macroRefresh] EFFR/IORB fetch returned null — FRED unavailable");
}
```

No new cron entry needed — piggybacks on `CRON_MACRO_INDICATOR_REFRESH` (`0 6 * * *`).

### 3.7 Acceptance Criteria — 1879a

| AC | Criterion |
|---|---|
| AC-1 | FRED API fetch succeeds for EFFR + IORB series via public CSV endpoint (no API key). Returns parsed `{ series, date, value }[]` for each series. |
| AC-2 | Each persisted row in `fred_series_daily` includes `{series, date, value, fetched_at}`. Schema matches DDL in §3.3. |
| AC-3 | Re-run on same day (same `date` values already in DB) produces 0 net new rows — `INSERT OR IGNORE` idempotency confirmed. |
| AC-4 | First run backfills full FRED history for both series (≥ 1 year of daily rows per series). All rows parsed from CSV, not just last row. |
| AC-5 | `macroIndicatorRefreshJob` calls `fetchFredEffrIorb` — invocation logged at INFO level with row count inserted. |
| AC-6 | HTTP 4xx/5xx from FRED: 3 retries with backoff → final failure logged at ERROR level, zero rows written to `fred_series_daily`. |

---

## 4. 1879b — MCP tool (apps/mcp-server)

### 4.1 Tool name + registration

Tool name: `get_fed_liquidity_spread`

Registration file: `apps/mcp-server/src/interface/mcp/tools/macro/getFedLiquiditySpreadTool.ts`
Exported via: `apps/mcp-server/src/interface/mcp/tools/macro/index.ts` barrel
Called by: `apps/mcp-server/src/interface/mcp/tools/registry.ts` (or equivalent server setup)

### 4.2 Input schema (Zod)

```typescript
{
  days?: z.number().int().min(1).max(180).default(30)
}
```

### 4.3 Output schema

```typescript
{
  effr:    number,                                      // latest EFFR %
  iorb:    number,                                      // latest IORB %
  spread:  number,                                      // IORB - EFFR (positive = abundance, negative = stress)
  asOf:    string,                                      // ISO-8601 date of latest common row
  trend30d: "widening" | "narrowing" | "flat" | "insufficient_data",
  samples: Array<{
    date:   string,   // YYYY-MM-DD
    effr:   number,
    iorb:   number,
    spread: number,
  }>
}
```

Spread convention: `spread = IORB - EFFR`
- Positive: IORB > EFFR → reserve abundance (normal regime)
- Negative: IORB < EFFR → reserve scarcity → funding stress signal

### 4.4 Domain function placement

File: `apps/mcp-server/src/domain/services/macro/fedLiquiditySpread.ts`

Pure function, zero infrastructure imports. Receives raw samples array as input.

```typescript
export interface FredDailySample {
  date: string;
  effr: number;
  iorb: number;
}

export type SpreadTrend = "widening" | "narrowing" | "flat" | "insufficient_data";

export interface FedLiquiditySpreadResult {
  effr: number;
  iorb: number;
  spread: number;
  asOf: string;
  trend30d: SpreadTrend;
  samples: Array<{ date: string; effr: number; iorb: number; spread: number }>;
}

export function computeFedLiquiditySpread(
  samples: FredDailySample[]
): FedLiquiditySpreadResult
```

DDD contract: the interface layer (tool handler) reads `fred_series_daily` from DB,
inner-joins EFFR + IORB on date, passes the array to `computeFedLiquiditySpread()`.
Domain function computes spread, trend, and formats output. Zero DB access inside domain.

### 4.5 trend30d computation

Linear slope of `spread` over the N samples provided (up to 30 days):
- slope > +0.01 → `"widening"` (IORB pulling away from EFFR: more abundant reserves)
- slope < -0.01 → `"narrowing"` (EFFR catching up to IORB: tightening reserves)
- -0.01 ≤ slope ≤ +0.01 → `"flat"`
- fewer than 5 samples → `"insufficient_data"` (no slope computed, no crash)

Slope is computed as a simple OLS slope over the ordered sample index (not calendar days,
to handle weekend gaps naturally). Threshold 0.01 = 1 basis point per sample.

### 4.6 asOf + latest common date

`asOf` = latest date where both EFFR and IORB have a row (inner join on date).
If FRED publishes one series before the other (typical lag is same-day), `asOf`
uses the latest available common date. The tool handler implements this as:

```sql
SELECT e.date, e.value AS effr, i.value AS iorb
FROM fred_series_daily e
JOIN fred_series_daily i ON e.date = i.date
WHERE e.series = 'EFFR' AND i.series = 'IORB'
ORDER BY e.date DESC
LIMIT :days
```

### 4.7 Acceptance Criteria — 1879b

| AC | Criterion |
|---|---|
| AC-1 | Tool `get_fed_liquidity_spread` registered in MCP registry — appears in `list_server_tools` output. |
| AC-2 | Returns last `days` (default 30) sample series + spread + `asOf` matches latest common EFFR/IORB date in `fred_series_daily`. |
| AC-3 | `trend30d` correctly classified: "widening" if OLS slope of spread > 0.01, "narrowing" if < -0.01, else "flat". |
| AC-4 | Fewer than 5 common date samples → returns `{ ..., samples: [...], trend30d: "insufficient_data" }` — no exception thrown. |

---

## 5. DDD layer mapping

| Component | DDD Layer | Location |
|---|---|---|
| `fred_series_daily` table DDL | Infrastructure | `infrastructure/db/schema.ts` |
| `fredEffrIorb.ts` fetcher | Infrastructure | `infrastructure/fetchers/fredEffrIorb.ts` |
| `computeFedLiquiditySpread()` | Domain | `domain/services/macro/fedLiquiditySpread.ts` |
| `getFedLiquiditySpreadTool.ts` | Interface | `interface/mcp/tools/macro/getFedLiquiditySpreadTool.ts` |
| DB read (inner join) | Application (inside interface tool handler) | `interface/mcp/tools/macro/getFedLiquiditySpreadTool.ts` |
| Scheduler call | Application | `scheduler/macro/macroIndicatorRefreshJob.ts` |

---

## 6. TDD strategy

### 6.1 1879a — fetcher tests (6 tests)

File: `apps/mcp-server/src/__tests__/1879a-fred-effr-iorb-fetcher.test.ts`

| ID | Test |
|---|---|
| T1 | Mock FRED CSV for both EFFR + IORB → `fetchFredEffrIorb()` inserts N rows into `fred_series_daily` (in-memory DB) |
| T2 | Re-run with same CSV on same dates → count remains N (0 net new rows — `INSERT OR IGNORE` idempotency) |
| T3 | Backfill: CSV with 365 data rows → all 365 rows inserted per series |
| T4 | Schema guard: `fred_series_daily` has columns `{id, series, date, value, fetched_at}` with UNIQUE on `(series, date)` |
| T5 | HTTP 500 mock for EFFR → 3 retries attempted → final null returned, 0 rows written |
| T6 | Cron integration: `macroIndicatorRefreshJob` invokes `fetchFredEffrIorb` — mock confirms call received |

### 6.2 1879b — tool tests (5 tests)

File: `apps/mcp-server/src/__tests__/1879b-fed-liquidity-spread-tool.test.ts`

| ID | Test |
|---|---|
| T1 | Input schema: `days=0` rejected (min 1); `days=181` rejected (max 180); `days=30` accepted |
| T2 | Known fixture `[{effr: 4.33, iorb: 4.40, date: '2026-05-09'}]` → `spread = 0.07`, `asOf = '2026-05-09'` |
| T3 | trend30d classification: 30 samples with monotone increasing spread → "widening"; decreasing → "narrowing"; flat → "flat" |
| T4 | 4 samples provided → `trend30d = "insufficient_data"`, no exception |
| T5 | DDD audit: import graph of `fedLiquiditySpread.ts` contains zero references to `bun:sqlite`, `schema.js`, `getDb`, or any infra module |

---

## 7. File list

| File | Action |
|---|---|
| `apps/mcp-server/src/infrastructure/fetchers/fredEffrIorb.ts` | NEW |
| `apps/mcp-server/src/infrastructure/fetchers/index.ts` | +1 export |
| `apps/mcp-server/src/infrastructure/db/schema.ts` | +1 table `fred_series_daily` |
| `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts` | +1 call |
| `apps/mcp-server/src/domain/services/macro/fedLiquiditySpread.ts` | NEW |
| `apps/mcp-server/src/domain/services/macro/index.ts` | +1 export |
| `apps/mcp-server/src/interface/mcp/tools/macro/getFedLiquiditySpreadTool.ts` | NEW |
| `apps/mcp-server/src/interface/mcp/tools/macro/index.ts` | +1 export |
| `apps/mcp-server/src/__tests__/1879a-fred-effr-iorb-fetcher.test.ts` | NEW |
| `apps/mcp-server/src/__tests__/1879b-fed-liquidity-spread-tool.test.ts` | NEW |

---

## 8. Out of scope

- VN-specific liquidity signals derived from EFFR-IORB (separate methodology sprint)
- Real-time websocket updates from FRED (daily batch is sufficient — FRED publishes BD)
- Alert wiring on spread threshold crossings (follow-on sprint)
- `apps/macro-indicators` microservice changes (FRED fetching does not belong there)

---

## 9. Risks and unknowns (resolved + open)

| Risk | Status | Resolution |
|---|---|---|
| FRED API key required | RESOLVED — none needed | Existing `fredApi.ts` confirms public CSV tier, no key |
| EFFR vs DFF series choice | RESOLVED — use `EFFR` | `EFFR` is daily (business days); `DFF` is also daily but EFFR is the canonical overnight rate post-2016 |
| Date alignment between EFFR + IORB | RESOLVED | Inner join on date — `asOf` = latest common date |
| `apps/macro-indicators` vs `apps/mcp-server` placement | RESOLVED | All FRED fetching lives in `apps/mcp-server` (existing pattern confirmed) |
| `tracked_indicators` reuse vs new table | RESOLVED — new table needed | Existing dedup is per-(indicator, source) single row; daily time-series needs `UNIQUE (series, date)` — new table `fred_series_daily` |
| FRED publishes EFFR before IORB (same-day lag) | OPEN — low risk | Inner join handles naturally; if IORB lags 1 day, `asOf` uses day before |
| FRED rate limits | LOW RISK | Public tier is generous; fetcher runs once daily — no throttle concern |

---

## 10. Dependencies

| Dependency | Status |
|---|---|
| FRED public CSV endpoint | Operational (confirmed by existing `fredApi.ts`) |
| `fred_series_daily` table | New — created in 1879a via schema migration |
| Existing `macroIndicatorRefreshJob` cron (`0 6 * * *`) | Operational |
| `FredHttpClient` interface | Reuse from `fredApi.ts` (injectable mock for tests) |
| 1879b depends on 1879a | Explicit — tool reads from `fred_series_daily` populated by fetcher |

No external blockers for PO. No PO questions required.
