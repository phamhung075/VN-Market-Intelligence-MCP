---
sprint: SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP
branch: task/pec-prep-getlr
size: S
zone: apps/mcp-server/
depends_on: []
blocks: [TASK-PEC-FR1]
---

## TLDR

Add defensive `try { } catch` guard to `getLikelihoodRatios()` (plural) in `likelihoodRatioStore.ts` to match the existing guard pattern of its singular sibling `getLikelihoodRatio()`. Without this guard, FR-1's new code will throw a hard SQL error when the test fixture is missing the `evidence_likelihood_ratios` table, even though the fixture has been set up correctly (task TASK-PEC-PREP-FIXTURES handles adding the table DDL).

## [PM] Planning Context

**Zone:** apps/mcp-server/

**Acceptance Criteria:**
- [ ] `getLikelihoodRatios()` function (line 122-144) now wraps its query in `try { } catch { return [] }` (empty array on error, matching the neutral-prior contract)
- [ ] The guard uses the SAME comment pattern as `getLikelihoodRatio()` (singular, line 161-185): `"never throw even if table is missing in some edge case"`
- [ ] Return type for the catch case is consistent: `LikelihoodRatioRow[]` (empty array if error)
- [ ] Existing callers of `getLikelihoodRatios` (grep for calls to this function) now robustly handle missing/corrupted tables without crashing tests or production
- [ ] All existing tests for likelihoodRatioStore stay green (structure of happy-path queries unchanged)

**Files to read first:**
- `apps/mcp-server/src/infrastructure/db/likelihoodRatioStore.ts:161-185` (reference the existing singular `getLikelihoodRatio` guard pattern)
- `docs/handoffs/SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP-BA-spec.md` [Architect] Brownfield Findings §Regression-risk finding (first bullet, getLikelihoodRatios hardening)

**Files to create:** None

**Files to modify:**
- `apps/mcp-server/src/infrastructure/db/likelihoodRatioStore.ts:122-144` (getLikelihoodRatios function)

**Dependencies:** None

**Knowledge needed:**
- `docs/policies/dev-standards.md`
- Existing try/catch pattern in `getLikelihoodRatio()` (same file)

---

## Technical Details

### Current Code Problem

`getLikelihoodRatios()` at line 122-144 looks like:
```typescript
export async function getLikelihoodRatios(db: Database, ...): Promise<LikelihoodRatioRow[]> {
  const rows = db.prepare("SELECT ... FROM evidence_likelihood_ratios WHERE ...").all();
  return rows;
}
```

There is NO try/catch. If the `evidence_likelihood_ratios` table doesn't exist (edge case, missing during test fixture setup), the call throws a hard error.

### What to Add

Wrap the query in defensive error handling, following the pattern from `getLikelihoodRatio()` (singular, same file, lines 161-185):

```typescript
export async function getLikelihoodRatios(db: Database, ...): Promise<LikelihoodRatioRow[]> {
  try {
    const rows = db.prepare("SELECT ... FROM evidence_likelihood_ratios WHERE ...").all();
    return rows;
  } catch {
    // never throw even if table is missing in some edge case
    return [];
  }
}
```

### Rationale

**Why this matters:**
- FR-1 (evidenceAccumulatorJob) will call `getLikelihoodRatios()` for every stock and evidence type in the nightly run
- Test fixtures initially may not have the table; the neutral-prior contract says "if no LR row exists, treat as 1.0"
- Returning an empty array `[]` triggers the neutral-prior guard in the caller (FR-1), so the code behaves correctly: `selectLikelihoodRatio([])` → no rows → neutral 1.0 LR
- This fix also retroactively hardens an existing production code path that was already unguarded

### Verification

Run `npm test -- likelihoodRatioStore.test.ts` (if it exists) and `npm test -- 1118-evidence-accumulator-job.test.ts` to confirm:
- No SQL errors even when table is missing in some fixture variants
- Existing exact-value assertions remain unchanged
- Happy path (table exists with rows) still works identically

---

## Notes

- This is a defensive, low-risk fix that only affects error paths (happy path logic unchanged)
- It aligns with the existing pattern in the same file (`getLikelihoodRatio` singular already has this guard)
- By doing this now, we prevent cascading issues when FR-1 is integrated and tested

