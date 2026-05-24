---
task_id: P1-B2
pilot: pdf-extractor
phase: "1"
title: "pdf-extractor Phase 1 — Second Primitive: decimal-normalizer [G12 streak contribution]"
owner: dev-pdf-extractor
status: Done
created: 2026-05-24
authored_by: dev-pdf-extractor
handoff_ref: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md §P1-B2
plan_ssot: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md
charter_ref: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/pilot-charter.md
bctc_freeze: CLEAR (READ-ONLY archaeology of mcp-server — zero mcp-server writes)
g12_streak: "contribution toward streak #2 (official streak #2 = P1-C)"
---

# TASK pdf-extractor/P1-B2 — Second Primitive: decimal-normalizer

## Context

Extracts and creates the `decimal_normalizer` primitive in `domain/primitives/decimal_normalizer/`.
This primitive fixes the decimal-shift bug class (VNM net_profit=0.000051, DHG rev=0.000009) by
multiplying raw_micro values by 1_000_000 to restore correct billion-VND magnitude.

Archaeology: read `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` +
`extractorHelpers.ts` to understand the decimal-shift fixture values. ZERO mcp-server writes.

**Pilot:** pdf-extractor | **Language:** Python | **Zone:** `apps/pdf-extractor/` ONLY
**Goals advanced:** G1 (second primitive), G12 (streak contribution)
**Blocks:** P1-C

---

## Scope Delivered

1. `apps/pdf-extractor/domain/primitives/decimal_normalizer/primitive.py` — pure `normalize_decimal()` function
2. `apps/pdf-extractor/domain/primitives/decimal_normalizer/__init__.py` — public exports + sandbox alias
3. `apps/pdf-extractor/__tests__/unit/test_decimal_normalizer.py` — 10 unit tests (all GREEN)
4. `apps/pdf-extractor/scenarios/primitives/decimal_normalizer/happy_normal.json` — "1234.5"→1234.5
5. `apps/pdf-extractor/scenarios/primitives/decimal_normalizer/edge_decimal_shift_vnm.json` — "0.000051"+raw_micro→51.0
6. `apps/pdf-extractor/scenarios/primitives/decimal_normalizer/failure_non_numeric.json` — "N/A"→null

---

## BCTC Freeze Enforcement (AC-5)

```
git diff --cached --name-only result: ZERO files from apps/mcp-server/
Freeze enforcement: PASS — no mcp-server files staged or committed.
```

---

## G12 DoD Gate Evidence (sandbox-green — MANDATORY)

### Pytest Suite — 47/47 GREEN

```
Command: PYTHONPATH=apps/pdf-extractor apps/pdf-extractor/.venv/bin/python -m pytest apps/pdf-extractor/__tests__/ -q

Output:
...............................................                          [100%]
47 passed in 1.05s
```

### Sandbox: happy_normal.json — EXIT 0 (GREEN)

```
Command: PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/decimal_normalizer/happy_normal.json

Output:
{
  "primitive": "decimal_normalizer",
  "inputs": { "raw_string": "1234.5", "unit_hint": "billion_vnd" },
  "expected": 1234.5,
  "actual": 1234.5,
  "pass": true,
  "error": null
}
EXIT: 0 — PASS (GREEN)
```

### Sandbox: edge_decimal_shift_vnm.json — EXIT 0 (GREEN)

```
Command: PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/decimal_normalizer/edge_decimal_shift_vnm.json

Output:
{
  "primitive": "decimal_normalizer",
  "inputs": { "raw_string": "0.000051", "unit_hint": "raw_micro" },
  "expected": 51.0,
  "actual": 51.0,
  "pass": true,
  "error": null
}
EXIT: 0 — PASS (GREEN) — VNM decimal-shift corrected (0.000051 × 1_000_000 = 51.0)
```

### Sandbox: failure_non_numeric.json — EXIT 0 (GREEN)

```
Command: PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/decimal_normalizer/failure_non_numeric.json

Output:
{
  "primitive": "decimal_normalizer",
  "inputs": { "raw_string": "N/A", "unit_hint": "billion_vnd" },
  "expected": null,
  "actual": null,
  "pass": true,
  "error": null
}
EXIT: 0 — PASS (GREEN) — failure scenario: expected=null, actual=null, pass=true
```

### All primitive tier scenarios (6 total) — ALL GREEN

```
validate_financial_figures/edge_vnm_val01.json    → pass=True actual=0.0
validate_financial_figures/failure_negative_assets.json → pass=True actual=0.0
validate_financial_figures/happy.json             → pass=True actual=1.0
decimal_normalizer/edge_decimal_shift_vnm.json    → pass=True actual=51.0
decimal_normalizer/failure_non_numeric.json       → pass=True actual=None
decimal_normalizer/happy_normal.json              → pass=True actual=1234.5
```

**G12 DoD gate: ALL 3 decimal_normalizer scenarios GREEN. All 6 primitive-tier scenarios GREEN.**

---

## Scenario Count

| Filename | Category | Rule | Expected |
|---|---|---|---|
| `happy_normal.json` | Happy | Normal billion VND string | 1234.5 |
| `edge_decimal_shift_vnm.json` | Edge | VNM decimal-shift correction (raw_micro) | 51.0 |
| `failure_non_numeric.json` | Failure | Non-numeric → None (no crash) | null |

**Total: 3 scenarios (happy=1, edge=1, failure=1)**

---

## Import Cleanliness (AC-4)

```
Command: grep -n "^from infrastructure\|^import infrastructure\|^from application\|^import pdfplumber\|^import pytesseract\|^import aiohttp" \
    apps/pdf-extractor/domain/primitives/decimal_normalizer/primitive.py
Result: (no output — 0 matches) — PASS
```

---

## RETURN

```
DONE: P1-B2 decimal-normalizer primitive created + scenarios GREEN
TASK: pdf-extractor/P1-B2
ZONE: apps/pdf-extractor/
BCTC-FREEZE: ENFORCED — zero mcp-server files in commit
SCENARIO-COUNT: 3 (happy_normal=1, edge_decimal_shift_vnm=1, failure_non_numeric=1)
SANDBOX-GREEN: all 3 scenarios EXIT 0
ALL-PRIMITIVE-SCENARIOS: 6/6 GREEN (validate_financial_figures × 3 + decimal_normalizer × 3)
PYTEST: 47/47 PASS
NEXT: P1-C (financial_reports module stub — G12 streak #2 OFFICIAL)
PIPELINE: continue
```
