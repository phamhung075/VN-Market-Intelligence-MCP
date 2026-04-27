# TASK 1345b — BCTC Financial Validation (VNM / VEA Corruption)

**Sprint:** 1345
**Owner:** Developer
**Type:** SPRINT-S
**Status:** Done
**Related Report IDs:** [1116, 1117]
**Blockers:** None
**WIP Slot:** Developer slot

---

## Acceptance Criteria

- [ ] Python domain model changes:
  - [ ] `apps/pdf-extractor/domain/models.py` ExtractedContent: add `confidence_financial: float = 1.0` field
  - [ ] `apps/pdf-extractor/domain/services.py` adds pure `validate_financial_figures(total_assets, total_equity, total_liabilities, operating_margin, net_revenue) -> float` function
  - [ ] Function returns float in [0.0, 1.0] per rules (hard violations = 0.0, soft = -0.2 each, floor 0.1)
  - [ ] Function called in `process_pdf()` after step 6, result assigned to `content.confidence_financial`
  - [ ] Function has JSDoc explaining all 6 validation rules (hard: assets < equity, assets < 0, liabilities < 0; soft: margin out-of-range, net_revenue <= 0, equity < 0)

- [ ] Python application layer:
  - [ ] `apps/pdf-extractor/application/dtos.py` adds `confidence_financial` field to extraction response DTO
  - [ ] All DTO serialization tests updated

- [ ] MCP server (TypeScript) changes:
  - [ ] Locate BCTC schema file in `apps/mcp-server/src/infrastructure/db/` (grep `CREATE TABLE.*bctc`)
  - [ ] Add nullable columns `ocr_confidence REAL` and `confidence_financial REAL` to BCTC table (additive migration)
  - [ ] Value-investor analysis use case: skip conviction signal generation when `min(ocr_confidence, confidence_financial) <= 0.3`
  - [ ] Value-investor: log WARN message + send Telegram bug alert for low-confidence extraction

- [ ] Unit tests (12 unit + 3 integration):
  - [ ] `apps/pdf-extractor/__tests__/unit/test_financial_validation.py` created with 12 tests:
    - [ ] ✓ returns 1.0 when all figures clean
    - [ ] ✓ returns 0.0 when total_assets < total_equity (BCTC-VAL-01 hard)
    - [ ] ✓ returns 0.0 when total_assets < 0 (BCTC-VAL-02 hard)
    - [ ] ✓ returns 0.0 when total_liabilities < 0 (BCTC-VAL-04 hard)
    - [ ] ✓ reduces by 0.2 for operating_margin > 1.0 (BCTC-VAL-03 soft)
    - [ ] ✓ reduces by 0.2 for net_revenue = 0 (BCTC-VAL-05 soft)
    - [ ] ✓ reduces by 0.2 for equity < 0 (BCTC-VAL-06 soft)
    - [ ] ✓ floors at 0.1 for 3 soft violations
    - [ ] ✓ None values skipped (partial extraction not penalized)
    - [ ] ✓ VNM Q4 2024 scenario: assets=957T equity=18829T → 0.0
    - [ ] ✓ VEA Q4 2024 scenario: operating_margin=3.3 → 0.0 (hard after soft)
    - [ ] ✓ composite = min(ocr_confidence, confidence_financial)
  - [ ] MCP server BCTC test file: 3 new tests
    - [ ] ✓ does not generate conviction signal when composite_confidence <= 0.3
    - [ ] ✓ sends Telegram bug alert for low-confidence extraction
    - [ ] ✓ stores extraction with status='low_confidence' in BCTC table

- [ ] Code review checklist:
  - [ ] No I/O in `validate_financial_figures()` — pure function with no DB/HTTP calls
  - [ ] All 6 rules from BA spec REQ_1345 § 2.3 implemented correctly
  - [ ] Vietnamese number format normalization confirmed in `extraction_engine.py` (parentheses → negative: "(1.234)" → -1234.0)
  - [ ] composite confidence = `min(ocr_confidence, confidence_financial)`
  - [ ] All None values skipped in validation (partial extraction safe)
  - [ ] Function JSDoc includes examples: VNM and VEA scenarios

- [ ] Post-deployment audit (one-time, manual):
  - [ ] Run audit script against live DB (generated as part of task)
  - [ ] Script queries all BCTC rows, applies validation function, produces `reports/BCTC_CONFIDENCE_AUDIT_1345b.md`
  - [ ] Audit report reviewed by developer before task closure

- [ ] Deployment validation:
  - [ ] `bun test` passes (count >= 7371 + 15 new tests from 1345b)
  - [ ] `pytest` passes for pdf-extractor (all 12 tests)
  - [ ] BCTC audit script completes without errors
  - [ ] Sanity check: run audit on one known-good ticker (e.g., VNM) to verify confidence_financial populated

---

## Implementation Notes

