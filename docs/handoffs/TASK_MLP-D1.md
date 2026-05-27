# TASK_MLP-D1 — SQLiteCommodityRepository + Infrastructure Tests

**Task:** MLP-D1
**Sprint:** MACRO-LIVE-PRICES
**Owner:** dev-macro-indicators
**Zone:** apps/macro-indicators/
**Depends on:** (none — start here)
**Blocks:** MLP-D2
**Priority:** HIGH
**Date:** 2026-05-28
**Architect ref:** docs/architecture-briefs/2026-05-28-macro-live-prices.md §3, §7, §11

---

## Overview

Implement `SQLiteCommodityRepository` struct in `apps/macro-indicators/pkg/infrastructure/repositories.go` — the live DB adapter that reads commodity prices from the shared `market.db` SQLite database (already populated by mcp-server's `commodityTrackerRefreshJob`).

This task includes:
1. **SQLiteCommodityRepository** struct + `NewSQLiteCommodityRepository()` constructor
2. **FetchPrices()** method (implements domain.CommodityFetcherPort)
3. **fetchCommodityPricesFromDB()** pure helper function for testability
4. **Infrastructure tests (T-MLP-1 / T-MLP-2 / T-MLP-3)** using in-memory SQLite `:memory:` injection

---

## Acceptance Criteria

### AC-1: SQLiteCommodityRepository struct and constructor
**Status:** TODO  
**Evidence:** code review + git diff

Implement the struct exactly as specified in the brief §7:
```go
type SQLiteCommodityRepository struct {
    dbPath string
}

func NewSQLiteCommodityRepository() *SQLiteCommodityRepository
```

Constructor must read `DB_PATH` env var (default `/app/data/market.db`). No error handling in constructor — errors are deferred to FetchPrices().

**Acceptance:** Brief §7 struct signature matches exactly. Constructor wired to read env var.

---

### AC-2: FetchPrices() method signature and contract
**Status:** TODO  
**Evidence:** code review + go test output

Implement FetchPrices per the brief §7 interface:
```go
func (r *SQLiteCommodityRepository) FetchPrices(
    ctx context.Context,
    symbols []string,
) (map[string]float64, error)
```

**Contract (per brief §7):**
- Symbols recognised: "OIL" → brent_crude_usd, "GOLD" → gold_usd_per_oz, "USDVND" → usd_vnd_rate
- Unknown symbols silently omitted
- Returns empty map (not error) when data absent or stale
- Opens `market.db` with `?mode=ro` (read-only)
- Executes query: `SELECT brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at FROM commodity_prices WHERE source = 'yahoo' ORDER BY fetched_at DESC LIMIT 1`
- Staleness bound: 26 hours (per architect decision §2)

**Staleness check implementation:**
- Parse `fetched_at` as ISO-8601 UTC string using `time.RFC3339Nano` (NOT `RFC3339` — brief §11 R-2 risk: TS producer writes milliseconds; wrong parser = silent-stale)
- Check `time.Since(fetchedAt) > 26 * time.Hour`
- If stale, return empty map (not error)
- If NULL fetched_at, treat as infinitely stale

**Partial-row handling (brief §7):**
- If brent_crude_usd is NULL or ≤0, omit "OIL" from returned map
- Same for GOLD (gold_usd_per_oz) and USDVND (usd_vnd_rate)
- Use `sql.NullFloat64` for scanning (brief §11 R-1 risk)

**Error cases (per brief §7):**
- DB file missing/unreadable: return `(nil, nil)` → application falls back to fixture
- commodity_prices table absent: return empty map
- All three columns NULL or ≤0: return empty map

**Acceptance:** Method signature matches brief. Query exact per brief. Staleness logic correct (26h, RFC3339Nano, per-column omission). All error cases return empty/nil per contract.

---

### AC-3: fetchCommodityPricesFromDB() helper function
**Status:** TODO  
**Evidence:** code review + go test output

Extract the pure query logic into a testable helper (mirrors existing `fetchVNIndexFromDB` pattern in brief §11):

```go
// fetchCommodityPricesFromDB is the pure query logic extracted from FetchPrices
// so tests can inject a *sql.DB directly (in-memory :memory:) without
// touching the file-path constructor.
// Returns a map with only the non-zero, non-NULL, freshness-validated values.
func fetchCommodityPricesFromDB(
    ctx context.Context,
    db *sql.DB,
    staleBound time.Duration,   // caller passes 26 * time.Hour
) (map[string]float64, error)
```

**Implementation notes:**
- Called by FetchPrices() after opening the DB
- Used by tests to inject `:memory:` DB directly (no file I/O, deterministic)
- Returns the same empty-map contract as FetchPrices
- Staleness check at the helper level (staleBound parameter passed by caller)

**Acceptance:** Helper function exists, signature matches brief §7. Used by FetchPrices. Tests can inject db directly.

---

### AC-4: T-MLP-1 — Infrastructure test: live row with fresh fetched_at
**Status:** TODO  
**Evidence:** go test output (repositories_test.go T-MLP-1)

Test that fetchCommodityPricesFromDB returns live values when `fetched_at` is recent (< 26h ago).

**Setup:**
- Create in-memory SQLite `:memory:` DB (using existing `newInMemoryDB()` helper, extended with `commodity_prices` table per brief §11)
- Insert one row: `source='yahoo'`, `brent_crude_usd=96.0`, `gold_usd_per_oz=4480.0`, `usd_vnd_rate=26150.0`, `fetched_at='2026-05-28T10:00:00Z'` (fresh timestamp)

**Execute:**
- Call `fetchCommodityPricesFromDB(ctx, db, 26*time.Hour)` with the in-memory DB
- Verify returned map contains: `{"OIL": 96.0, "GOLD": 4480.0, "USDVND": 26150.0}`

**Acceptance:** Test passes, map contains all three live values.

---

### AC-5: T-MLP-2 — Infrastructure test: stale row with fetched_at > 26h ago
**Status:** TODO  
**Evidence:** go test output (repositories_test.go T-MLP-2)

Test that fetchCommodityPricesFromDB returns empty map when `fetched_at` is stale (> 26h old).

**Setup:**
- Create in-memory DB
- Insert one row: same columns, but `fetched_at='2026-05-25T10:00:00Z'` (28 hours ago from 2026-05-28T10:00:00Z reference time)

**Critical sub-case (brief §11 R-2 risk):**
- ALSO test with millisecond timestamp: `fetched_at='2026-05-28T10:00:00.456Z'` (fresh but with milliseconds)
- Verify RFC3339Nano parser correctly reads it (RFC3339 would fail silently and treat as stale)
- Expected: map contains live values (parser works)

**Execute:**
- Call `fetchCommodityPricesFromDB(ctx, db, 26*time.Hour)` with stale timestamp
- Verify returned map is empty: `{}`

**Acceptance:** Stale row returns empty map. Millisecond sub-case parses correctly (live values returned despite .456Z suffix).

---

### AC-6: T-MLP-3 — Infrastructure test: empty table or missing 'yahoo' row
**Status:** TODO  
**Evidence:** go test output (repositories_test.go T-MLP-3)

Test that fetchCommodityPricesFromDB returns empty map when:
- `commodity_prices` table exists but has no rows
- `commodity_prices` table has rows but none with `source='yahoo'` (e.g. only `source='macro-snapshot'`)

**Setup (case A — empty table):**
- Create in-memory DB
- Create `commodity_prices` table with schema, insert zero rows

**Setup (case B — only 'macro-snapshot' source):**
- Create in-memory DB
- Insert one row with `source='macro-snapshot'` (not 'yahoo')

**Execute:**
- Call `fetchCommodityPricesFromDB(ctx, db, 26*time.Hour)` for both cases
- Verify both return empty map: `{}`

**Acceptance:** Both cases return empty map. Query filter `WHERE source='yahoo'` is enforced.

---

### AC-7: Partial NULL columns return omitted keys
**Status:** TODO  
**Evidence:** go test output + code review

Test that partial NULL columns are correctly omitted from the returned map.

**Setup:**
- Create in-memory DB
- Insert one row: `brent_crude_usd=96.0`, `gold_usd_per_oz=NULL`, `usd_vnd_rate=26150.0`, `fetched_at=<fresh>`

**Execute:**
- Call `fetchCommodityPricesFromDB(ctx, db, 26*time.Hour)`
- Verify returned map: `{"OIL": 96.0, "USDVND": 26150.0}` (no "GOLD" key)

**Acceptance:** Partial NULL columns correctly omitted. Per-commodity fallback in application layer will fire for the missing key.

---

### AC-8: DB connection defer cleanup and error returns
**Status:** TODO  
**Evidence:** code review + go test output

Verify `FetchPrices()` properly closes the DB connection even on early return, matching the existing `FetchVNIndex()` pattern.

**Implementation check:**
- After `sql.Open()`, immediately `defer db.Close()` before any early return path
- Use `//nolint:nilerr` convention for intentional `(nil, nil)` returns per brief §11 R-3

**Acceptance:** Code review shows `defer db.Close()` at top of method. No connection leaks on error paths.

---

### AC-9: Existing tests still pass (fixture-mode gate)
**Status:** TODO  
**Evidence:** go test ./pkg/infrastructure/... exit 0

All existing infrastructure tests must remain green. The new SQLiteCommodityRepository does not affect existing `HTTPCommodityFetcher` or other repository tests.

**Execute:**
```bash
cd apps/macro-indicators && go test ./pkg/infrastructure/...
```

**Acceptance:** Exit code 0, zero test failures.

---

## Implementation Notes

### File modifications
- **Add to `apps/macro-indicators/pkg/infrastructure/repositories.go`:**
  - SQLiteCommodityRepository struct
  - NewSQLiteCommodityRepository() constructor
  - FetchPrices() method
  - fetchCommodityPricesFromDB() helper
  - ~70 lines of code (per brief §10)

- **Add to `apps/macro-indicators/pkg/infrastructure/repositories_test.go`:**
  - Extend `newInMemoryDB()` helper with `commodity_prices` table schema (per brief §11)
  - T-MLP-1, T-MLP-2 (incl. R-2 millisecond sub-case), T-MLP-3 (case A + case B) tests
  - Partial NULL columns test
  - ~80 lines of test code (per brief §10)

### Schema for in-memory test DB
Per brief §11, add this to the `newInMemoryDB()` helper or a dedicated test setup:

```sql
CREATE TABLE commodity_prices (
    source          TEXT PRIMARY KEY,
    brent_crude_usd REAL,
    gold_usd_per_oz REAL,
    usd_vnd_rate    REAL,
    fetched_at      TEXT
)
```

### Dependency on existing code
- Uses existing domain `CommodityFetcherPort` interface (pkg/domain/ports.go — no change)
- Mirrors existing `SQLiteMarketIndexRepository` pattern (for code review consistency)
- Mirrors existing `fetchVNIndexFromDB()` test helper pattern

---

## Success Metrics

1. All 9 ACs above verified PASS
2. go test ./pkg/infrastructure/... exits 0 (new + existing tests)
3. Code compiles (go build ./...)
4. Brief §7 contract and §11 risk mitigations (R-1 NullFloat64, R-2 RFC3339Nano, R-3 defer close) all present
5. SQLiteCommodityRepository ready for composition root wiring (MLP-D3)

---

## Rollback / Revert Plan

If this task fails:
1. `git checkout -- apps/macro-indicators/pkg/infrastructure/repositories.go` (revert struct/method additions)
2. `git checkout -- apps/macro-indicators/pkg/infrastructure/repositories_test.go` (revert test additions)
3. Fixture mode remains unaffected (HTTPCommodityFetcher still available for composition root)

---

## Notes

- **R-2 Risk (RFC3339Nano):** The millisecond sub-case in T-MLP-2 is CRITICAL. If the parser is wrong, all rows will be treated as stale in production, re-introducing the bug this sprint exists to fix.
- **Fixture-mode backward compatibility:** Do NOT modify HTTPCommodityFetcher or existing port interface. New SQLiteCommodityRepository is a pure addition. Fixture mode remains default (env gate selects in composition root, MLP-D3).
- **Zone isolation:** All work stays in apps/macro-indicators/. No changes to mcp-server, docker-compose.yml, or other zones.
- **Commit safety:** Explicit-file staging only; `git add apps/macro-indicators/pkg/infrastructure/repositories.go apps/macro-indicators/pkg/infrastructure/repositories_test.go`

---

## Next Step

After this task DONE:
- Main terminal commits: `feat(macro-indicators): MLP-D1 — SQLiteCommodityRepository + infra tests T-MLP-1/2/3`
- Dispatch MLP-D2 (application tests for resolveMarketPrices)
