# TASK_MLP-D4 — HTTP Response DataSource Field

**Task:** MLP-D4
**Sprint:** MACRO-LIVE-PRICES
**Owner:** dev-macro-indicators
**Zone:** apps/macro-indicators/
**Depends on:** MLP-D3 (env gate wiring complete)
**Blocks:** MLP-D5 (final verification + docker-compose)
**Priority:** HIGH
**Date:** 2026-05-28
**Architect ref:** docs/architecture-briefs/2026-05-28-macro-live-prices.md §5, §11

---

## Overview

Add a `DataSource string` field to the HTTP snapshot response struct in `pkg/interface/http/` (handler/response layer).

This field indicates whether the snapshot values came from live data (`"live"`) or fixture fallback (`"fixture"`).

**Critical note from brief §5:**
- This field lives on the HTTP response JSON, NOT on the domain struct
- The application layer (use case) is unchanged; the interface layer (handler) marshals the response
- The handler sets `DataSource` based on whether all three commodity values came from the live port (>0) or fell back to fixtures

---

## Acceptance Criteria

### AC-1: Add DataSource field to response struct
**Status:** TODO  
**Evidence:** code review + git diff

Add a `DataSource string` field to the snapshot response struct in `pkg/interface/http/`.

**Implementation approach (per brief §5):**
- Locate the HTTP response struct for the `/snapshot` endpoint (e.g., `SnapshotResponse` or similar)
- Add field: `DataSource string` (exported, JSON-serializable)
- Field is set by the handler AFTER calling the use case, based on port values

**No domain change:**
- The domain struct (if any) remains unchanged
- The use case (`resolveMarketPrices()`) returns the snapshot; the handler/response builder adds the flag

**Acceptance:** Response struct has `DataSource string` field. Field is exported and JSON-serializable.

---

### AC-2: Handler logic: set DataSource = "live" when all three values from port
**Status:** TODO  
**Evidence:** code review + git diff

In the handler that calls `resolveMarketPrices()`, set `response.DataSource = "live"` when all three commodity values (oil, gold, usdVnd) came from the live port (>0).

**Implementation logic:**
- Call use case: `snapshot := resolveMarketPrices(ctx, commodityFetcher)`
- Check: if `snapshot.OilPrice > 0 AND snapshot.GoldPrice > 0 AND snapshot.UsdVnd > 0`, then all three came from port (live)
- Set: `response.DataSource = "live"`

**Implementation note from brief §5:**
- The use case can optionally pass a computed `allLive bool` flag to the response builder to make this clearer
- Or the handler can check the snapshot values directly
- Either approach is acceptable

**Acceptance:** When all three port values are non-zero, response has `DataSource: "live"`.

---

### AC-3: Handler logic: set DataSource = "fixture" when any value from fallback
**Status:** TODO  
**Evidence:** code review + git diff

Set `response.DataSource = "fixture"` when ANY of the three commodity values fell back to fixture (because the port returned 0 for that field).

**Implementation logic:**
- If ANY of `snapshot.OilPrice`, `snapshot.GoldPrice`, or `snapshot.UsdVnd` equals the fixture constant, fixture fallback fired
- Set: `response.DataSource = "fixture"`

**Acceptance:** When any value is a fixture constant, response has `DataSource: "fixture"`.

---

### AC-4: JSON response includes DataSource field
**Status:** TODO  
**Evidence:** HTTP response JSON inspection (manual or integration test)

Verify the HTTP JSON response includes the `DataSource` field when marshalled.

**Example expected JSON:**
```json
{
  "vnIndex": 1245.5,
  "oilUsd": 96.0,
  "goldUsd": 4480.0,
  "usdVnd": 26150.0,
  "dataSource": "live",
  "timestamp": "2026-05-28T10:00:00Z"
}
```

Or (fixture mode):
```json
{
  "vnIndex": ...,
  "oilUsd": 82.5,
  "goldUsd": 2350.0,
  "usdVnd": 24500.0,
  "dataSource": "fixture",
  "timestamp": "2026-05-28T10:00:00Z"
}
```

**Acceptance:** JSON response includes `dataSource` field with correct value ("live" or "fixture").

---

### AC-5: No domain/application layer changes
**Status:** TODO  
**Evidence:** code review

Verify the domain and application layers are untouched:
- `pkg/domain/ports.go` — no change
- `pkg/application/usecases.go` — no change to `resolveMarketPrices()` logic

The interface layer ONLY reads the response from the use case and adds metadata.

**Acceptance:** Domain and application layers unchanged. Interface layer only adds the DataSource field.

---

### AC-6: go build and existing tests pass
**Status:** TODO  
**Evidence:** go build ./... exit 0, go test ./... (from MLP-D5)

Verify the change compiles and does not break existing code.

**Execute:**
```bash
cd apps/macro-indicators && go build ./...
```

**Acceptance:** Build succeeds. Existing tests still green (verified in MLP-D5).

---

## Implementation Notes

### File modification
- **`apps/macro-indicators/pkg/interface/http/` (handler/response struct):**
  - Add `DataSource string` field to the response struct (likely in a handlers file or a types/response file)
  - Net change: ~5 lines added (field definition + handler assignment logic)

### No schema change
- The HTTP API contract (`openapi.yaml` if present) may be updated to document the new `dataSource` field (optional, per architect decision in MLP-D1)
- Database schema unchanged
- No env vars added

### JSON field naming
- Go struct field: `DataSource string` (exported, PascalCase)
- JSON field (via `json` tag): likely `dataSource` (camelCase) or `data_source` (snake_case) — follow existing convention in codebase

### Fixture constants for comparison (from code)
- `fixtureOilUSD` (likely 82.5)
- `fixtureGoldUSD` (likely 2350.0)
- `fixtureUSDVnd` (likely 24500.0)

The handler can compare snapshot values against these constants to detect fixture fallback.

---

## Success Metrics

1. All 6 ACs above verified PASS
2. go build ./... exits 0
3. Response struct has DataSource field
4. Handler sets DataSource correctly ("live" or "fixture")
5. JSON response includes dataSource field
6. Domain/application unchanged

---

## Rollback / Revert Plan

If this task fails:
1. `git checkout -- apps/macro-indicators/pkg/interface/http/` (revert response struct changes)
2. Application logic remains untouched
3. Snapshot endpoint still returns oil/gold/usdVnd values (just without the DataSource indicator)

---

## Notes

- **Response-layer only:** This is a marshalling concern, not domain logic. Very low risk.
- **Backward compatible:** Existing tests don't check for the DataSource field, so they remain green even after it's added.
- **Clear signal:** The DataSource field directly communicates whether the user is seeing live or fixture data.
- **Zone isolation:** All work stays in apps/macro-indicators/pkg/interface/. No changes to other files.
- **Commit safety:** Explicit-file staging: `git add apps/macro-indicators/pkg/interface/http/...`

---

## Next Step

After this task DONE:
- Main terminal commits: `feat(macro-indicators): MLP-D4 — add DataSource field to /snapshot response`
- Dispatch MLP-D5 (docker-compose env + final verification)
