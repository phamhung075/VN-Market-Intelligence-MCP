# TASK_pdf-extractor-P2-K — G11 Regression Alarm Bell Evidence

**Task:** P2-K1 + P2-K2 — G11 2-trial coupling proof (pdf-extractor pilot)
**Owner:** qa
**Date:** 2026-05-24
**Status:** DONE — G11 PASS

---

## Summary

G11 goal: prove the regression alarm bell — when a primitive breaks, a COUPLED module-tier scenario that depends on that primitive ALSO flips RED, so a dev cannot ship a fix that silently breaks a downstream scenario.

Both trials executed. Both show outcome-(a): coupled module scenario RED during mutation window, single-edit fix restores both primitive and module to GREEN. Final tree state: honest-green. 114 pytest pass.

---

## Precondition — Baseline (before any mutation)

- Primitive scenarios (18): ALL PASS (exit 0)
- Module scenario `multi_primitive_story.json`: PASS (exit 0)
- pytest: 114 passed
- DDD fence (lint-imports): 2 KEPT, 0 broken, exit 0
- `git diff apps/pdf-extractor/domain/`: EMPTY (clean)
- No mutations committed at any point in this task

---

## P2-K1 — Trial 1: decimal_normalizer Coupling

### Mutation Applied

**File:** `apps/pdf-extractor/domain/primitives/decimal_normalizer/primitive.py`
**Line:** `_UNIT_MULTIPLIERS` dict, `"billion_vnd"` entry
**Before:** `"billion_vnd": 1.0`
**After (mutation):** `"billion_vnd": 0.0`
**Type:** single-literal constant change (multiplier flip to zero)

### Primitive Sandbox — After Mutation

| Scenario | Expected | Actual (mutated) | Pass |
|----------|----------|-------------------|------|
| happy_normal.json | 1234.5 | 0.0 | **FAIL (RED)** |
| edge_decimal_shift_vnm.json | 51.0 | 51.0 | PASS (GREEN, uses raw_micro) |
| failure_non_numeric.json | null | null | PASS (GREEN) |

Primitive scenario RED confirmed: `happy_normal.json` uses `unit_hint="billion_vnd"` which maps to the mutated multiplier.

### Module Scenario — Coupling Confirmed RED

**Command:** `env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=module --scenario=apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json`

**Result:** `pass=false`

**Coupling chain:**
- decimal_normalizer multiplier="billion_vnd"=0.0 → all normalized values = 0.0
- validate_financial_figures(net_revenue=0.0) → BCTC-VAL-05 fires (net_revenue <= 0) → penalty=0.2 → confidence=0.8
- Module expected `confidence=1.0`, actual `confidence=0.8` → mismatch → module scenario RED

**Module actual output during mutation:**
```json
{
  "normalized_assets": 0.0, "normalized_equity": 0.0,
  "normalized_liabilities": 0.0, "normalized_margin": 0.0,
  "normalized_revenue": 0.0, "confidence": 0.8,
  "ocr_quality_pass": true, "disposition": "normal",
  "gross_margin": null
}
```

**ALARM BELL FIRED.** Coupled module scenario RED.

### Single-Edit Fix + Restore Verification

**Fix:** Restore `"billion_vnd": 1.0` (single-literal)

**Post-fix primitive results:**
- happy_normal.json: PASS
- edge_decimal_shift_vnm.json: PASS
- failure_non_numeric.json: PASS

**Post-fix module result:** `pass=true`

**git diff apps/pdf-extractor/domain/ after restore:** EMPTY (clean)

**Outcome-(a) CONFIRMED.** ≥1 coupled scenario RED + single-edit fix restored both.

---

## P2-K2 — Trial 2: validate_financial_figures Coupling

### Mutation Applied

**File:** `apps/pdf-extractor/domain/primitives/validate_financial_figures/primitive.py`
**Line:** BCTC-VAL-01 hard-violation comparator
**Before:** `and total_assets < total_equity`
**After (mutation):** `and total_assets > total_equity`
**Type:** single-literal operator flip (< to >)

### Primitive Sandbox — After Mutation

