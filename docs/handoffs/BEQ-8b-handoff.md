# BEQ-8b Handoff — Extend BEQ-4a Guard to PARTIAL (net_profit=NULL)

**Task ID:** BEQ-8b  
**Title:** Extend BEQ-4a guard so /api/bctc-inspect/docs returns net_profit=NULL for PARTIAL too (not just PENDING)  
**Owner:** dev-mcp-server  
**Size:** XS (~30min)  
**Sprint:** BCTC-EXTRACT-QUALITY Phase-2  
**Arch Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md (§8, Risk Flag R-3)

---

## Context

BEQ-4a (commit 0523b435) added a guard in `/api/bctc-inspect/docs` that returns `net_profit=NULL` for tickers with `refine_status=PENDING`. This prevents serving garbage legacy values.

After BEQ-5/6/7/8 ship, tickers that were PENDING will transition to either:
- **PENDING** (0 rows still) → net_profit already null
- **PARTIAL** (balance-sheet-only rows) → legacy garbage value still in DB → must be null (same reasoning as PENDING)
- **DONE** (complete three-section rows) → safe to serve

This task **extends the BEQ-4a guard** to also null-out net_profit for PARTIAL status, because PARTIAL rows cannot yet produce valid secondary financials.

---

## Acceptance Criteria

### AC-1: Verify Current BEQ-4a Guard Location
- **File:** `apps/mcp-server/src/interface/mcp/handlers/bctcInspectHandler.ts` (from BEQ-4a commit 0523b435)
- **Method:** The SELECT or CASE-WHEN that constructs the list response
- **Current logic (expected):** `CASE WHEN refine_status='PENDING' THEN NULL ELSE net_profit END`
- **Locate this**: Search for the exact CASE-WHEN pattern or the location where net_profit is selected for /docs

### AC-2: Extend Guard to Include PARTIAL
- **New logic:**
  ```sql
  CASE 
    WHEN refine_status IN ('PENDING', 'PARTIAL') THEN NULL 
    ELSE net_profit 
  END AS net_profit
  ```
- **No other changes** to the guard
- **Verify:** The comparison is `IN ('PENDING', 'PARTIAL')` not a separate branch (DRY)

### AC-3: Test Deliberate Violation
- **File:** `apps/mcp-server/src/__tests__/BEQ-4a-extension.test.ts` or extend existing BEQ-4a test suite
- **DV-GUARD-4a-EXT-1:** ticker with `refine_status='PARTIAL'` → /docs returns `net_profit=NULL` (not legacy value)
- **DV-GUARD-4a-EXT-2:** ticker with `refine_status='DONE'` → /docs returns actual net_profit value
- **DV-GUARD-4a-EXT-3:** ticker with `refine_status='PENDING'` → /docs returns `net_profit=NULL` (unchanged)
- Must FAIL before (old code would show garbage for PARTIAL), PASS after

### AC-4: Verify No Other Guard Clobbering
- **Search** `bctcInspectHandler.ts` for all `net_profit` references
- **Ensure** no other code path bypasses the guard
- **Cross-check:** BEQ-4b guard (buildComparisonSection, withhold YoY for PARTIAL) is separate and independent

---

## Dependencies

- **Requires:** BEQ-4a already shipped (commit 0523b435 + 13dc04b9)
- **Requires:** BEQ-5/6/7/8 concepts (understands PARTIAL semantics)
- **Blocks:** BEQ-9, BEQ-10 (nice-to-have but not hard blocker; can ship slightly after BEQ-5..8)
- **Co-dependent:** BEQ-5, BEQ-6, BEQ-7, BEQ-8 (same image rebuild cycle)

---

## Implementation Notes

- **One-line change:** Just extend the IN clause from `('PENDING')` to `('PENDING', 'PARTIAL')`
- **Search strategy:** `git log -p 0523b435` to find exact location in current code
- **No DB schema change:** refine_status already accepts PARTIAL in enum
- **No downstream code change needed:** Consumers already handle NULL (from PENDING case)
- **Risk mitigation:** PARTIAL is now explicitly guarded alongside PENDING; no inconsistency

---

## Commit Format

```
fix(bctc): extend BEQ-4a guard to null-on-PARTIAL net_profit (BEQ-8b)

/api/bctc-inspect/docs now returns net_profit=NULL for both PENDING and
PARTIAL status. After BEQ-5/6/7/8, balance-sheet-only tickers transition
to PARTIAL; their legacy net_profit garbage must be withheld (same reason
as PENDING).

One-line change: CASE refine_status IN ('PENDING', 'PARTIAL') THEN NULL.

DV tests: BEQ-4a-extension.test.ts (PARTIAL→null, DONE→value, PENDING→null).

Task: BEQ-8b
Depends: BEQ-4a (0523b435)
```

---

## Handoff Checklist

- [ ] BEQ-4a commit (0523b435) located and verified
- [ ] IN clause extended to include PARTIAL
- [ ] No other net_profit selection paths exist
- [ ] DV tests written (3/3): PARTIAL null, DONE value, PENDING null
- [ ] Commit message follows format
- [ ] QA verifies before image rebuild

---

## RETURN

**Status:** Ready for dev-mcp-server dispatch (after BEQ-5 DONE; parallel with BEQ-6/7/8)  
**Blocker:** BEQ-4a completion (already shipped)  
**Next:** dev-mcp-server implements BEQ-8b; QA verifies; then seq gateway to BEQ-9/10 dispatch  
