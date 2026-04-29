# TASK-1423b — FRED API Fetcher for Fed Funds Rate

**Sprint:** 1423 — Trần Ngọc Báu Macro Framework (Phase 1)
**Created:** 2026-04-29
**Status:** done
**Agent:** developer
**Estimate:** ~2h

---

## Context

The Fed Funds Rate is the second critical global input for the Carry Trade Signal
(TASK-1423c) and the [Thien Thoi] macro snapshot section (TASK-1423d). No FRED
fetcher currently exists. The `tracked_indicators` table already exists and is the
correct landing table.

## Scope

### New File

**`apps/mcp-server/src/infrastructure/fetchers/fredApi.ts`**

```typescript
// fetchFedFundsRate(): Promise<number | null>
// Endpoint: https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS
// No API key required (FRED public tier — confirmed)
// CSV format: DATE,VALUE (header + rows, latest = last row)
// Parse: last row, column index 1 → parseFloat
// On parse failure or HTTP error: return null (do NOT throw)
// Stores result to tracked_indicators:
//   indicator = 'fed_funds_rate', source = 'fred', unit = '%'
//   Uses getDb() for DB access (infrastructure layer — correct)
// Hourly dedup handled by existing hour_bucket trigger on tracked_indicators
```

Fetch frequency: daily is sufficient (FOMC changes ~8x/year). The existing
`macroIndicatorRefreshJob.ts` runs daily — piggyback on it.

### Files to Modify

**`apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts`**
- Import `fetchFedFundsRate` from `fredApi.ts`
- Add `fetchFedFundsRate()` call alongside the existing Yahoo Finance fetch
- Log result: `[macroRefresh] fed_funds_rate = ${rate}%` or WARN on null

## Acceptance Criteria

1. `tracked_indicators` has a row with `indicator='fed_funds_rate'`, `source='fred'` after fetcher runs
2. Value is a realistic Fed Funds Rate (e.g., 4.33 or 5.33 — not 0, not null stored)
3. If FRED CSV returns empty or HTTP fails, `null` is returned and a WARN is logged — no crash
4. Existing `macroIndicatorRefreshJob` tests continue to pass
5. New unit test: mocked HTTP → verifies correct CSV row parsed and `tracked_indicators` row written
6. New unit test: mocked HTTP 500 → verifies graceful null return, no throw

## Test File

`apps/mcp-server/src/__tests__/1423b-fred-fetcher.test.ts`

Use `bun:test` mock for `fetch`. Set DB to `:memory:` via the preload setup.

## Architect Notes

- FRED public endpoint `https://fred.stlouisfed.org/graph/fredgraph.csv?id=FEDFUNDS`
  confirmed to require no API key
- If a key becomes required in future, use env var `FRED_API_KEY` (fallback to public URL)
- Add structured error log if CSV parse returns 0 rows: `[fredApi] WARN: CSV returned 0 rows`
- `fredApi.ts` is infrastructure layer — DB write via `getDb()` is correct DDD placement

## Dependencies

None — can start immediately, parallel with 1423a and 1423c.

## Blocks

TASK-1423c (needs `fed_funds_rate` value available in DB)
TASK-1423d (needs `fed_funds_rate` for carry spread computation)

---

## RETURN

DONE: Created `fredApi.ts` fetching FEDFUNDS CSV from FRED public endpoint, storing to `tracked_indicators` with indicator='fed_funds_rate'/source='fred'/unit='%', wired into `macroIndicatorRefreshJob`, 6 unit tests passing, tsc clean on new code.
NEXT: qa | verify TASK-1423b acceptance criteria — run tests, check tsc, confirm tracked_indicators row written correctly
HANDOFF: docs/handoffs/TASK_1423b.md
PIPELINE: continue
