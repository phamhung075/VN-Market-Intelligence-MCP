---
sprint: "P2-A4"
task: "pdf-extractor P2-A4 — Deliberate Fence-A violation proof"
date: "2026-05-24"
actor: "qa"
pilot: "pdf-extractor"
phase: "2"
verdict: "G4 DELIBERATE-VIOLATION PROOF COMPLETE"
---

# TASK pdf-extractor P2-A4 — Deliberate Fence-A Violation Proof

**Goal:** G4 (import-linter fence catches violations — CI would fail)
**Owner:** qa
**Status:** DONE

---

## P2-A3 — CI Config Verification (Offline-Evidence Model)

### CI yml well-formedness

File: `.github/workflows/ci.yml`

Job `py-lint` (lines 206–228):
- Valid YAML: YES
- `working-directory: apps/pdf-extractor` on the `run:` step: YES (line 228)
- Runs `lint-imports --config pyproject.toml`: YES
- Fails build on non-zero: YES (standard GitHub Actions — non-zero exit = job failure = build blocked)

### lint-imports clean run (P2-A3 baseline)

```
cd apps/pdf-extractor && lint-imports --config pyproject.toml

Analyzed 58 files, 77 dependencies.

Fence-A: primitives must not import infrastructure, application, or interface KEPT
Fence-B: modules must not import infrastructure or interface; no cross-module imports KEPT

Contracts: 2 kept, 0 broken.
EXIT_CODE=0
```

**P2-A3 verdict: PASS — CI job well-formed; lint-imports exits 0 on clean codebase.**

---

## P2-A4 — Deliberate Fence-A Violation Proof

### Step 1: Inject violation

File modified: `apps/pdf-extractor/domain/primitives/validate_financial_figures/primitive.py`

Added at line 19 (after `from typing import Optional`):
```python
from infrastructure.startup import ensure_dirs  # QA P2-A4 deliberate violation — REVERT BEFORE COMMIT
```

### Step 2: lint-imports with violation (non-zero exit)

```
cd apps/pdf-extractor && lint-imports --config pyproject.toml

Analyzed 58 files, 78 dependencies.

Fence-A: primitives must not import infrastructure, application, or interface BROKEN
Fence-B: modules must not import infrastructure or interface; no cross-module imports KEPT

Contracts: 1 kept, 1 broken.

Broken contracts:
Fence-A: primitives must not import infrastructure, application, or interface

domain.primitives is not allowed to import infrastructure:
-   domain.primitives.validate_financial_figures.primitive -> infrastructure.startup (l.19)

EXIT_CODE=1
```

**Result: EXIT_CODE=1, Fence-A BROKEN explicitly named, file:line reported (`primitive.py -> infrastructure.startup (l.19)`)**

### Step 3: Revert

- Reverted: `git checkout -- apps/pdf-extractor/domain/primitives/validate_financial_figures/primitive.py` (via Edit tool revert)
- `git diff apps/pdf-extractor/domain/`: EMPTY (no diff)
- `git status apps/pdf-extractor/domain/ --short`: CLEAN
- Violation was NEVER staged, NEVER committed

### Step 4: lint-imports post-revert (exit 0)

```
cd apps/pdf-extractor && lint-imports --config pyproject.toml

Analyzed 58 files, 77 dependencies.

Fence-A: primitives must not import infrastructure, application, or interface KEPT
Fence-B: modules must not import infrastructure or interface; no cross-module imports KEPT

Contracts: 2 kept, 0 broken.
EXIT_CODE=0
```

---

## G6 Re-verify (dashboard 6-card render)

Dashboard HTML card IDs present:
- `card-validate-financial-figures` — YES
- `card-decimal-normalizer` — YES
- `card-confidence-scorer` — YES
- `card-low-confidence-gate` — YES
- `card-ratio-computer` — YES
- `card-field-extractor` — YES
- `card-financial-reports` (module panel) — YES
- `card-pdf-extractor` (service panel) — YES

TRACE_PATHS entries: 8 (6 primitive + 1 module + 1 service)

All 6 primitive traces generated from runner.py (PYTHONPATH=apps/pdf-extractor):
- `dashboard/traces/primitive/validate_financial_figures.json` — pass=True
- `dashboard/traces/primitive/decimal_normalizer.json` — pass=True
- `dashboard/traces/primitive/confidence_scorer.json` — pass=True
- `dashboard/traces/primitive/low_confidence_gate.json` — pass=True
- `dashboard/traces/primitive/ratio_computer.json` — pass=True
- `dashboard/traces/primitive/field_extractor.json` — pass=True
- `dashboard/traces/module/financial_reports.json` — pass=True
- Service panel: NOT-RUN (no trace file — honest default)

