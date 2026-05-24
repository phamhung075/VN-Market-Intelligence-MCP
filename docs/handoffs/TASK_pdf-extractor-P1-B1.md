---
task_id: P1-B1
pilot: pdf-extractor
phase: "1"
title: "pdf-extractor Phase 1 — First Primitive: validate-financial-figures [G12 streak #1]"
owner: dev-pdf-extractor
status: Done
created: 2026-05-24
authored_by: dev-pdf-extractor
handoff_ref: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md §P1-B1
plan_ssot: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md
charter_ref: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/pilot-charter.md
bctc_freeze: CLEAR (no mcp-server writes, no BCTC path touch)
g12_streak: "#1 of 3"
commit: b4765faa
---

# TASK pdf-extractor/P1-B1 — First Primitive: validate-financial-figures

## Context

G12 Streak #1. Extracts the pure `validate_financial_figures()` function from
`domain/services.py` into `domain/primitives/validate_financial_figures/primitive.py`.
The function was already pure and tested — this is a structural move, not a logic change.
All existing callers updated via re-export in `domain/services.py`.

**Pilot:** pdf-extractor | **Language:** Python | **Zone:** `apps/pdf-extractor/` ONLY
**Goals advanced:** G1 (first primitive), G12 (streak #1)
**Blocks:** P1-B2

---

## Scope Delivered

1. `apps/pdf-extractor/domain/primitives/validate_financial_figures/primitive.py` — pure function (moved from services.py:23-98)
2. `apps/pdf-extractor/domain/primitives/validate_financial_figures/__init__.py` — public export
3. `apps/pdf-extractor/domain/services.py` — call-site updated: `from domain.primitives.validate_financial_figures import validate_financial_figures # noqa: F401`
4. `apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json` — all figures valid → 1.0
5. `apps/pdf-extractor/scenarios/primitives/validate_financial_figures/edge_vnm_val01.json` — VNM Q4 2024 assets=957T < equity=18829T → 0.0 (VAL-01)
6. `apps/pdf-extractor/scenarios/primitives/validate_financial_figures/failure_negative_assets.json` — assets=-100 → 0.0 (VAL-02)

---

## P1-A3 Composition Root Verification (record here per task spec)

```
Command: grep -v "^[[:space:]]*$" apps/pdf-extractor/main.py | grep -v "^[[:space:]]*#" | wc -l
Result: 64
```

**A3 verdict: PASS — 64 logical lines (target ≤80). No domain logic, no data-value if-conditions.
Imports + DI wiring + server startup only. lifespan extracted to infrastructure/lifespan.py,
os.makedirs extracted to infrastructure/startup.py (both done in P1-A1).
No code change required for P1-A3 — verification only.**

---

## G12 DoD Gate Evidence (sandbox-green — MANDATORY)

### Pytest Suite — 37/37 GREEN

```
Command: PYTHONPATH=apps/pdf-extractor apps/pdf-extractor/.venv/bin/python -m pytest apps/pdf-extractor/__tests__/ -q

Output:
.....................................                                    [100%]
37 passed in 1.34s
```

### Sandbox: happy.json — EXIT 0 (GREEN)

```
Command: PYTHONPATH=apps/pdf-extractor apps/pdf-extractor/.venv/bin/python \
    apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json

Output:
{
  "primitive": "validate_financial_figures",
  "inputs": {
    "total_assets": 10000.0,
    "total_equity": 4000.0,
    "total_liabilities": 6000.0,
    "operating_margin": 0.15,
    "net_revenue": 5000.0
  },
  "expected": 1.0,
  "actual": 1.0,
  "pass": true,
  "error": null
}
EXIT: 0 — PASS (GREEN)
```

### Sandbox: edge_vnm_val01.json — EXIT 0 (GREEN)

```
Command: PYTHONPATH=apps/pdf-extractor apps/pdf-extractor/.venv/bin/python \
    apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/edge_vnm_val01.json

Output:
{
  "primitive": "validate_financial_figures",
  "inputs": {
    "total_assets": 957.0,
    "total_equity": 18829.0,
    "total_liabilities": 6000.0,
    "operating_margin": 0.12,
    "net_revenue": 3000.0
  },
  "expected": 0.0,
  "actual": 0.0,
  "pass": true,
  "error": null
}
EXIT: 0 — PASS (GREEN) — VNM VAL-01 hard violation correctly detected
```

### Sandbox: failure_negative_assets.json — EXIT 0 (GREEN)

```
Command: PYTHONPATH=apps/pdf-extractor apps/pdf-extractor/.venv/bin/python \
    apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive \
    --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/failure_negative_assets.json

Output:
{
  "primitive": "validate_financial_figures",
  "inputs": {
    "total_assets": -100.0,
    "total_equity": 4000.0,
    "total_liabilities": 6000.0,
    "operating_margin": 0.1,
    "net_revenue": 2000.0
  },
  "expected": 0.0,
  "actual": 0.0,
  "pass": true,
  "error": null
}
EXIT: 0 — PASS (GREEN) — VAL-02 negative assets hard violation correctly detected
```

### Honest RED verification (G8 proof)

```
echo '{"primitive":"validate_financial_figures","inputs":{"total_assets":-100.0,
"total_equity":4000.0,"total_liabilities":6000.0,"operating_margin":0.10,"net_revenue":2000.0},
"expected":1.0}' > /tmp/test_wrong.json

PYTHONPATH=apps/pdf-extractor apps/pdf-extractor/.venv/bin/python \
    apps/pdf-extractor/sandbox/runner.py \
    --tier=primitive --scenario=/tmp/test_wrong.json

Output:
{
  "primitive": "validate_financial_figures",
  "inputs": { "total_assets": -100.0, ... },
  "expected": 1.0,
  "actual": 0.0,
  "pass": false,
  "error": null
}
EXIT: 1 — FAIL (honest RED confirmed — G8)
```

**G12 DoD gate: ALL 3 scenarios GREEN. Honest RED confirmed. Streak #1 EARNED.**

---

## Scenario Count

| Filename | Category | Rule | Expected |
|---|---|---|---|
| `happy.json` | Happy | All valid figures | 1.0 |
| `edge_vnm_val01.json` | Edge | VAL-01: assets < equity | 0.0 |
| `failure_negative_assets.json` | Failure | VAL-02: negative assets | 0.0 |

**Total: 3 scenarios (happy=1, edge=1, failure=1)**

---

## Import Cleanliness (AC-3)

```
Command: grep -n "^from infrastructure\|^import infrastructure\|^from application\|^import pdfplumber\|^import pytesseract\|^import aiohttp" \
    apps/pdf-extractor/domain/primitives/validate_financial_figures/primitive.py
Result: (no output — 0 matches) — PASS
```

---

## RETURN

```
DONE: P1-B1 validate-financial-figures primitive extracted + scenarios GREEN
TASK: pdf-extractor/P1-B1
COMMIT: b4765faa
ZONE: apps/pdf-extractor/
G12-STREAK: #1 EARNED (sandbox-green evidence pasted above)
A3-VERIFIED: 64 logical lines in main.py (target ≤80, no code change needed)
SCENARIO-COUNT: 3 (happy=1, edge VNM-VAL01=1, failure-negative-assets=1)
SANDBOX-GREEN: all 3 scenarios EXIT 0
HONEST-RED: EXIT 1 on wrong-expected confirmed
PYTEST: 37/37 PASS
NEXT: P1-B2 (decimal-normalizer primitive)
PIPELINE: continue
```
