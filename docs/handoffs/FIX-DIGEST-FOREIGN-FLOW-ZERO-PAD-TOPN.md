---
task_id: FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN
type: FIX
title: Foreign flow top-5 padded with zero-net rows
priority: P2
severity: MEDIUM
zone: apps/mcp-server/
dev_agent: dev-mcp-server
created_at: 2026-06-21T00:00:00Z
created_by: pm
status: TODO
blocked_by: []
blocks: []
---

## Summary

Fix the Khối ngoại (foreign flow) section in evening digest. The top-5 query ranks by absolute net volume but never excludes zero-net rows, so the digest renders meaningless 0.000k padding lines (ACV, DFF, HBC). Add `<> 0` filter to the SQL; tighten allZero formatter to catch partial-zero cases.

## PM — Work Order

### Root Cause

In `assembleEveningSummary.ts` Step 4b, the foreign flow top-5 query is:
```sql
SELECT code, foreign_net_vol
FROM vnstock_trading_stats
WHERE date = (SELECT MAX(date) FROM vnstock_trading_stats)
ORDER BY ABS(foreign_net_vol) DESC
LIMIT 5
```

**Problem:** No `AND foreign_net_vol <> 0` filter. When the DB has few nonzero foreign movers (e.g., 2026-06-19: only 2 tickers with nonzero flow), the query pads with zero rows.

Example (2026-06-19):
- Real data: MWG +35469, VNH -40
- Query result: MWG +35469, VNH -40, ACV 0, DFF 0, HBC 0 (3 zeros)
- Digest output: lists all 5 as "Khối ngoại:" including "ACV 0.000k", "DFF 0.000k" (meaningless)

The `formatForeignFlowSection` allZero guard only fires if **ALL** movers are zero, so it misses the partial-zero case (MWG!=0 → guard skips).

**Note on scale:** The unit is correct (k = thousands of shares). VNH -40 shares = 0.040k. Scale claim is DISMISSED; the issue is padding, not mislabeling.

### Fix Spec

**Fix in:** `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` (Step 4b SQL)

**Change 1: Add zero-filter to SQL**
```sql
SELECT code, foreign_net_vol
FROM vnstock_trading_stats
WHERE date = (SELECT MAX(date) FROM vnstock_trading_stats)
  AND foreign_net_vol <> 0        -- NEW: exclude zero-net rows
ORDER BY ABS(foreign_net_vol) DESC
LIMIT 5
```

Rationale: Ranks only real movers. If <5 nonzero exist, renders only real values or "no data" message.

**Change 2: Tighten allZero formatter guard** (optional, defensive)
File: `apps/mcp-server/src/scheduler/briefings/eveningSummaryJob.ts` → `formatForeignFlowSection`

Current:
```typescript
if (movers.every(m => m.foreign_net_vol === 0)) {
  return "Khối ngoại: dữ liệu không có";
}
```

Better (defensive):
```typescript
const nonZeroMovers = movers.filter(m => m.foreign_net_vol !== 0);
if (nonZeroMovers.length === 0) {
  return "Khối ngoại: dữ liệu không có";
}
// Render only nonZeroMovers
return formatMovers(nonZeroMovers);
```

Rationale: If SQL change doesn't fire (edge case), formatter catches it anyway.

### Files to Edit
- `apps/mcp-server/src/application/usecases/assembleEveningSummary.ts` (Step 4b, ~3 lines)
- `apps/mcp-server/src/scheduler/briefings/eveningSummaryJob.ts` (formatForeignFlowSection, ~5 lines, optional but recommended)

### Verification Gate

**LIVE evening-digest verification:**

1. **No zero-padding:** Run evening_summary on a day with <5 foreign movers (e.g., a weekend or low-volume day)
   - Expected: Khối ngoại section lists ONLY the real movers (e.g., 2 tickers if 2 exist)
   - Expected: No 0.000k padding lines
   - Verify: count rendered lines vs DB nonzero rows (should match)

2. **Normal case:** Run on a day with ≥5 foreign movers
   - Expected: top-5 lists 5 movers, all nonzero
   - Verify: no 0.000k in output

