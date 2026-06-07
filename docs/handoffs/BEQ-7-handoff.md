# BEQ-7 Handoff — Apply Section Guard in finalizeBctcRefineTool

**Task ID:** BEQ-7  
**Title:** Apply section guard in finalizeBctcRefineTool (incomplete→PARTIAL not DONE)  
**Owner:** dev-mcp-server  
**Size:** XS (~1.5h)  
**Sprint:** BCTC-EXTRACT-QUALITY Phase-2  
**Arch Brief:** docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md (§3, Decision A)

---

## Context

The `finalizeBctcRefineTool` is the **agentic refine output sink**. When the agentic fleet parses markdown refine output and produces new `bctc_table_rows`, the finalize tool aggregates them and writes `refine_status` to the database. 

For balance-sheet-only agentic output (e.g., if a refine agent produces only balance-sheet rows despite OCR text containing all three sections), the tool must reject the false-DONE and set `refine_status=PARTIAL` instead. This server-side safety net ensures agentic refine cannot accidentally poison the corpus with incomplete rows.

---

## Acceptance Criteria

### AC-1: Section Gate Before Writing DONE
- **File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`
- **Location:** After parsing markdown → extracting rows, before the final `refine_status` write
- **Implementation:**
  ```typescript
  import { checkSectionCompleteness } from "../../domain/services/financial-reports/bctcSectionCompleteness.js";
  
  const completeness = checkSectionCompleteness(parsedRows);
  
  if (!completeness.isComplete) {
    // Agentic refine produced incomplete row set
    report_status = "PARTIAL";  // override caller input
    reason = "section_incomplete after agentic refine: balance-sheet-only output";
  } else {
    report_status = callerSuppliedStatus;  // DONE/PENDING/etc. from agent
  }
  ```
- **Caller input:** The agentic fleet can supply `report_status='DONE'`, but server-side check overrides it
- **Atomicity:** Check happens before DB write, single transaction

### AC-2: Preserve Existing Guards (BEQ-4a/4b)
- **No changes** to existing null-clear logic or prior-period withhold
- **PARTIAL handling:** Already existing in schema; PARTIAL rows are handled gracefully by existing displays
- **Downstream:** `/api/bctc-inspect/docs` already treats PARTIAL as non-complete (via BEQ-4a guard or lower-layer logic)

### AC-3: Test Deliberate Violations
- **File:** extend `apps/mcp-server/src/__tests__/BEQ-SECTION-GUARD.test.ts`
- **DV-FINALIZE-1:** agentic refine produces income-only rows (no balance/cash) → override caller DONE to PARTIAL
- **DV-FINALIZE-2:** agentic refine produces all three sections → allow caller DONE to pass through
- **DV-FINALIZE-3:** empty parsed rows → PARTIAL (fail-safe)
- All must FAIL before implementation, PASS after

### AC-4: Logging & Reason Field
- Include `reason` in return object when override occurs
- Reason must be logged to agent notebook (caller can read result.reason)
- Example: `"section_incomplete after agentic refine: balance-sheet-only output"`

---

## Dependencies

- **Requires:** BEQ-5 (checkSectionCompleteness function)
- **Blocks:** BEQ-9, BEQ-10 (agentic refine dispatch cannot start until this ships + image rebuilt)
- **Co-dependent:** BEQ-6, BEQ-8, BEQ-8b (same tool zone, sequenced in git)
- **Prerequisite met:** BEQ-5 completed and exported

---

## Implementation Notes

- **Import path:** `import { checkSectionCompleteness } from "../../domain/services/financial-reports/bctcSectionCompleteness.js"`
- **Caller context:** `refine_bctc_md` agent → finalizeBctcRefineTool (mcp tool call)
- **Override safety:** Section completeness is a hard invariant; overrides caller input because server is the SSOT
- **No rollback:** If agentic refine produces incomplete rows, they are still inserted (for forensics), but refine_status=PARTIAL blocks downstream publish guards
- **Risk R-2 mitigation:** PARTIAL prevents the irreversible notApplicable null-clear from firing on a corporate that was mis-classified as a bank

---

## Commit Format

```
feat(bctc): apply section guard in finalizeBctcRefineTool (BEQ-7)

Server-side safety net: after agentic refine parses markdown and produces
rows, gate the DONE status on section completeness check. Incomplete output
(e.g., balance-sheet-only from refine) is promoted to PARTIAL instead.

Overrides caller-supplied report_status if sections missing.

DV tests: BEQ-SECTION-GUARD.test.ts DV-FINALIZE-1/2/3.

Task: BEQ-7
Depends: BEQ-5
```

---

## Handoff Checklist

- [ ] Section completeness check added before final status write
- [ ] Override logic correctly demotes incomplete DONE → PARTIAL
- [ ] Return object includes reason field when override occurs
- [ ] DV tests written (3/3): incomplete refine override to PARTIAL, complete pass through
- [ ] No changes to existing null-clear logic (BEQ-6 handles that)
- [ ] Commit message references BEQ-5 prerequisite
- [ ] QA verifies before next task dispatch

---

## RETURN

**Status:** Ready for dev-mcp-server dispatch (after BEQ-5 DONE)  
**Blocker:** BEQ-5 completion  
**Next:** dev-mcp-server implements BEQ-7; QA verifies DV tests; then seq unblock BEQ-8/8b  
