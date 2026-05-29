<!-- size-justification: 60L — constant-to-timestamp inline replacement in single function; no new dependencies; test assertion scan + update -->

# DPI-2 — Carry/Yield ComputedAt: Replace Constant with time.Now()

**Sprint:** DATA-PIPELINE-INTEGRITY | **Zone:** `apps/macro-indicators/` | **Author:** pm | **Date:** 2026-05-30

---

## Context

`carry.computedAt` and `yield.computedAt` are hardcoded to `"2026-05-23T00:00:00Z"` (stale constant in `usecases.go`). Carry and yield sub-signals must reflect recompute timestamp at Execute() time.

**Architecture brief:** `docs/handoffs/DPI-ARCH.md` § DPI-2 (inline timestamp at Execute body).

---

## Specification

### Files to modify

1. **`apps/macro-indicators/pkg/application/usecases.go`** — delete `const fixtureComputedAt` (L44-45); inline `time.Now().UTC().Format(time.RFC3339)` at Execute() body where `CarryTradeInput` and `YieldSpreadInput` are populated.

### Implementation Approach

#### A. Delete constant

Remove L44-45:
```go
const fixtureComputedAt = "2026-05-23T00:00:00Z"
```

#### B. Inline timestamp in Execute()

In `Execute()` method, add one variable in the method body (after any early returns, before struct literals):
```go
computedAt := time.Now().UTC().Format(time.RFC3339)
```

Then replace both references:
```go
// BEFORE:
CarryTrade: carry.CarryTradeInput{..., ComputedAt: fixtureComputedAt},
YieldSpread: yld.YieldSpreadInput{..., ComputedAt: fixtureComputedAt},

// AFTER:
CarryTrade: carry.CarryTradeInput{..., ComputedAt: computedAt},
YieldSpread: yld.YieldSpreadInput{..., ComputedAt: computedAt},
```

**Note:** `time` package is already imported in `usecases.go` (used elsewhere at L124). No new import needed.

---

## Acceptance Criteria

1. **AC-1: Constant removed** — `const fixtureComputedAt` does not exist in source after commit.

2. **AC-2: time.Now() inline** — `computedAt := time.Now().UTC().Format(time.RFC3339)` present in Execute() method body.

3. **AC-3: Both references updated** — `CarryTradeInput.ComputedAt` and `YieldSpreadInput.ComputedAt` both use `computedAt` variable (not hardcoded string).

4. **AC-4: RFC3339 format** — timestamp format is RFC3339 (ISO 8601 with timezone), matching existing patterns in codebase.

5. **AC-5: Test assertion scan** — grep for `"2026-05-23"` in `usecases_test.go` and all macro-indicators test files; if any assertion found, update to regex/prefix match (e.g., `strings.HasPrefix(computedAt, "202")`). If no assertion found, document result.

6. **AC-6: Live carry/yield gate** — `get_macro_snapshot` carry.computedAt and yield.computedAt reflect today's date (2026-05-30 or later post-rebuild), not 2026-05-23.

---

## Testing

- Unit test: Execute() produces computedAt with today's date in RFC3339 format (regex: `^\d{4}-\d{2}-\d{2}T`).
- Integration: after rebuild, live `get_macro_snapshot` carry/yield sub-signals show fresh timestamps.

---

## DDD Layer

Application layer (constant lives in use-case, replacement stays in use-case body). No infrastructure or domain change.

---

## DoD (Definition of Done) — OPS + QA Gate

After dev commit and ops REBUILD:
- **QA GATE:** `get_macro_snapshot` carry.computedAt and yield.computedAt both show current date (2026-05-30), not stale 2026-05-23.
- **Verification:** live MCP tool probe.

---

## Related documents

- Architect brief: `docs/handoffs/DPI-ARCH.md`
- BA spec: `docs/REQ_DATA-PIPELINE-INTEGRITY.md`

---

## [Developer] Implementation — 2026-05-30

**Status:** DONE (zone tests GREEN, awaiting ops REBUILD + QA live probe)

### Files changed

1. `apps/macro-indicators/pkg/application/usecases.go`
   - Deleted `const fixtureComputedAt = "2026-05-23T00:00:00Z"` (lines 43-45 in original).
   - Added `computedAt := time.Now().UTC().Format(time.RFC3339)` at top of `Execute()` body.
   - Replaced both `fixtureComputedAt` references in `CarryTradeInput.ComputedAt` and `YieldSpreadInput.ComputedAt` with `computedAt` variable.
   - `time` package already imported (no new import needed).

2. `apps/macro-indicators/pkg/application/usecases_test.go`
   - Added `TestComputedAtIsCurrentTime` — verifies frozen constant does not appear, format is RFC3339, parsed timestamp is within Execute() window (AC-2, AC-3, AC-4).

### AC-5 test assertion scan

Scanned for `"2026-05-23"` in all macro-indicators test files. Result:
- `usecases_test.go`: ZERO matches — no assertion on the frozen constant. Safe to remove.
- Other test files (`macro_signals_test.go`, `macro_carry_trade_signal_test.go`, `macro_yield_spread_signal_test.go`) use `"2026-05-23T00:00:00Z"` as INPUT to primitives (not asserting on `computedAt` OUTPUT of Execute). These are unaffected — the primitive tests pass their own timestamp in, not the deleted constant.

### Frozen regime values — BLOCKER NOTE

`fixtureVNDDepositRate = 4.7`, `fixtureFedFundsRate = 5.33`, `fixtureEarningYield = 8.2` remain frozen constants in `usecases.go` (lines 38-40). These are the INPUT values for carry and yield primitives — not the `computedAt` timestamp. DPI-2 scope is `computedAt` only. If the carry/yield regime output is wrong because these inputs are stale, a separate task is needed to wire live SBV rates and earnings data into these fields. Surfacing to PO.

### Build/test result

```
go test ./... — ALL PASS (12 packages)
go vet ./...  — CLEAN
go build ./cmd/... — CLEAN
```

### NEXT: ops REBUILD (macro-indicators, AFTER mcp-server) → qa live probe (AC-6)