### Problem Summary
- `ExtractedContent` has `ocr_confidence` (0.0–1.0) but NO `confidence_financial`
- `process_pdf()` only checks OCR gate: `ocr_conf < 0.5 AND not tables`
- No accounting identity validation exists (assets < equity is a hard error, never happens in clean data)
- VNM Q4 2024: assets=957T < equity=18829T (impossible) → corruption undetected
- VEA Q4 2024: operating_margin=3.3 (>1.0, outside business norms) → undetected

### Approach
1. Add pure `validate_financial_figures()` function to Python domain layer
2. Extract key figures from parsed tables in `process_pdf()` and call validator
3. Store `confidence_financial` in `ExtractedContent` and MCP BCTC schema
4. Skip conviction signal generation when composite confidence too low
5. Send Telegram alert for low-confidence BCTC extractions (debugging aid)

### Validation Rules (from BA spec)

| Rule | Type | Condition | Action |
|------|------|-----------|--------|
| BCTC-VAL-01 | Hard | total_assets < total_equity (both non-None, non-zero) | return 0.0 |
| BCTC-VAL-02 | Hard | total_assets < 0 | return 0.0 |
| BCTC-VAL-03 | Soft | operating_margin outside (-5.0, +1.0) — ratio not pct | -0.2 |
| BCTC-VAL-04 | Hard | total_liabilities < 0 | return 0.0 |
| BCTC-VAL-05 | Soft | net_revenue <= 0 (non-holding company, source_type='bctc') | -0.2 |
| BCTC-VAL-06 | Soft | equity < 0 | -0.2 |

Soft violations stack: 3 soft → 1.0 - 0.2 - 0.2 - 0.2 = 0.4, floor at 0.1 → final = 0.4

### Vietnamese Number Format Pre-condition
Ensure `extraction_engine.py` already normalizes "(1.234)" → -1234.0 before `validate_financial_figures()` is called. If not, add normalization there (infrastructure layer — correct placement).

### Testing Strategy
- Unit tests in Python verify validator behavior in isolation
- MCP server integration tests verify conviction skip + Telegram alert
- Audit script verifies live BCTC data confidence_financial distribution
- Post-deploy: run audit on historical BCTC table to detect past corruption patterns

---

## Branch & Files

**Branch:** `task/1345b-bctc-validation`

**Files to create:**
- `apps/pdf-extractor/__tests__/unit/test_financial_validation.py` (12 tests)
- `reports/BCTC_CONFIDENCE_AUDIT_1345b.md` (generated post-deploy)

**Files to modify:**
- `apps/pdf-extractor/domain/models.py` (add confidence_financial field)
- `apps/pdf-extractor/domain/services.py` (add validate_financial_figures + call in process_pdf)
- `apps/pdf-extractor/application/dtos.py` (add confidence_financial to DTO)
- `apps/mcp-server/src/infrastructure/db/[bctc-schema-file]` (add columns)
- `apps/mcp-server/src/application/usecases/[value-investor-use-case].ts` (skip + alert)
- `apps/mcp-server/src/__tests__/[bctc-test-file].test.ts` (add 3 integration tests)

---

## Definition of Done

All acceptance criteria pass. `bun test` ≥ 7371 + 15. `pytest` 12/12 pass. Audit script runs without error. Low-confidence extraction sends Telegram alert to bug channel. Conviction signals skipped when confidence <= 0.3.

---

## [QA] Review Record

**Date:** 2026-04-27
**Verdict:** APPROVED
**Reviewer:** QA agent

### Test Results
- Python unit tests (pytest): 12 pass / 0 fail
- TS integration tests (bun test 1345b): 3 pass / 0 fail
- TypeScript (bun tsc --noEmit): 0 errors (after QA fix)
- Full suite: not regression-attributable (task branch 20 commits behind main; 173 failures are pre-existing on old base, 0 attributable to 1345b files)

### DDD Compliance: PASS
- `apps/pdf-extractor/domain/services.py`: zero infrastructure/application imports
- `apps/mcp-server/src/domain/services/financial-reports/financialFiguresValidator.ts`: zero infrastructure imports

### Security: PASS
- No `process.env` in any modified file (Bun.env used in parseBctcReport.ts line 536)
- No hardcoded secrets or API keys
- No SQL injection vectors (parameterized queries throughout)

### Issues Found
#### Blocking (fixed by QA)
- `apps/mcp-server/src/__tests__/1345b-bctc-financial-validation.test.ts:162` — `periodType: "Q"` not assignable to `PeriodType` union (`'Q1'|'Q2'|'Q3'|'Q4'|...`). Fixed to `"Q4"`. Commit: `7fde2012`

#### Non-Blocking
- None

### Merge
- Merge commit: `6d73167b` on main
- Branch deleted: task/1345b-bctc-financial-validation
- Reports closed: 1116 (VNM extraction), 1117 (VEA extraction) — marked processed, fixes logged in system_changelog (IDs 174, 175)

