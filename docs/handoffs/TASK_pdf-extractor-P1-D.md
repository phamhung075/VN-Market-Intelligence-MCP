---
task_id: P1-D
pilot: pdf-extractor
phase: "1"
title: "pdf-extractor Phase 1 — Module Scenario JSON (multi_primitive_story)"
owner: dev-pdf-extractor
status: Done
created: 2026-05-24
authored_by: dev-pdf-extractor
handoff_ref: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md §P1-D
plan_ssot: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md
charter_ref: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/pilot-charter.md
bctc_freeze: CLEAR
---

# TASK pdf-extractor/P1-D — Module Scenario JSON

## Context

Creates `scenarios/modules/financial_reports/multi_primitive_story.json` — the first
module-tier scenario exercising ≥2 primitives in sequence:
  1. decimal_normalizer (P1-B2) normalizes raw OCR strings
  2. validate_financial_figures (P1-B1) validates the normalized floats
  3. Composite confidence returned

**Pilot:** pdf-extractor | **Language:** Python | **Zone:** `apps/pdf-extractor/` ONLY
**Goals advanced:** G2 (module scenario), G7 (sandbox exit 0), G12 (supports streak)
**Blocks:** P1-E1

---

## Scope Delivered

1. `apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json` — multi-primitive story exercising 2 primitives in sequence

---

## Security Compliance (AC-3)

```
Command: grep -rniE "db_path|vps|vinahost|storage_dir|token|secret|api_key|password" \
    apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json
Result: 0 matches — CLEAR
```

Zero real VPS URLs, zero real DB paths, zero credential strings.

---

## Sandbox Evidence — Module Tier EXIT 0

```
Command: PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py \
    --tier=module \
    --scenario=apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json

Output:
{
  "primitive": null,
  "module": "financial_reports",
  "inputs": {
    "raw_assets": "10000.0",
    "raw_equity": "4000.0",
    "raw_liabilities": "6000.0",
    "raw_margin": "0.15",
    "raw_revenue": "5000.0",
    "unit_hint": "billion_vnd"
  },
  "expected": { "confidence": 1.0 },
  "actual": {
    "normalized_assets": 10000.0,
    "normalized_equity": 4000.0,
    "normalized_liabilities": 6000.0,
    "normalized_margin": 0.15,
    "normalized_revenue": 5000.0,
    "confidence": 1.0
  },
  "pass": true,
  "error": null
}
EXIT: 0 — PASS (GREEN)
```

**Pipeline: decimal_normalizer applied first (10000.0, 4000.0, 6000.0, 0.15, 5000.0 all normalized to float), then validate_financial_figures returned confidence=1.0 (all rules pass: assets > equity, assets > 0, liabilities > 0, margin in range, revenue > 0).**

---

## Primitives Exercised

| Order | Primitive | Input | Output |
|---|---|---|---|
| 1 | decimal_normalizer | raw_assets="10000.0", unit_hint="billion_vnd" | 10000.0 |
| 1 | decimal_normalizer | raw_equity="4000.0", unit_hint="billion_vnd" | 4000.0 |
| 1 | decimal_normalizer | raw_liabilities="6000.0", unit_hint="billion_vnd" | 6000.0 |
| 1 | decimal_normalizer | raw_margin="0.15", unit_hint="billion_vnd" | 0.15 |
| 1 | decimal_normalizer | raw_revenue="5000.0", unit_hint="billion_vnd" | 5000.0 |
| 2 | validate_financial_figures | (10000.0, 4000.0, 6000.0, 0.15, 5000.0) | confidence=1.0 |

**≥2 primitives exercised: CONFIRMED**

---

## Pytest Suite — 55/55 GREEN

```
PYTHONPATH=apps/pdf-extractor python -m pytest apps/pdf-extractor/__tests__/ -q
55 passed in 1.25s
```

---

## RETURN

```
DONE: P1-D multi_primitive_story.json created + module-tier sandbox EXIT 0
TASK: pdf-extractor/P1-D
ZONE: apps/pdf-extractor/
SECURITY: 0 credential strings in scenario JSON — CLEAR
MODULE-TIER: --tier=module --scenario=multi_primitive_story.json → EXIT 0
PRIMITIVES-EXERCISED: 2 (decimal_normalizer + validate_financial_figures)
PYTEST: 55/55 PASS
NEXT: P1-E1 (dashboard stub HTML)
PIPELINE: continue
```