| Scenario | Expected | Actual (mutated) | Pass |
|----------|----------|-------------------|------|
| happy.json | 1.0 | 0.0 | **FAIL (RED)** |
| edge_vnm_val01.json | 0.0 | 1.0 | **FAIL (RED)** |
| failure_negative_assets.json | 0.0 | 0.0 | PASS (BCTC-VAL-02 unaffected) |

Two primitive scenarios RED.

**Coupling analysis:**
- `happy.json`: assets=10000 > equity=4000 → True (mutated condition) → hard violation → 0.0 ≠ 1.0 → FAIL
- `edge_vnm_val01.json`: assets=957 > equity=18829 → False → no hard violation → soft checks → confidence=1.0 ≠ 0.0 → FAIL (logic inverted)
- `failure_negative_assets.json`: BCTC-VAL-02 (negative assets) fires before VAL-01 → unaffected → PASS

### Module Scenario — Coupling Confirmed RED

**Result:** `pass=false`

**Coupling chain:**
- validate_financial_figures(assets=10000, equity=4000) → mutated condition 10000 > 4000 = True → hard violation → returns 0.0
- low_confidence_gate.gate(confidence=0.0) → "skip" (exact zero gate)
- Module expected `disposition="normal"`, actual `disposition="skip"` → mismatch → RED
- Module expected `confidence=1.0`, actual `confidence=0.0` → mismatch → RED

**Module actual output during mutation:**
```json
{
  "normalized_assets": 10000.0, "normalized_equity": 4000.0,
  "confidence": 0.0, "ocr_quality_pass": true,
  "disposition": "skip", "gross_margin": 2.999...e-05
}
```

**ALARM BELL FIRED.** Coupled module scenario RED. Note the coupling path also exercises `low_confidence_gate` — a chain of 2 primitives propagating the error through to module outcome.

### Single-Edit Fix + Restore Verification

**Fix:** Restore `and total_assets < total_equity` (single-literal operator)

**Post-fix primitive results:**
- happy.json: PASS
- edge_vnm_val01.json: PASS
- failure_negative_assets.json: PASS

**Post-fix module result:** `pass=true`

**git diff apps/pdf-extractor/domain/ after restore:** EMPTY (clean)

**Outcome-(a) CONFIRMED.** ≥1 coupled scenario RED + single-edit fix restored both.

---

## Final Honest-Green State Verification

**Primitive scenarios (18 non-known-bad):** 18 PASS / 0 FAIL
**Module scenario:** PASS (exit 0)
**pytest:** 114 passed, 0 failed
**DDD fence (lint-imports):** 2 KEPT, 0 broken, exit 0
**git diff apps/pdf-extractor/domain/:** EMPTY (clean — no mutations committed)

---

## G11 Verdict

| Trial | Primitive mutated | Primitive scenario RED? | Module coupled RED? | Single-edit fix restores both? | Outcome-(a)? |
|-------|-------------------|------------------------|---------------------|-------------------------------|--------------|
| Trial 1 | decimal_normalizer (`billion_vnd`: 1.0→0.0) | YES (happy_normal.json) | YES (confidence 1.0→0.8) | YES | CONFIRMED |
| Trial 2 | validate_financial_figures (`<` → `>` in VAL-01) | YES (happy.json, edge_vnm_val01.json) | YES (disposition "normal"→"skip") | YES | CONFIRMED |

**G11 verdict: PASS** — 2-trial coupling proof complete. Outcome-(a) × 2.

Both mutations never committed. Final tree state is honest-green.

---

## [QA] Review Record

**Reviewer:** qa
**Date:** 2026-05-24T09:55:00Z
**Verdict:** G11 PASS

- Trial-1: decimal_normalizer coupling CONFIRMED (module confidence 1.0→0.8)
- Trial-2: validate_financial_figures coupling CONFIRMED (disposition normal→skip, confidence 1.0→0.0)
- Both outcome-(a) observed
- No mutations committed at any point
- Final state: honest-green (18 primitive PASS, 1 module PASS, 114 pytest PASS, DDD CLEAN)
- Signal: docs/signals/qa-pdf-extractor-P2-K-g11-20260524T095543Z.json

**NEXT:** P2-G5a (dev-pdf-extractor: pre-delete tag + move superseded code to _deprecated/) then P2-G5c (qa: zero TODO.*migrat grep) then P2-G5b-clearance (architect).
