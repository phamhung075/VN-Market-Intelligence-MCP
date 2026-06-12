---
sprint: BCTC-ANALYTICS-LAYER
task_id: FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE
size: M
priority: medium
depends_on:
  - FIX-FINALIZE-STATUS-STUCK-PARTIAL
blocks: []
---

## TLDR

The `extraction_confidence` column is frozen at OCR-parse time and never updated after refine/finalize. A successful refine pass can take a low-confidence report (e.g. ACB at 0.375 / 37.5%) and generate 100+ high-quality rows, but the confidence value stays at the original OCR metric. The serve gate PUB-5 blocks publishing on `confidence < 0.5`, regardless of refine quality. Fix: recompute confidence at finalize time from section completeness (weighted: balance_sheet 0.4 + income_statement 0.4 + cash_flow 0.2). Only overwrite if the new confidence exceeds the current value (preserve good OCR extractions).

## [PM] Planning Context

**Acceptance Criteria:**

- [ ] AC-1-1: After full refine on a report with all 3 sections present, `extraction_confidence` rises above 0.5
- [ ] AC-1-2: `get_bctc_full(ACB)` after refine serves real financial scalars (not withheld by PUB-5)
- [ ] AC-1-3: A report with good OCR confidence (e.g. 0.9) but partial refine (2/3 sections) preserves the higher OCR value
- [ ] AC-2-1: `finalizeBctcRefineTool` at BLOCK-1 region (after section-completeness check) includes the confidence recompute logic
- [ ] AC-2-2: Confidence formula is: `(has_balance_sheet ? 0.4 : 0) + (has_income_statement ? 0.4 : 0) + (has_cash_flow ? 0.2 : 0)`
- [ ] AC-2-3: Guard enforces: only update if `refined_confidence > current_extraction_confidence`
- [ ] AC-3-1: `bctcSectionCompleteness.ts` returns the boolean flags (hasBalanceSheet, hasIncomeStatement, hasCashFlow) from checkSectionCompleteness — no change needed to domain service
- [ ] AC-3-2: DB UPDATE to `extraction_confidence` is non-fatal (same pattern as BLOCK-1 through BLOCK-4 steps)
- [ ] AC-4-1: VNM consolidated control remains servable (confidence must not regress for correctly extracted reports)
- [ ] AC-5-1: `bun test` baseline remains >8800 pass / <=1 fail after changes
- [ ] AC-5-2: No new test files created; verification gates in section below

**Files to read first:**

- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` — BLOCK-1 region (lines 140–180), response object, checkPublishability call
- `apps/mcp-server/src/domain/services/financial-reports/bctcSectionCompleteness.ts` — checkSectionCompleteness signature, return shape
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` — checkPublishability + PUB-5 gate (lines 728–738)
- `apps/mcp-server/src/application/usecases/parseBctcReport.ts` — where `extraction_confidence` is originally written (for context only)
- Architect brief: `docs/architecture-briefs/2026-06-12-bctc-refine-state-machine-ruling.md` §BUG 2 — full design + risk flag RF-2

**Files to modify:**

1. **`apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`**
   - Line ~155 (inside BLOCK-1, after `const completeness = checkSectionCompleteness(finalRows)`): add the confidence recompute logic
   - Compute `refined_confidence` using the weighted formula
   - Guard: only write if `refined_confidence > current_extraction_confidence`
   - Execute a non-fatal DB UPDATE after the main transaction (pattern: same as other BLOCK-1 updates)
   - Add comment: `// BUG 2: FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE — recompute from refined section coverage`

**Verification gates (mandatory before merge):**

1. **Confidence rise on full refine:**
   - Live test: trigger finalize on ACB fea19bae (all 3 sections present after 27/27 windows refined)
   - Before finalize: query `SELECT extraction_confidence FROM financial_reports WHERE id='fea19bae-2b7a-4954-b3e0-e09d7bfc7390'` → expect 0.375
   - After finalize: same query → expect ≥ 0.6 (all 3 sections weighted = 1.0, but guard may preserve OCR if it was higher)
   - Actually, if OCR is 0.375, refined_confidence = 1.0 (all sections), so 1.0 > 0.375 → overwrite. Expect 1.0.

