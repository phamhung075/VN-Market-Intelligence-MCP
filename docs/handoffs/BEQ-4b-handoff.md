---
task_id: BEQ-4b
task_title: "refine_status guard in buildComparisonSection (withhold YoY when prior PENDING)"
task_type: FIX
task_size: XS
task_owner: dev-mcp-server
task_zone: apps/mcp-server/
sprint: BCTC-EXTRACT-QUALITY
depends: ["BEQ-1-SPIKE"]
acceptance_criteria:
  - "Guard implemented in buildComparisonSection (bctcFullTools.ts:229-300) to detect refine_status=PENDING on prior-period row"
  - "When prior row is PENDING, comparison section returns a message withheld message instead of stale values"
  - "Two-line fix, fully separable from BCTC-LAYOUT-FIRST re-architecture"
success_proof:
  - "Run get_bctc_full for FPT after guard ships (prior period FPT 2025-Q4 refine_status=PENDING) → comparison section withheld message displayed, no garbage YoY contamination"
  - "Integration test: direct in-container bun:sqlite read proves prior-row refine_status checked, not just HTTP echo"
  - "No regression: FPT 2026-Q1 prior is still PENDING (same corpus), but once BEQ-2 refine backfill runs, FPT 2025-Q4 →DONE and comparison auto-resumes"

---

## Task Context

**Root cause:** `buildComparisonSection` (bctcFullTools.ts:229-300) auto-selects the most recent prior-period row with NO refine_status guard. FPT 2025-Q4 is a legacy OCR-parse row (`refine_status=PENDING`) where `net_profit=net_revenue÷1000` due to a unit-scale bug. This produces a YoY result of +12146% (20,225M → 2,476,790M), which is a contamination artifact.

**Why this task first:** It is a 2-line serve-side guard, independent of the refine-trigger fix (BEQ-2), and closes the contamination symptom immediately without waiting for refine backfill.

**Evidence from brief:**
```
FPT 2025-Q4 (prior period for YoY comparison):
  extraction_method=pdf-parse  (NOT refined)
  refine_status=PENDING
  net_profit=20,225 million VND  (= net_revenue ÷ 1000)
  net_revenue=20,225,450 million VND
→ FPT 2026-Q1 YoY: +12146% (garbage)
```

---

## Code Location

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`
**Function:** `buildComparisonSection` (lines 229–300)

**Change:**
```typescript
// Existing code auto-picks prior row
const priorRow = ...await db.get(
  `SELECT * FROM financial_reports ... ORDER BY sort_key DESC LIMIT 1`
);

// ADD THIS GUARD:
if (priorRow && priorRow.refine_status === "PENDING") {
  return `=== QoQ/YoY COMPARISON ===\nPeriod prior (${priorRow.sort_key}) data not yet refined — comparison withheld to avoid contamination.`;
}

// Continue with existing comparison logic
```

**Why XS scope:**
- Minimal code change (2-line condition + early return)
- No new schema, no new tables, no refactor
- Fully reversible when refine_status changes to DONE

---

## Testing & Verification

### DV-1: Smoke test with FPT (live test ticket)
1. Get `FPT` via `get_bctc_full` with code "FPT"
2. **Before fix:** Response includes "FPT YoY comparison +12146%" garbage
3. **After fix:** Response shows "Period prior data not yet refined — comparison withheld" or similar message
4. **Verify via direct DB query:** `SELECT refine_status FROM financial_reports WHERE code='FPT' ORDER BY sort_key DESC LIMIT 2` — both rows shown, prior is PENDING

### DV-2: Integration proof (NO HTTP echo)
- Connect to running mcp-server container: `docker exec -it mcp-server /bin/bash`
- Query the database directly: `bun scripts/inspect-db.ts --query "SELECT code, sort_key, refine_status FROM financial_reports WHERE code='FPT' ORDER BY sort_key DESC LIMIT 2"`
- Verify that the guard logic matches the code, not a self-reported test

### Anti-false-green (unit test)
- Add a unit test in `bctcFullTools.test.ts` that mocks a prior row with `refine_status='PENDING'` and asserts the early return message is sent
- Verify the message does NOT include any numeric values from `priorRow`

---

## WIP & Serialization

**Zone:** apps/mcp-server (single git tree)
**Serialization:** Must complete BEFORE BEQ-2 ships (BEQ-2 refine backfill will transition PENDING→DONE, making this guard visible only on the next corpus refresh)

**No parallel risk:** This task touches only bctcFullTools.ts; no shared mutation with BEQ-4a or BEQ-3

---

## DoD Checklist

- [ ] Code change in bctcFullTools.ts (guard added, tested locally)
- [ ] mcp-server rebuilt + container running
- [ ] DV-1 smoke test (FPT tested live, guard prevents garbage YoY)
- [ ] DV-2 integration proof (direct DB query confirms prior refine_status checked, not HTTP echo)
- [ ] Unit test added (mocked PENDING prior → early return proven)
- [ ] No regression: intact FPT 2026-Q1 current-period metrics
- [ ] Commit message references architect brief 2026-06-02-bctc-extract-quality.md
- [ ] orch-state.json task marked DONE with commit SHA

---

## Related Artifacts

- **Architect Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality.md § FIX-3
- **Sprint:** BCTC-EXTRACT-QUALITY
- **Blocks:** Nothing (independent, serves as safety guard)
- **Blocked by:** BEQ-1-SPIKE (analysis complete)
