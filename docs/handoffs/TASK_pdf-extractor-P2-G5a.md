# TASK_pdf-extractor-P2-G5a — Pre-delete tag + move superseded code to `_deprecated/`

**Task:** P2-G5a — G5a: move superseded in-service dead code to `_deprecated/`
**Owner:** dev-pdf-extractor
**Date:** 2026-05-24
**Status:** DONE — G5a satisfied

---

## Pre-delete tag

`pdf-extractor-pre-delete` created BEFORE any file moves.

```
git tag pdf-extractor-pre-delete
```

Confirmed: `git tag | grep pdf-extractor-pre-delete` → `pdf-extractor-pre-delete`

---

## Caller Check — Full Analysis

### What was examined

1. `domain/services.py` — the G5a primary target per spec
2. `domain/primitive/` (singular) — a proto-scaffold directory distinct from `domain/primitives/` (plural)

### Findings

#### `domain/services.py`

- Contains `ExtractPDFService` class — LIVE (callers: `main.py`, `application/usecases.py`, `__tests__/unit/test_extract_pdf_service.py`, `__tests__/integration/test_extract_pdf_usecase.py`)
- Contains `from domain.primitives.validate_financial_figures import validate_financial_figures # noqa: F401` — this was a backward-compat re-export shim for `__tests__/unit/test_financial_validation.py`
- The original function BODY (`def validate_financial_figures(...)`) was already moved to `domain/primitives/validate_financial_figures/primitive.py` in P1-B1. No body remains in services.py.
- AC-6 spec check (`def validate_financial_figures\|def normalize_decimal` outside primitives) was ALREADY PASSING before this task.

**Action taken:** Updated `test_financial_validation.py` to import directly from `domain.primitives.validate_financial_figures` (removing the backward-compat dependency on `domain.services`). Removed the `# noqa: F401` shim comment from `domain/services.py`; the import is retained because `services.py` itself uses `validate_financial_figures` at line 91 (`content.confidence_financial = validate_financial_figures(...)`).

#### `domain/primitive/` (singular) — DEAD, moved to `_deprecated/`

- `domain/primitive/` (singular, distinct from `domain/primitives/` plural) contains only `mock_echo` scaffold
- ZERO callers: no Python file imports from `domain.primitive` (confirmed by grep)
- The sandbox runner uses `domain.primitives.{name}` (plural), never `domain.primitive` (singular)
- No test imports `mock_echo` from this location
- The `domain/primitive/mock_echo/scenarios/golden.json` is unreachable by the runner (runner resolves to `domain.primitives.mock_echo` which does not exist)
- This is a proto-scaffold leftover from an earlier naming iteration before `domain/primitives/` (plural) was settled

**Action taken:** `git mv apps/pdf-extractor/domain/primitive apps/pdf-extractor/_deprecated/domain_primitive_mock_echo`

---

## What was moved to `_deprecated/`

| Old path | New path |
|---|---|
| `apps/pdf-extractor/domain/primitive/__init__.py` | `apps/pdf-extractor/_deprecated/domain_primitive_mock_echo/__init__.py` |
| `apps/pdf-extractor/domain/primitive/mock_echo/__init__.py` | `apps/pdf-extractor/_deprecated/domain_primitive_mock_echo/mock_echo/__init__.py` |
| `apps/pdf-extractor/domain/primitive/mock_echo/mock_echo.py` | `apps/pdf-extractor/_deprecated/domain_primitive_mock_echo/mock_echo/mock_echo.py` |
| `apps/pdf-extractor/domain/primitive/mock_echo/scenarios/golden.json` | `apps/pdf-extractor/_deprecated/domain_primitive_mock_echo/mock_echo/scenarios/golden.json` |

DEPRECATED header added to `mock_echo.py`:
```python
# DEPRECATED: G5a Phase 2. Original body superseded by domain/primitives/ (plural) scaffold.
# domain/primitive/ (singular) was a proto-scaffold; canonical location is domain/primitives/.
# Zero live callers. Moved here 2026-05-24 (P2-G5a).
```

---

## Import updates (no broken imports)

- `apps/pdf-extractor/__tests__/unit/test_financial_validation.py`: changed `from domain.services import validate_financial_figures` → `from domain.primitives.validate_financial_figures import validate_financial_figures`
- `apps/pdf-extractor/domain/services.py`: removed backward-compat re-export comment/`# noqa: F401`; import retained (services.py uses it internally)