2. **PUB-5 gate pass:**
   - Call `get_bctc_full(ACB)` after confidence recompute
   - Verify the response includes real financial scalar data (balance_sheet, income_statement, cash_flow rows)
   - PUB-5 must no longer block (confidence now >= 0.5)
   - Verify that VNM consolidated control is still included (no regression on another gate)

3. **Guard enforcement (OCR preservation):**
   - Identify a report with high OCR confidence (e.g. 0.85) but incomplete refine (e.g. 2/3 sections = 0.6)
   - Run finalize on that report
   - Query extraction_confidence → must still be 0.85 (guard preserved the higher OCR value)

4. **Regression test:**
   - Run `bun test` — must pass existing baseline
   - No new test files (verification is manual + live)

**Risk flags (from brief):**

- **RF-2 (MEDIUM) — Confidence rewrite clobbers good OCR signal:** The guard (only overwrite if refined_confidence > current) prevents regression on well-extracted reports. Must be a hard invariant in the implementation, not a soft check. Dev must verify the UPDATE only fires when the condition is met (no accidental overwrites).

**Dependencies:**

Depends on FIX-FINALIZE-STATUS-STUCK-PARTIAL landing first. This task requires the finalize flow to run cleanly on the queue (P0 must complete the deadlock fix first).

---

## Architecture Reference

Full design in `docs/architecture-briefs/2026-06-12-bctc-refine-state-machine-ruling.md` §BUG 2. Key decisions:

**Ruling: Recompute at finalize time.**

Do NOT make PUB-5 coverage-aware. Rationale:
1. `extraction_confidence` is a persistent column read by multiple consumers (validation in BLOCK-4, PUB-8 parent-only heuristic, Telegram alert formatting, reports.ts display).
2. Making PUB-5 coverage-aware would fix only the serve path; the frozen value would remain wrong everywhere else.
3. The refined row set is the ground truth after finalize. Section coverage is a more accurate confidence signal than the OCR heuristic used at parse time.
4. Recompute-at-finalize is consistent with BLOCK-3 (ratio re-derive) and BLOCK-4 (validation_status refresh).

**Formula (weighted section presence):**

```typescript
const refinedConfidence = (
  (completeness.hasBalanceSheet ? 0.4 : 0) +
  (completeness.hasIncomeStatement ? 0.4 : 0) +
  (completeness.hasCashFlow ? 0.2 : 0)
);

// Guard: only overwrite if new value exceeds current
const currentConfidence = row.extraction_confidence ?? 0;
if (refinedConfidence > currentConfidence) {
  // UPDATE financial_reports SET extraction_confidence = ? WHERE id = ?
}
```

- If all 3 sections present → 1.0 (forces above PUB-5 gate cleanly)
- If 2/3 sections → 0.6–0.8 (still above threshold)
- If 1/3 sections → 0.2–0.4 (below threshold — correct)

**DDD layer assignment:**

- `bctcSectionCompleteness.ts` is already invoked in BLOCK-1; no change needed
- All confidence recompute logic in `finalizeBctcRefineTool.ts` (interface layer)
- Non-fatal UPDATE after transaction (same pattern as existing BLOCK-1 steps)

---

## Implementation Notes

- **Zone:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/` — finalizeBctcRefineTool.ts only
- **DDD:** interface-layer changes only; domain layer unchanged
- **Sequential dependency:** Requires P0 (FIX-FINALIZE-STATUS-STUCK-PARTIAL) to land first so refine can run cleanly on the queue and this task's verification gates can execute
- **Observability:** Add console.log or structured log when override fires, for debugging

---

## Dispatch

**Agent:** `dev-mcp-server`

**Ready now:** No (blocked by FIX-FINALIZE-STATUS-STUCK-PARTIAL — P0 dependency)

**Estimated effort:** ~1.5h (weighted formula + guard logic + verification)