Zero console error sources in dashboard JS: error handling is all try/catch with graceful NOT-RUN fallback.

File:// zero-network: JS uses `fetch(entry.path)` against relative paths only. Zero external URLs.

**G6 verdict: PASS — all 6 primitive card IDs present, module + service panels present, traces loaded honest-green, NOT-RUN honest before traces.**

---

## G8 Card-Level Verification (deliberate broken primitive)

### Broken primitive injected

File: `apps/pdf-extractor/domain/primitives/confidence_scorer/primitive.py`

Changed return to:
```python
return {
    "pass": False,
    "quality_score": -99.0,
}
```

### Sandbox results with broken primitive

- `confidence_scorer/happy_high_conf`: pass=False (expected True)
- `confidence_scorer/edge_low_conf_with_tables`: pass=False
- `confidence_scorer/failure_zero_conf_no_tables`: pass=False

Broken trace written to `dashboard/traces/primitive/confidence_scorer.json` with `pass=False`.

**Card-level RED confirmed:** `card-confidence-scorer` would render FAIL badge (trace.pass === false → badge-fail class).

### 5 known-bad scenarios (all pass=False)

1. `decimal_normalizer/known_bad_expected_wrong.json`: pass=False
2. `validate_financial_figures/known_bad_threshold_wrong.json`: pass=False
3. `confidence_scorer/known_bad_score_wrong.json`: pass=False
4. `low_confidence_gate/known_bad_disposition_wrong.json`: pass=False
5. `ratio_computer/known_bad_ratio_wrong.json`: pass=False

**All 5 known-bad scenarios produce pass=False — demonstrably RED at card level.**

### Revert

- Reverted `confidence_scorer/primitive.py` to correct logic
- `git diff apps/pdf-extractor/domain/`: EMPTY
- `git status apps/pdf-extractor/domain/ --short`: CLEAN
- Confidence_scorer trace restored to pass=True

**Final honest state: all 6 primitive traces = pass=True, module = pass=True, service = NOT-RUN**

---

## pytest final state

```
114 passed in 2.34s
EXIT_CODE=0
```

---

## G4 Evidence Summary

| Field | Value | Evidence |
|-------|-------|----------|
| `ac_4a_ci_job_wired` | YES | `.github/workflows/ci.yml` lines 206–228, job `py-lint`, working-directory: apps/pdf-extractor, runs lint-imports |
| `ac_4b_violation_proof` | YES | Fence-A BROKEN: `primitive.py -> infrastructure.startup (l.19)` EXIT_CODE=1 |
| `ac_4b_violation_file` | `domain/primitives/validate_financial_figures/primitive.py` | Line 19 |
| `ac_4b_violation_staged` | false | NEVER staged or committed |
| `ac_4b_revert_exit` | 0 | domain/ CLEAN post-revert |
| `ac_4c_fence_output` | `Fence-A: primitives must not import infrastructure, application, or interface BROKEN` | Literal output captured |
| `ac_4c_post_revert_exit` | 0 | Contracts: 2 kept, 0 broken |
| `g4_fence_bites` | true | Non-zero exit with explicit Fence-A name + file:line |
| `g4_ready_to_grade` | YES | All evidence compiled. G4 EARNED-PENDING (PO flips at 12/12 close). |

**No goal flips. SSOT not mutated. §4.5 honored.**

---

## Done Checklist

- [x] P2-A3: CI yml py-lint job verified well-formed (valid YAML, working-dir, lint-imports, fails on non-zero)
- [x] P2-A3: lint-imports exit 0 on clean codebase (2 contracts KEPT, 58 files)
- [x] P2-A4: Violation injected (infrastructure import in primitive)
- [x] P2-A4: lint-imports exit 1, Fence-A BROKEN, file:line named
- [x] P2-A4: Violation NEVER staged, NEVER committed
- [x] P2-A4: Revert → domain/ CLEAN, git diff EMPTY
- [x] P2-A4: Post-revert lint-imports exit 0
- [x] G6: All 6 primitive card IDs present in dashboard HTML
- [x] G6: TRACE_PATHS has all 8 entries (6 primitive + 1 module + 1 service)
- [x] G6: All 6 primitive traces generated and pass=True
- [x] G6: Module trace pass=True, service NOT-RUN honest
- [x] G8: Broken primitive → confidence_scorer card trace pass=False (card RED)
- [x] G8: 5 known-bad scenarios all pass=False
- [x] G8: Broken primitive reverted → domain/ CLEAN, traces restored to honest-green
- [x] pytest: 114 passed exit 0
- [x] Signal to emit: docs/signals/qa-pdf-extractor-P2-A-G6-G8-<UTC>.json