---

## AC Verification

| AC | Check | Result |
|----|-------|--------|
| AC-1 | `pdf-extractor-pre-delete` tag created before any moves | PASS — created first |
| AC-2 | `apps/pdf-extractor/_deprecated/` directory created | PASS — `_deprecated/domain_primitive_mock_echo/` |
| AC-3 | Superseded function bodies moved to `_deprecated/` with DEPRECATED header | PASS — `mock_echo.py` has header; no function bodies were in `services.py` to move |
| AC-4 | All imports from `domain.services` that called old body now route through `domain.primitives.*` | PASS — `test_financial_validation.py` updated to import directly from primitives |
| AC-5 | `python -m pytest apps/pdf-extractor/__tests__/unit/ -q` passes | PASS — 114 passed |
| AC-6 | `def validate_financial_figures\|def normalize_decimal` not found outside `_deprecated/` | PASS — only in `domain/primitives/` |

---

## Pytest Evidence

```
cd apps/pdf-extractor && python3 -m pytest -q
..........................................................................
..........................................
114 passed in 1.13s
```

---

## Lint-imports Evidence

```
cd apps/pdf-extractor && lint-imports --config pyproject.toml

Analyzed 55 files, 76 dependencies.
Fence-A: primitives must not import infrastructure, application, or interface KEPT
Fence-B: modules must not import infrastructure or interface; no cross-module imports KEPT
Contracts: 2 kept, 0 broken.
```

---

## Sandbox Evidence (G12 DoD)

### Primitive tier (all non-known-bad, 20 GREEN / 1 RED)

The 1 RED is `echo_identity/failure_mismatch` — a deliberate honest-RED fixture (expected=99, actual=42). This was RED at baseline (P2-K handoff confirms it). It is NOT a regression.

```
GREEN: confidence_scorer/edge_low_conf_with_tables
GREEN: confidence_scorer/failure_zero_conf_no_tables
GREEN: confidence_scorer/happy_high_conf
GREEN: decimal_normalizer/edge_decimal_shift_vnm
GREEN: decimal_normalizer/failure_non_numeric
GREEN: decimal_normalizer/happy_normal
RED:   echo_identity/failure_mismatch  [deliberate honest-RED fixture]
GREEN: echo_identity/happy
GREEN: echo_identity/happy_string
GREEN: field_extractor/edge_field_not_found
GREEN: field_extractor/failure_malformed_text
GREEN: field_extractor/happy_net_revenue
GREEN: low_confidence_gate/edge_low_confidence_flag
GREEN: low_confidence_gate/failure_zero_skip
GREEN: low_confidence_gate/happy_normal
GREEN: ratio_computer/edge_zero_denominator
GREEN: ratio_computer/failure_negative_equity
GREEN: ratio_computer/happy_gross_margin
GREEN: validate_financial_figures/edge_vnm_val01
GREEN: validate_financial_figures/failure_negative_assets
GREEN: validate_financial_figures/happy
```

### Module tier

```
env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py \
  --tier=module \
  --scenario=apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json

{
  "module": "financial_reports",
  "pass": true,
  "actual": {
    "normalized_assets": 10000.0, "normalized_equity": 4000.0,
    "confidence": 1.0, "ocr_quality_pass": true,
    "disposition": "normal", ...
  }
}
```

Module scenario: PASS (exit 0)

---

## Freeze enforcement

`git diff --name-only HEAD -- apps/mcp-server/` → EMPTY

Zero mcp-server files touched.

---

## Zero TODO.*migrat check

`grep -rn "TODO.*migrat" apps/pdf-extractor/ --include="*.py"` → 0 results

---

## Commit SHA

`d339303f7c471ff741d9ac82f800e8f90e53d38b`

---

## Summary

G5a satisfied. What was moved:
- `domain/primitive/` (singular proto-scaffold, zero callers) → `_deprecated/domain_primitive_mock_echo/`

What was NOT moved (still live):
- `domain/services.py` `ExtractPDFService` class — has live callers, not superseded
- `domain/services.py` `validate_financial_figures` import — used internally by services.py, not a re-export anymore

Finding: the original `def validate_financial_figures` and `def normalize_decimal` bodies were already fully moved to `domain/primitives/` in P1-B1/P1-B2. The only in-place remnant was the backward-compat re-export shim in `services.py` which has been cleaned (test updated to import directly).
