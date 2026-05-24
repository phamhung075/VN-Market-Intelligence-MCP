# TASK: pdf-extractor P2-J3 — G10 AI-Fixability Proof (Regression Repair)

**Status:** DONE
**Cycle count:** 1
**Fix commit:** `1a678571`
**Date:** 2026-05-24

---

## Defect Found

**File:** `apps/pdf-extractor/domain/primitives/low_confidence_gate/primitive.py:40`

**What was wrong:** `_LOW_CONF_THRESHOLD` was mutated from `0.2` to `0.1` by the P2-J2 injection.
With threshold `0.1`, `confidence=0.15` evaluates `0.15 < 0.1 → False` and returns `"normal"` instead
of the canonical `"low_confidence"`. The docstring and tests both document the canonical boundary as `< 0.2`.

**Fix:** Restored `_LOW_CONF_THRESHOLD: float = 0.2` (one-literal change, line 40).

**Diagnosed from:** sandbox scenario `edge_low_confidence_flag.json` (`confidence=0.15`, expected `"low_confidence"`, actual `"normal"`) + primitive source + unit tests.

---

## G12 DoD — Sandbox Green Evidence

### low_confidence_gate — all 3 non-known_bad scenarios GREEN

**edge_low_confidence_flag.json** (the RED scenario from P2-J2 signal):
```json
{"primitive":"low_confidence_gate","inputs":{"confidence":0.15},"expected":"low_confidence","actual":"low_confidence","pass":true,"error":null}
```

**happy_normal.json**:
```json
{"primitive":"low_confidence_gate","inputs":{"confidence":0.85},"expected":"normal","actual":"normal","pass":true,"error":null}
```

**failure_zero_skip.json**:
```json
{"primitive":"low_confidence_gate","inputs":{"confidence":0.0},"expected":"skip","actual":"skip","pass":true,"error":null}
```

**known_bad_disposition_wrong.json** — intentionally RED (honesty check, expected by design):
```
pass: false (known_bad — correct behaviour)
```

### Full primitive tier — all non-known_bad scenarios GREEN

| Scenario | Result |
|---|---|
| confidence_scorer/edge_low_conf_with_tables | PASS |
| confidence_scorer/failure_zero_conf_no_tables | PASS |
| confidence_scorer/happy_high_conf | PASS |
| confidence_scorer/known_bad_score_wrong | FAIL (known_bad, correct) |
| decimal_normalizer/edge_decimal_shift_vnm | PASS |
| decimal_normalizer/failure_non_numeric | PASS |
| decimal_normalizer/happy_normal | PASS |
| decimal_normalizer/known_bad_expected_wrong | FAIL (known_bad, correct) |
| echo_identity/failure_mismatch | FAIL (known_bad, correct) |
| echo_identity/happy | PASS |
| echo_identity/happy_string | PASS |
| field_extractor/edge_field_not_found | PASS |
| field_extractor/failure_malformed_text | PASS |
| field_extractor/happy_net_revenue | PASS |
| low_confidence_gate/edge_low_confidence_flag | PASS |
| low_confidence_gate/failure_zero_skip | PASS |
| low_confidence_gate/happy_normal | PASS |
| low_confidence_gate/known_bad_disposition_wrong | FAIL (known_bad, correct) |
| ratio_computer/edge_zero_denominator | PASS |
| ratio_computer/failure_negative_equity | PASS |
| ratio_computer/happy_gross_margin | PASS |
| ratio_computer/known_bad_ratio_wrong | FAIL (known_bad, correct) |
| validate_financial_figures/edge_vnm_val01 | PASS |
| validate_financial_figures/failure_negative_assets | PASS |
| validate_financial_figures/happy | PASS |
| validate_financial_figures/known_bad_threshold_wrong | FAIL (known_bad, correct) |

All non-known_bad scenarios: GREEN. All known_bad scenarios: RED (expected — honesty verified).

### pytest

```
114 passed in 1.51s
```

---

## G10 Measurement

- **Cycle count:** 1 (within ≤2 hard cap)
- **Fix complexity:** 1-literal restore (`0.1` → `0.2`)
- **Diagnosis method:** sandbox failing scenario + primitive source read + unit test contract verification
- **Sealed spec accessed:** NO (measurement integrity preserved)

---

## Signal Emitted

`docs/signals/dev-pdf-extractor-P2-J3-done-20260524T000000Z.json`

---

## Pipeline

PIPELINE: continue
NEXT: P2-K1/K2 (G11 regression alarm)
