# TASK_MLP-D3 — Composition Root Env Gate (cmd/server/main.go)

**Task:** MLP-D3
**Sprint:** MACRO-LIVE-PRICES
**Owner:** dev-macro-indicators
**Zone:** apps/macro-indicators/
**Depends on:** MLP-D1 (SQLiteCommodityRepository exists), MLP-D2 (tests green)
**Blocks:** MLP-D4 (HTTP response DataSource field), MLP-D5 (docker-compose + final verification)
**Priority:** HIGH
**Date:** 2026-05-28
**Architect ref:** docs/architecture-briefs/2026-05-28-macro-live-prices.md §8, §11

---

## Overview

Wire the COMMODITY_LIVE_MODE env-gate in `cmd/server/main.go` at the composition root. This is the ONLY file-change to main.go per the architect brief.

The env gate selects which concrete adapter implements `domain.CommodityFetcherPort`:
- **COMMODITY_LIVE_MODE unset or `false`:** use HTTPCommodityFetcher (fixture mode, deterministic for sandbox)
- **COMMODITY_LIVE_MODE=`true`:** use SQLiteCommodityRepository (live DB read)

---

## Acceptance Criteria

### AC-1: Env-gate wiring in cmd/server/main.go
**Status:** TODO  
**Evidence:** code review + git diff

Replace the existing single-line wiring with an env-gate branch, EXACTLY per brief §8:

**Current code (to be replaced):**
```go
commodityFetcher := infrastructure.NewHTTPCommodityFetcher("")
```

**New code (per brief §8):**
```go
// DI wiring: select commodity adapter based on COMMODITY_LIVE_MODE env gate.
var commodityFetcher domain.CommodityFetcherPort
if os.Getenv("COMMODITY_LIVE_MODE") == "true" {
    commodityFetcher = infrastructure.NewSQLiteCommodityRepository()
} else {
    commodityFetcher = infrastructure.NewHTTPCommodityFetcher("")
}
```

**Implementation notes:**
- No other changes to main.go
- The block replaces ONLY the single commodityFetcher := line
- All other wiring untouched
- Variable declaration + conditional assignment (not constant assignment)
- Use `os.Getenv("COMMODITY_LIVE_MODE")` to read env var (returns "" if unset)
- String comparison `== "true"` is exact per brief §8

**Acceptance:** Brief §8 code block present and exact. Only this change in main.go.

---

### AC-2: T-MLP-9 — Composition test: COMMODITY_LIVE_MODE unset defaults to HTTPCommodityFetcher
**Status:** TODO  
**Evidence:** code inspection (no env var → false path)

Verify that when COMMODITY_LIVE_MODE is unset or empty, the fixture adapter is wired.

**Implementation approach:**
- This is a composition/integration concern, not a unit test
- If a full integration test is not feasible for this sprint, a code-review check suffices:
  - Inspect the conditional: `if os.Getenv("COMMODITY_LIVE_MODE") == "true"` 
  - When env var is unset, `os.Getenv` returns `""` (empty string)
  - `"" == "true"` is false → else branch (HTTPCommodityFetcher) fires
  - Fixture mode is default

**Acceptance:** Code structure confirms: unset env → else branch → HTTPCommodityFetcher wired. Fixture mode is default.

---

### AC-3: T-MLP-10 — Composition test: COMMODITY_LIVE_MODE=true wires SQLiteCommodityRepository
**Status:** TODO  
**Evidence:** code inspection (true value → true path)

Verify that when COMMODITY_LIVE_MODE=true, the live DB adapter is wired.

**Implementation approach:**
- Code-review check:
  - Conditional: `if os.Getenv("COMMODITY_LIVE_MODE") == "true"`
  - When env var is set to "true", the condition is true → if branch (SQLiteCommodityRepository) fires
  - Live mode is activated

**Acceptance:** Code structure confirms: COMMODITY_LIVE_MODE=true → if branch → SQLiteCommodityRepository wired. Live mode is activated.

---

### AC-4: No business logic in main.go
**Status:** TODO  
**Evidence:** code review

Verify the env gate is PURELY a DI adapter selection. No business logic lives in the conditional.

- The conditional is trivial: string comparison
- Both NewHTTPCommodityFetcher() and NewSQLiteCommodityRepository() are constructors (side-effect-free)
- No branching in application/domain logic

**Acceptance:** Env gate is a pure adapter selector, no business logic in main.go.

---

### AC-5: go build and basic integration test pass
**Status:** TODO  
**Evidence:** go build ./cmd/server/... exit 0, existing integration tests green

Verify the change compiles and does not break existing code paths.

**Execute:**
```bash
cd apps/macro-indicators && go build ./cmd/server/... 
```

**If integration tests exist in the service:**
```bash
cd apps/macro-indicators && go test ./cmd/server/... 
```

**Acceptance:** Build succeeds, existing tests green.

---

### AC-6: Fixture-mode tests still pass (no env var set during test)
**Status:** TODO  
**Evidence:** go test ./... exit 0 (from MLP-D5 final verification)

The test suite runs with no COMMODITY_LIVE_MODE set, so the else branch (HTTPCommodityFetcher) is always used. All existing deterministic tests remain green.

This AC is verified in MLP-D5 (docker-compose + final verification), but the composition wiring here must be correct for tests to pass.

**Acceptance:** (Deferred to MLP-D5 final go test ./... verification)

---

## Implementation Notes

### File modification
- **`apps/macro-indicators/cmd/server/main.go`:**
  - Find the line: `commodityFetcher := infrastructure.NewHTTPCommodityFetcher("")`
  - Replace with the brief §8 block (3–6 lines including variable declaration + if/else)
  - Net change: ~5–8 lines (one line removed, 6 lines added for the conditional)

### Imports already present
- `os` package is already imported (env var read)
- `domain` and `infrastructure` packages are already imported (type assertions, constructors)

### No other changes to main.go
- All other wiring remains untouched
- This is a minimal, surgical change

### Env gate default: fixture mode
- When COMMODITY_LIVE_MODE is unset (default in sandbox/tests), HTTPCommodityFetcher is wired
- Fixture mode is backward-compatible with all existing tests
- Live mode requires explicit opt-in via env var

---

## Success Metrics

1. All 6 ACs above verified PASS
2. go build ./cmd/server/... exits 0
3. Brief §8 code block present and exact
4. No other changes to main.go
5. Fixture-mode tests still pass (verified in MLP-D5)

---

## Rollback / Revert Plan

If this task fails:
1. `git checkout -- apps/macro-indicators/cmd/server/main.go` (revert env gate wiring)
2. Fixture mode remains active (original single-line wiring restored)
3. MLP-D1 and MLP-D2 tests still valid

---

## Notes

- **Minimal change:** This is a ~6-line change to a single file. Very low risk.
- **Backward compatible:** Fixture mode is default when env var unset. All existing tests remain green.
- **Pure DI:** The env gate is a dependency-injection selection, not business logic.
- **Zone isolation:** All work stays in apps/macro-indicators/cmd/. No changes to other files.
- **Commit safety:** Explicit-file staging: `git add apps/macro-indicators/cmd/server/main.go`

---

## Next Step

After this task DONE:
- Main terminal commits: `feat(macro-indicators): MLP-D3 — env-gate COMMODITY_LIVE_MODE in composition root`
- Dispatch MLP-D4 (HTTP response DataSource field)
