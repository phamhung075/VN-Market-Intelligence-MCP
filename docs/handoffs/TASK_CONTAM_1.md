---
agent: dev-mcp-server
task_id: CONTAM_1
sprint: OHLCV-UNIT-CONTAM
status: ASSIGNED
assigned_at: 2026-06-12T11:00:00Z
sequence: 1 (foundational)
---

# TASK CONTAM-1: Create `ohlcvUnitGuard.ts` domain service + unit tests

## Summary

Implement a pure domain service `ohlcvUnitGuard.ts` that validates OHLCV values conform to full-VND unit invariant. This is the foundational guard used by all five writers (A, B, C, D, E) before upserting rows. All downstream tasks (CONTAM-2..6) depend on this.

## Files to Create

### Primary
- `apps/mcp-server/src/domain/services/ohlcvUnitGuard.ts`
- `apps/mcp-server/src/__tests__/unit/ohlcvUnitGuard.test.ts`

## Acceptance Criteria

### ohlcvUnitGuard.ts Function Signature
```typescript
export interface OhlcvValidationResult {
  valid: boolean;
  reason?: string; // e.g., "open_below_100", "hilo_ratio_too_wide"
}

export function validateOhlcvUnit(
  code: string,
  type: "stock" | "index",
  open: number,
  high: number,
  low: number,
  close: number
): OhlcvValidationResult

export interface Ohlcv { open: number; high: number; low: number; close: number }

// Pure scale-normalizer used by Writers D/E (VNDIRECT thousand-VND → full-VND).
// Detects thousand-scale (stock value below the 100-VND floor) and multiplies the
// WHOLE row by 1000 so internal OHLC relationships are preserved. Full-VND input is a
// no-op. Indices are returned unchanged. No I/O, no logging.
export function normalizeOhlcvToVnd(
  type: "stock" | "index",
  v: Ohlcv
): Ohlcv
```

### normalizeOhlcvToVnd rules (REQUIRED by CONTAM-4 — binding amendment)
1. `type="index"` → return `v` unchanged.
2. `type="stock"` → if the row is thousand-scale, multiply ALL of open/high/low/close by 1000; else return unchanged.
   - Scale detection: treat the row as thousand-scale when its representative magnitude (e.g. `max(open,high,low,close)`) is `> 0` and `< 100` (the stock VND floor). Scale the WHOLE row by the same factor — NEVER scale individual fields independently (that is the original contamination bug).
   - A zero/empty row is returned unchanged (let `validateOhlcvUnit` reject it).
3. Pure function — no logging, no I/O. Caller validates the normalized result.

### Validation Rules
1. **Stock range guard:** For `type="stock"`, all four OHLC values MUST be in `[100, 10_000_000]` (VND)
   - Rationale: 100 = minimum VN stock price (catches thousand-VND leakage); 10M = above any known VN stock
   - Reject row + log: "unit contamination: {code} {value} out of range"

2. **Index exemption:** For `type="index"`, skip range check (VNINDEX ~1200 is valid)

3. **Plausibility check:** `low ≤ open ≤ high` AND `low ≤ close ≤ high`
   - Reject if violated + log: "implausible ohlc: {code} low={low} open={open} high={high} close={close}"

4. **High/Low ratio sanity:** `high / low ≤ 5` (catches extreme swings)
   - Reject if `high / NULLIF(low, 0) > 5` + log: "hilo_ratio_too_wide: {code} {ratio}"

5. **Zero guard:** Reject any zero value (open/high/low/close = 0 is invalid market data)
   - Log: "zero_ohlc: {code} field={field}"

### Return Value
- `{ valid: true }` if all checks pass
- `{ valid: false, reason: "specific_reason" }` if any check fails
  - Caller must decide whether to skip or throw (fail-loud pattern)