3. **All-zero edge case:** Manually set all vnstock_trading_stats foreign_net_vol = 0 for test date
   - Expected: Khối ngoại shows "dữ liệu không có" (no data message)
   - Cleanup: restore real data

### Rebuild Required
**Yes.** Code change in assembleEveningSummary.ts + eveningSummaryJob.ts. Rebuild after merge.

### Risk Propagation
None identified. This is a formatter hygiene fix (removes garbage data). Zero risk to other subsystems.

### Handoff Notes
- The SQL change is the critical fix; the formatter change is defensive
- Test on a real evening cycle with live DB (not just a fixture with fabricated data)
- Scale (k = thousands) is CORRECT per live data audit — do NOT change scale logic
- After fix, the foreign flow section will only show real movers, making the digest more concise + honest

## NEXT Agent
**qa** — run full suite, verify no regression on existing evening summary / foreign flow tests, mark DONE.

---

## Developer

**Agent:** dev-mcp-server
**Status:** REVIEW (impl complete, tests green)

### Changes Made

**Change 1 — SQL Step 4b** (`assembleEveningSummary.ts`, line ~663):
Added `AND foreign_net_vol <> 0` to the WHERE clause of the `daily_ohlcv` query so zero-net rows are excluded before `LIMIT 5`. DB path only; injected `getForeignFlowMoversFn` bypasses this.

**Change 2 — formatForeignFlowSection** (`eveningSummaryJob.ts`, ~line 222):
Replaced the old `allZero` guard with a `nonZeroMovers = movers.filter(m => m.foreignNetVol !== 0)` pre-filter. Renders only `nonZeroMovers`; falls back to `"Khối ngoại: dữ liệu không có"` when the filtered set is empty. The header now says `top N` where N = actual nonzero count, not the padded 5.

### Tests

New file: `apps/mcp-server/src/__tests__/FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN.test.ts`
14 tests, 6 describe blocks:
- T-1: partial-zero DB (2 nonzero + 3 zero) → assembleEveningSummary returns 2 movers only
- T-2: all-zero DB → assembleEveningSummary returns 0 movers
- T-3: formatter partial-zero list → only 2 lines rendered, ACV/DFF/HBC absent
- T-4: formatter all-zero list → "dữ liệu không có" message
- T-5: formatter 5 nonzero → all 5 present, correct header
- T-6: formatter empty array → []

### Gate Results

- `bun test FIX-DIGEST-FOREIGN-FLOW-ZERO-PAD-TOPN.test.ts`: 14 pass, 0 fail
- `bun tsc --noEmit`: EXIT 0
- `pnpm check`: EXIT 0

### Constraint Compliance

- Scale logic untouched (k = thousands of shares is correct)
- TA loop in assembleEveningSummary.ts untouched (Step 4, no overlap with Step 4b)
- No container rebuild issued (batched per PM instruction)

---

## Acceptance Criteria

- [ ] SQL Step 4b: added `AND foreign_net_vol <> 0` to WHERE clause
- [ ] formatForeignFlowSection: filter movers to nonZero before rendering
- [ ] Test fixture: partial-zero case (2 nonzero, 3 would-be-padding) → only 2 lines rendered
- [ ] Test fixture: all-zero case → "dữ liệu không có" message
- [ ] Test fixture: 5+ nonzero case → top-5 all nonzero
- [ ] LIVE evening cycle: Khối ngoại shows no 0.000k padding lines
- [ ] Rebuild successful + tests pass

---

## PM Checklist

- [x] Task decomposed from PO triage + architect brief
- [x] Files enumerated (2 files, same zone as TASK-RSIFIX-2)
- [x] Verification gate defined (LIVE digest, no zero-padding)
- [x] Rebuild required: Yes
- [x] **Conflict note:** Shares assembleEveningSummary.ts with TASK-RSIFIX-2 → MUST serialize after Wave 1
- [x] Handoff created
- [x] WIP slot: Wave 2 (after TASK-RSIFIX-2 completes)