### Test Coverage (unit/ohlcvUnitGuard.test.ts)
- [ ] Stock in range [100, 10M] → valid
- [ ] Stock < 100 (thousand-VND detected) → invalid + reason contains "below_100"
- [ ] Stock > 10M → invalid
- [ ] Index ~1200 → valid (no range check)
- [ ] Inverted OHLC (close < low) → invalid
- [ ] Zero open → invalid
- [ ] High/Low ratio = 6 (> 5 threshold) → invalid
- [ ] High/Low ratio = 5 (boundary) → valid
- [ ] Edge case: open=100, close=10_000_000 (maximum span within valid range) → valid
- [ ] normalizeOhlcvToVnd: stock thousand-scale row {0.9,1.0,0.9,1.0} → {900,1000,900,1000} (×1000 whole row)
- [ ] normalizeOhlcvToVnd: stock full-VND row {62300,62800,61700,62200} → unchanged (no-op)
- [ ] normalizeOhlcvToVnd: index row {1200,1210,1190,1205} → unchanged
- [ ] normalizeOhlcvToVnd: whole-row scaling preserves low≤open/close≤high (never per-field scale)

### Notes
- Pure function, no I/O or logging internals
- Callers (Writers A, B, C, D, E) will handle logging + row skip logic
- Callers pass `type` as string; validate via comparison, not casting
- No dependencies outside `domain/services/`

## Definition of Done

- [ ] `ohlcvUnitGuard.ts` file created, exports `validateOhlcvUnit` and `OhlcvValidationResult`
- [ ] All unit tests in `ohlcvUnitGuard.test.ts` pass (bun test --run src/__tests__/unit/ohlcvUnitGuard.test.ts)
- [ ] Manual smoke: code inspection confirms pure function, no I/O, no external deps
- [ ] Commit with message format: `feat(domain): ohlcvUnitGuard pure validation service + 8-case unit tests`

## Zone & DDD Layer
- **Zone:** `apps/mcp-server/src/domain/services/`
- **DDD:** Domain layer (pure function, no infrastructure/I/O)

## Related Architecture Brief
- `docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md` § Decision 2

## Blockers
None (foundational task).

## Dispatch Notes
- Independent, can start immediately
- All downstream CONTAM-2..7 tasks await this task's commit before merging their code

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:** NONE
- **Files created:**
  - `apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts:114` — pure domain service: validateOhlcvUnit (5 rules) + normalizeOhlcvToVnd (whole-row scale) + OhlcvValidationResult/Ohlcv interfaces + exported constants
  - `apps/mcp-server/src/__tests__/unit/ohlcvUnitGuard.test.ts:162` — 17 unit test cases (3 describe blocks)
- **Tests written:** `apps/mcp-server/src/__tests__/unit/ohlcvUnitGuard.test.ts` — 17 assertions, GREEN
- **Git commits:** (see below)
- **Type check:** clean (bun tsc --noEmit — exit 0)
- **bun test:** 17 pass / 0 fail (targeted: `bun test src/__tests__/unit/ohlcvUnitGuard.test.ts`)
- **Tool count:** 157 tools — matches pre-task baseline
- **Scheduler count:** 78 cron.schedule entries — matches pre-task baseline (baseline 76 per FIX-PROJECT-STATS-GENERATED, updated to 78 after REAUDIT cycle)
- **Docs updated:** NONE (pure domain service, no architecture docs require update)
- **Graphify:** skipped (no docs impacted)

### G12 Gate Evidence

| Gate | Command | Result |
|------|---------|--------|
| bun test (targeted) | `bun test src/__tests__/unit/ohlcvUnitGuard.test.ts` | 17 pass / 0 fail |
| tsc | `bun tsc --noEmit` | exit 0 (clean) |
| Tool count | `bun scripts/gen-project-stats.ts --dry-run \| grep toolCount` | 157 (unchanged) |
| Scheduler count | `grep -rc cron.schedule apps/mcp-server/src/scheduler/ \| awk sum` | 78 (unchanged) |

Zone health: bun test 17 pass 0 fail, tsc clean, 157 tools intact, 78 cron.schedule (unchanged) | HEALTHY
