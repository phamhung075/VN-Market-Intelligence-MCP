---
title: "Phase 2 Task Plan (Python) — pdf-extractor Pilot"
date: "2026-05-24"
author: "architect (pdf-extractor phase-2)"
pilot: "pdf-extractor"
phase: "2"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-24-pdf-extractor-factory/pilot-charter.md"
phase1_plan_ref: "docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md"
phase1_closure_commit: "7247fd08"
brownfield_ref: "docs/architecture-briefs/2026-05-24-pdf-extractor-factory/p0-brownfield-inventory.md"
po_directive_signal: "docs/signals/po-20260524T083616Z.json"
freeze_ruling_ref: "docs/po-decisions/2026-05-24-pdf-extractor-g5b-freeze-ruling.md"
language: "Python"
fence_linter_choice: "import-linter (PyPI, lint-imports CLI)"
fence_linter_rationale: "Locked at Phase 0 (SI-4 SETTLED). import-linter uses pyproject.toml [tool.importlinter] contracts, runs fully offline, expresses layered + independent + forbidden import rules, and integrates with the existing pytest CI job (add a parallel py-lint step). Mirrors Go depguard offline pattern. tool command: lint-imports --config pyproject.toml."
bctc_freeze_status: "ACTIVE (1953-G-FAIL / 1954c). G5a + G5c CLEAR, dispatch normally. G5b HARD FROZEN — sequenced LAST, requires architect 1954c-clearance signal AND PO freeze-lift signal before PM may dispatch. See pilot-status-pdf-extractor.json phase2.bctc_freeze_gate."
---

# Phase 2 Task Plan (Python) — pdf-extractor Pilot

**Generated:** 2026-05-24 by architect (Phase 2 plan)
**Language:** Python (locked Day 0 — OCR/PDF ecosystem constraint)
**Status:** READY-FOR-DISPATCH to dev-pdf-extractor via PM

Phase 1 closed APPROVED (QA gate PASS @7247fd08, po cycle-292). All 5 gate criteria PASS.
Phase 2 closes the remaining deferred goals to reach 12/12.

---

## Phase 1 Delivered State (carry-forward into Phase 2)

| Deliverable | Status | Evidence |
|---|---|---|
| Sandbox runner `apps/pdf-extractor/sandbox/runner.py` | DONE | P1-A1 |
| Scenario dirs `scenarios/{primitives,modules,service}/` | DONE | P1-A2 |
| Composition root shrink `main.py` ≤80 LOC | DONE | P1-A3 (88L at last count — Phase 2 G3 re-verifies and shrinks to ≤80) |
| Primitive #1 `validate_financial_figures` (3 scenarios) | DONE | P1-B1 @b4765faa |
| Primitive #2 `decimal_normalizer` (3 scenarios) | DONE | P1-B2 |
| Module `financial_reports` (stub, 2 primitives composed) | DONE | P1-C @ce03ab35 |
| Module scenario `multi_primitive_story.json` | DONE | P1-D |
| Dashboard `dashboard/index.html` (2 primitive cards + module + service panels) | DONE | P1-E1 @d449879c |
| Edit-rerun handler + G7 all-4-sub-gates PASS | DONE | P1-E2 |
| G12 streak-3 COMPLETE | DONE | P1-B1 + P1-C + P1-E1 |
| G7 canonical env-audit form baked | DONE | `env -i PYTHONPATH=. python3 <runner>` → forbidden-grep EMPTY |

**Current scenario count:** 6 real (3 validate_financial_figures + 3 decimal_normalizer) + 3 echo_identity scaffold = 9 total.
**Phase 2 target:** ≥18 scenario JSONs (6 real primitives × ≥3 each; echo_identity stays as scaffold).

---

## Fence Linter Decision (P2-A tasks)

**Choice: `import-linter` via PyPI.**

Rationale (locked at Phase 0, SI-4 SETTLED, binding for P2-A implementation):

1. `pylint` import-checker — per-file rule only; no layered contract DSL. Rejected: too coarse for Fence-A/B independent-contract expressions.
2. `import-linter` (PyPI, `lint-imports` CLI) — contracts declared in `pyproject.toml [tool.importlinter]`; supports layered, independence, and forbidden contract types; runs fully offline; pure Python with zero binary dependency. **Selected.**
3. Custom AST walker — maximum control. Rejected: maintenance burden for a pilot; every layout evolution requires AST rule updates.

**Config location:** `apps/pdf-extractor/pyproject.toml` — append `[tool.importlinter]` section.

**Two fence contracts (Fence-A and Fence-B):**

```toml
[tool.importlinter]
root_package = "domain"
include_external_packages = true

[[tool.importlinter.contracts]]
name = "Fence-A: primitives must not import infrastructure, application, or interface"
type = "forbidden"
source_modules = [
    "domain.primitives",
]
forbidden_modules = [
    "infrastructure",
    "application",
    "interface",
]

[[tool.importlinter.contracts]]
name = "Fence-B: modules must not import infrastructure or interface; no cross-module imports"
type = "forbidden"
source_modules = [
    "domain.modules",
]
forbidden_modules = [
    "infrastructure",
    "interface",
]
```

**Note on Fence-B cross-module detection:** import-linter's forbidden contract catches any import from `infrastructure` or `interface` inside `domain.modules`. Cross-module imports (e.g., `domain.modules.financial_reports` importing `domain.modules.other`) are caught by an independence contract or by naming the other module in the forbidden list. At this pilot scale (one module only — `financial_reports`), the forbidden contract is sufficient; developer adds an independence contract at P2-A2 if a second module is introduced (it will not be during Phase 2 per anti-scope-creep clause).

**CI integration:** Add a parallel `py-lint` job to `.github/workflows/ci.yml` scoped to `working-directory: apps/pdf-extractor`. Job runs `pip install import-linter && lint-imports`. Runs alongside the existing `bun test` job — no `needs:` dependency.

---

## Summary

Phase 2 closes G1-full, G2-reverify, G3-full, G4, G5a, G5b (clearance-gated), G5c, G6-reverify, G7-reverify, G8-final, G9, G10, and G11. Then PO performs 12/12 matrix close (PO-only atomic).

Scope is closure-only. Anti-scope-creep and security clauses from pilot-charter.md §Anti-Scope-Creep and §Security Clause remain in force.

**WIP policy:** WIP=1. Single dev-pdf-extractor agent, sequential tasks. G5b sequenced LAST (freeze-gated). No parallel dispatch.

---

## Task Ledger

| ID | Title | Owner | Goals | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-------|--------|------------|-----|----------|
| **P2-B1** | Primitive #3: `confidence_scorer` (pure, ≥3 scenarios) | dev-pdf-extractor | G1-full | P2-B2 | — | 45m | 7 |
| **P2-B2** | Primitive #4: `low_confidence_gate` (pure, ≥3 scenarios, confidence-threshold logic) | dev-pdf-extractor | G1-full | P2-B3 | P2-B1 | 45m | 7 |
| **P2-B3** | Primitive #5: `ratio_computer` (pure, ≥3 scenarios) | dev-pdf-extractor | G1-full | P2-B4 | P2-B2 | 45m | 7 |
| **P2-B4** | Primitive #6: `field_extractor` (pure, ≥3 scenarios; READ-ONLY mcp-server archaeology, ZERO mcp-server write) | dev-pdf-extractor | G1-full | P2-C | P2-B3 | 1.5h | 8 |
| **P2-C** | G2 re-verify: module `financial_reports` composes all 6 primitives via ports; cross-module grep = 0 | dev-pdf-extractor | G2 | P2-D | P2-B4 | 45m | 6 |
| **P2-D** | G3-full: OpenAPI confirm + composition-root grep for primitive op-names → 0; main.py ≤80 LOC enforce | dev-pdf-extractor | G3 | P2-E | P2-C | 30m | 5 |
| **P2-E1** | G6 + G7 re-verify: dashboard renders all 6 primitive cards + module + service; G7 canonical env-audit | qa | G6, G7 | P2-E2 | P2-D | 30m | 6 |
| **P2-E2** | G8-final: QA introduces 1 deliberate broken primitive + 5 known-bad scenarios → 6 honest red cards | qa | G8 | P2-F | P2-E1 | 45m | 6 |
| **P2-F** | dev implements dashboard honesty for 6-card honest-red proof | dev-pdf-extractor | G8 | P2-A1 | P2-E2 | 1h | 6 |
| **P2-A1** | Pre-revert tag `pdf-extractor-pre-ci` + author `pyproject.toml [tool.importlinter]` Fence-A/B | dev-pdf-extractor | G4 | P2-A2 | P2-F | 30m | 6 |
| **P2-A2** | Add `py-lint` CI job to `.github/workflows/ci.yml` (working-dir: apps/pdf-extractor) | dev-pdf-extractor | G4 | P2-A3 | P2-A1 | 20m | 5 |
| **P2-A3** | Verify CI green on clean codebase (no violations) | qa | G4 | P2-A4 | P2-A2 | 15m | 4 |
| **P2-A4** | Deliberate-violation artifact: inject 1 Fence-A breach → lint-imports exits non-zero → revert (never committed) | qa | G4 | P2-G | P2-A3 | 20m | 5 |
| **P2-G** | G9 Playwright headless Path B: render dashboard/index.html via file://, assert panels/cards/honest-status, console_errors=0 | qa | G9 | P2-J0 | P2-A4 | 45m | 7 |
| **P2-J0** | Preflight: verify bug-inventory.json pdf_extractor_baseline baselineCycleCount=1.5 + select injection target | qa | G10 | P2-J1 | P2-A4 | 10m | 3 |
| **P2-J1** | Design and document bug-injection spec (decimal-shift or confidence-threshold literal) | qa | G10 | P2-J2 | P2-J0 | 20m | 5 |
| **P2-J2** | QA creates pre-inject tag `pdf-extractor-pre-inject`, injects bug; dispatches dev with dashboard scenario only | qa | G10 | P2-J3 | P2-J1 | 15m | 5 |
| **P2-J3** | dev-pdf-extractor fixes bug (≤2 cycles); dashboard GREEN; G12 DoD enforced | dev-pdf-extractor | G10, G12 | P2-K1 | P2-J2 | 1h | 5 |
| **P2-K1** | Trial-1 regression alarm: decimal-normalizer mutation + fix, ≥1 coupled scenario RED + single-edit fix green | qa + dev-pdf-extractor | G11 | P2-K2 | P2-J3 | 1h | 6 |
| **P2-K2** | Trial-2 regression alarm: DIFFERENT primitive (low_confidence_gate or confidence_scorer) mutation + fix, ≥1 coupled RED; outcome-(a)×2 = PASS | qa + dev-pdf-extractor | G11 | P2-G5a | P2-K1 | 1h | 6 |
| **P2-G5a** | Pre-delete tag `pdf-extractor-pre-delete`; move superseded in-service code (post-primitive-extraction remnants) to `_deprecated/` | dev-pdf-extractor | G5a | P2-G5c | P2-K2 | 30m | 5 |
| **P2-G5c** | Zero `TODO.*migrat` grep across apps/mcp-server/src/ + apps/pdf-extractor/ | qa | G5c | P2-G5b-clearance | P2-G5a | 15m | 3 |
| **P2-G5b-clearance** | G5b-clearance sub-task (ARCHITECT-owned): architect assesses 1954c consolidation status, authors clearance recommendation | architect | G5b-gate | P2-G5b-dispatch | P2-G5c + 1954c-landing | async | 5 |
| **P2-G5b-dispatch** | G5b rewire: HTTP-rewire `fetch_ssc_reports` + `bctc_batch_sweep` to call pdf-extractor port 5001 — HARD FROZEN until clearance + PO lift | dev-pdf-extractor | G5b | PO 12/12 close | P2-G5b-clearance + PO-freeze-lift-signal | frozen | 8 |

**Total atomic tasks:** 24 (4 B-bucket + 1 C + 1 D + 2 E + 1 F + 4 A-bucket + 1 G + 4 J + 2 K + 2 G5a/c + 1 clearance + 1 frozen dispatch)
**Tasks dispatchable immediately (BCTC-CLEAR):** 22 of 24 (P2-G5b-clearance and P2-G5b-dispatch are gated)
**G12 continuation streak tasks:** P2-J3 (streak #4), P2-K1 dev side (streak #5), P2-K2 dev side (streak #6) — each must show sandbox-green evidence before RETURN

---

## Sequencing

```
Day 1 (primitives chain — G1-full):
  P2-B1 (dev — confidence_scorer)
  → P2-B2 (dev — low_confidence_gate; blockedBy P2-B1)
  → P2-B3 (dev — ratio_computer; blockedBy P2-B2)
  → P2-B4 (dev — field_extractor READ-ONLY archaeology; blockedBy P2-B3)

Day 2 (module + composition root — G2/G3):
  P2-C (dev — G2 re-verify: module composes all 6 primitives; blockedBy P2-B4)
  → P2-D (dev — G3-full: OpenAPI confirm + grep + main.py ≤80; blockedBy P2-C)

Day 2-3 (dashboard + G6/G7/G8):
  P2-E1 (qa — G6+G7 re-verify; blockedBy P2-D)
  → P2-E2 (qa — G8 inject 6 red cards; blockedBy P2-E1)
  → P2-F (dev — dashboard honesty implementation; blockedBy P2-E2)

Day 3-4 (import-linter fence — G4):
  P2-A1 (dev — pre-ci tag + pyproject.toml fence; blockedBy P2-F)
  → P2-A2 (dev — CI job; blockedBy P2-A1)
  → P2-A3 (qa — verify CI green; blockedBy P2-A2)
  → P2-A4 (qa — deliberate-violation + revert; blockedBy P2-A3)

Day 4-5 (G9 Playwright + G10 AI-fix):
  P2-G  (qa — Playwright Path B; blockedBy P2-A4; primitives/dashboard stable)
  P2-J0 (qa — preflight; parallel with P2-G, no dependency conflict)
  → P2-J1 (qa — injection spec; blockedBy P2-J0)
  → P2-J2 (qa — inject + dispatch; blockedBy P2-J1)
  → P2-J3 (dev — blind fix ≤2 cycles; blockedBy P2-J2) ← G12 streak #4

Day 5-6 (G11 2-trial regression alarm):
  P2-K1 (qa+dev — Trial-1 decimal-normalizer; blockedBy P2-J3) ← G12 streak #5 (dev side)
  → P2-K2 (qa+dev — Trial-2 different primitive; blockedBy P2-K1) ← G12 streak #6 (dev side)

Day 6-7 (G5a + G5c — BCTC-CLEAR):
  P2-G5a (dev — pre-delete tag + _deprecated/ move; blockedBy P2-K2)
  → P2-G5c (qa — zero TODO.*migrat grep; blockedBy P2-G5a)

Day 7+ FROZEN (G5b — clearance gated):
  P2-G5b-clearance (architect — assess 1954c status + recommendation; blockedBy P2-G5c + 1954c-landing)
  → P2-G5b-dispatch (dev — HTTP-rewire; blockedBy clearance + PO-freeze-lift-signal)

After all deferred goals reach terminal state:
  PO 12/12 matrix close (PO-only atomic — NOT architect/dev/qa job)
```

**Critical path:** P2-B1 → P2-B4 → P2-C → P2-D → P2-E1 → P2-E2 → P2-F → P2-A1 → P2-A4 → P2-J0 → P2-J3 → P2-K2 → P2-G5a → P2-G5c → [P2-G5b-clearance] → [P2-G5b-dispatch]

**12/12 gate:** Cannot be reached until P2-G5b-dispatch completes OR architect rules at 1954c-landing that consolidation already routed the handler through the microservice (making G5b moot). Explicit statement: **12/12 is structurally blocked until G5b resolves**. See §G5b-Clearance Sub-Task below.

---

## BCTC-Freeze Assessment Per-Task

| Task | BCTC Path Touch? | Freeze Status |
|---|---|---|
| P2-B1 (confidence_scorer) | NO — pure apps/pdf-extractor/ Python | CLEAR |
| P2-B2 (low_confidence_gate) | NO — confidence-threshold logic lives in domain/primitives/, not mcp-server | CLEAR |
| P2-B3 (ratio_computer) | NO — pure arithmetic, no mcp-server touch | CLEAR |
| P2-B4 (field_extractor) | READ-ONLY mcp-server archaeology for regex patterns; ZERO mcp-server write | CLEAR (PM note: reads are safe; freeze applies to writes only) |
| P2-C (G2 re-verify) | NO | CLEAR |
| P2-D (G3-full) | NO | CLEAR |
| P2-E1 (G6+G7 re-verify) | NO | CLEAR |
| P2-E2 (G8 inject 6 red cards) | NO — apps/pdf-extractor/ only | CLEAR |
| P2-F (dashboard honesty) | NO | CLEAR |
| P2-A1 (pyproject.toml fence) | NO | CLEAR |
| P2-A2 (CI job) | NO | CLEAR |
| P2-A3 (CI verify) | NO | CLEAR |
| P2-A4 (deliberate-violation + revert) | NO — apps/pdf-extractor/ only; violation never committed | CLEAR |
| P2-G (Playwright G9) | NO | CLEAR |
| P2-J0 (bug-inventory preflight) | NO — read-only | CLEAR |
| P2-J1 (injection spec) | NO — doc only | CLEAR |
| P2-J2 (inject + dispatch) | NO — apps/pdf-extractor/ primitive only | CLEAR |
| P2-J3 (blind fix) | NO — apps/pdf-extractor/ only | CLEAR |
| P2-K1 (Trial-1 regression) | NO — apps/pdf-extractor/ only | CLEAR |
| P2-K2 (Trial-2 regression) | NO — apps/pdf-extractor/ only | CLEAR |
| P2-G5a (pre-delete + _deprecated/) | NO — apps/pdf-extractor/ internal move | CLEAR |
| P2-G5c (zero TODO.*migrat grep) | READ-ONLY verification grep | CLEAR |
| P2-G5b-clearance | Architect reads frozen files for assessment; ZERO writes | CLEAR (assessment only) |
| P2-G5b-dispatch | YES — touches fetchParseAndStoreBctc.ts + reports.ts + bctcBatchSweepJob.ts | **HARD FROZEN** until architect 1954c-clearance + PO freeze-lift |

---

## Per-Task Spec

---

### P2-B1 — Primitive #3: `confidence_scorer`

**Owner:** dev-pdf-extractor
**Goals:** G1-full
**Files to create:**
- `apps/pdf-extractor/domain/primitives/confidence_scorer/__init__.py`
- `apps/pdf-extractor/domain/primitives/confidence_scorer/primitive.py`
- `apps/pdf-extractor/scenarios/primitives/confidence_scorer/happy_high_conf.json`
- `apps/pdf-extractor/scenarios/primitives/confidence_scorer/edge_low_conf_with_tables.json`
- `apps/pdf-extractor/scenarios/primitives/confidence_scorer/failure_zero_conf_no_tables.json`

**Primitive contract (from brownfield §2 confidence-scorer candidate):**
```python
def score_confidence(ocr_confidence: float, table_count: int) -> dict:
    """
    Inputs: ocr_confidence (float 0.0–1.0), table_count (int ≥0)
    Output: {"pass": bool, "quality_score": float}
    Rule: if ocr_confidence < _OCR_CONFIDENCE_THRESHOLD (0.5) AND table_count == 0 → pass=False
    Pure function. Zero I/O. Zero infra imports.
    """
```

**Scenario design:**
- `happy_high_conf.json`: `ocr_confidence=0.85, table_count=2` → `pass=true, quality_score=0.85`
- `edge_low_conf_with_tables.json`: `ocr_confidence=0.3, table_count=3` → `pass=true` (tables compensate)
- `failure_zero_conf_no_tables.json`: `ocr_confidence=0.3, table_count=0` → `pass=false, quality_score=0.3`

**AC:**
1. `env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/confidence_scorer/happy_high_conf.json` exits 0.
2. Failure scenario exits non-zero (honest RED).
3. `grep -r "from infrastructure\|from application\|from interface\|import pdfplumber\|import pytesseract\|import aiohttp" apps/pdf-extractor/domain/primitives/confidence_scorer/primitive.py` returns 0 matches (Fence-A compliance preview).
4. ≥3 scenario JSON files created and all pass runner validation.
5. Existing tests still pass: `cd apps/pdf-extractor && python -m pytest __tests__/unit/ -q`.
6. `git diff --cached --name-only` before commit contains ZERO files from `apps/mcp-server/` (freeze enforcement).
7. G12 DoD gate: sandbox-green evidence (all primitive scenarios) pasted into handoff before RETURN.

**Atomic commit format:**
```
feat(pdf-extractor): P2-B1 — confidence_scorer primitive, 3 scenarios (G1-full)

Pure OCR confidence + table-count quality gate.
Threshold: ocr_confidence<0.5 AND table_count==0 → pass=False.
3 scenarios: happy + edge (low-conf+tables) + failure.
Zero infra imports confirmed.

Task: P2-B1 | AC: 7/7
```

---

### P2-B2 — Primitive #4: `low_confidence_gate`

**Owner:** dev-pdf-extractor
**Goals:** G1-full
**Files to create:**
- `apps/pdf-extractor/domain/primitives/low_confidence_gate/__init__.py`
- `apps/pdf-extractor/domain/primitives/low_confidence_gate/primitive.py`
- `apps/pdf-extractor/scenarios/primitives/low_confidence_gate/happy_normal.json`
- `apps/pdf-extractor/scenarios/primitives/low_confidence_gate/edge_low_confidence_flag.json`
- `apps/pdf-extractor/scenarios/primitives/low_confidence_gate/failure_zero_skip.json`

**Primitive contract (confidence-threshold logic — canonical boundaries from BCTC insert-gate):**
```python
from typing import Literal

def gate_confidence(confidence: float) -> Literal["skip", "low_confidence", "normal"]:
    """
    Canonical BCTC insert-gate logic:
      confidence == 0   → "skip"   (do not insert)
      confidence < 0.2  → "low_confidence" (insert with flag)
      confidence >= 0.2 → "normal" (insert normally)
    Pure function. Zero I/O. Zero infra imports.
    """
```

**Scenario design (CRITICAL — boundaries are load-bearing):**
- `happy_normal.json`: `confidence=0.85` → `disposition="normal"`
- `edge_low_confidence_flag.json`: `confidence=0.15` → `disposition="low_confidence"` (boundary: <0.2 not <=0.2)
- `failure_zero_skip.json`: `confidence=0.0` → `disposition="skip"` (exact zero gate)

**IMPORTANT boundary note for scenarios:** The 0.0 case and the 0.2 boundary are the critical correctness points. Scenarios must encode: `confidence=0.0→skip`, `confidence=0.19→low_confidence`, `confidence=0.20→normal`. The `edge_low_confidence_flag.json` above uses 0.15; developer may add a `boundary_0_19.json` and `boundary_0_20.json` as optional extra scenarios (each is a single literal change — these become the natural G10 injection targets).

**AC:**
1. `env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/low_confidence_gate/happy_normal.json` exits 0.
2. `failure_zero_skip.json` runner exits 0 (pass=true because expected=skip and actual=skip is a PASS in the runner trace schema).
3. `grep -r "from infrastructure\|from application\|from interface" apps/pdf-extractor/domain/primitives/low_confidence_gate/primitive.py` returns 0 matches.
4. Boundaries encoded in scenarios exactly: `confidence=0.0→skip`, `confidence<0.2→low_confidence`, `confidence>=0.2→normal`.
5. Existing tests still pass.
6. `git diff --cached --name-only` ZERO mcp-server files.
7. G12 DoD gate: sandbox-green evidence pasted before RETURN.

**Atomic commit format:**
```
feat(pdf-extractor): P2-B2 — low_confidence_gate primitive, 3 scenarios (G1-full)

Canonical BCTC insert-gate: 0=skip, <0.2=low_confidence, >=0.2=normal.
Boundaries are G10+G11 injection targets (single-literal confidence threshold).
Zero infra imports. 3 scenarios cover all 3 dispositions.

Task: P2-B2 | AC: 7/7
```

---

### P2-B3 — Primitive #5: `ratio_computer`

**Owner:** dev-pdf-extractor
**Goals:** G1-full
**Files to create:**
- `apps/pdf-extractor/domain/primitives/ratio_computer/__init__.py`
- `apps/pdf-extractor/domain/primitives/ratio_computer/primitive.py`
- `apps/pdf-extractor/scenarios/primitives/ratio_computer/happy_gross_margin.json`
- `apps/pdf-extractor/scenarios/primitives/ratio_computer/edge_zero_denominator.json`
- `apps/pdf-extractor/scenarios/primitives/ratio_computer/failure_negative_equity.json`

**Primitive contract:**
```python
from typing import Optional

def compute_ratio(numerator: float, denominator: float, ratio_type: str) -> Optional[float]:
    """
    Inputs: numerator (float), denominator (float), ratio_type (str: "gross_margin" | "debt_equity" | "roe")
    Output: float | None (None when denominator=0 or inputs invalid)
    Examples:
      gross_margin: gross_profit / net_revenue
      debt_equity: total_liabilities / equity
      roe: net_income / equity
    Pure function. Zero I/O. Zero infra imports.
    """
```

**Scenario design:**
- `happy_gross_margin.json`: `numerator=300.0, denominator=1000.0, ratio_type="gross_margin"` → `ratio=0.30`
- `edge_zero_denominator.json`: `numerator=100.0, denominator=0.0, ratio_type="debt_equity"` → `ratio=null` (no crash, None returned)
- `failure_negative_equity.json`: `numerator=500.0, denominator=-50.0, ratio_type="debt_equity"` → `ratio=-10.0` (valid arithmetic; consumer responsibility to flag)

**AC:**
1. Runner exits 0 on happy scenario.
2. `edge_zero_denominator.json` exits 0 (pass=true, expected=null, actual=null).
3. Fence-A compliance: zero infra/application/interface imports.
4. ≥3 scenarios all validated by runner.
5. Existing tests pass.
6. Zero mcp-server files in staged diff.
7. G12 DoD gate satisfied.

**Atomic commit format:**
```
feat(pdf-extractor): P2-B3 — ratio_computer primitive, 3 scenarios (G1-full)

Financial ratio computation: gross_margin, debt_equity, ROE.
Zero-denominator → None (no exception). Pure function.

Task: P2-B3 | AC: 7/7
```

---

### P2-B4 — Primitive #6: `field_extractor`

**Owner:** dev-pdf-extractor
**Goals:** G1-full
**READ-ONLY archaeology constraint:** dev-pdf-extractor reads `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` regex patterns to design the Python field extraction logic. **ZERO writes to mcp-server.** The new primitive code lives only in `apps/pdf-extractor/domain/primitives/field_extractor/`. If any mcp-server file appears in `git diff --cached`, the task is BLOCKED — unstage before commit.

**Files to create:**
- `apps/pdf-extractor/domain/primitives/field_extractor/__init__.py`
- `apps/pdf-extractor/domain/primitives/field_extractor/primitive.py`
- `apps/pdf-extractor/scenarios/primitives/field_extractor/happy_net_revenue.json`
- `apps/pdf-extractor/scenarios/primitives/field_extractor/edge_field_not_found.json`
- `apps/pdf-extractor/scenarios/primitives/field_extractor/failure_malformed_text.json`

**Primitive contract (regex-based field extraction from OCR text):**
```python
from typing import Optional

def extract_field(text: str, field_name: str) -> Optional[str]:
    """
    Inputs: text (str — OCR output), field_name (str: "net_revenue" | "net_profit" | "total_assets" | "equity")
    Output: str | None (raw extracted string before decimal-normalizer applies)
    Uses regex patterns derived from BCTC structure. Pure function. Zero I/O.
    """
```

**Scenario design:**
- `happy_net_revenue.json`: text with "Doanh thu thuần: 1,234.5" + field_name="net_revenue" → `"1,234.5"`
- `edge_field_not_found.json`: text without the target field + field_name="net_profit" → `null`
- `failure_malformed_text.json`: empty string input → `null` (no exception)

**AC:**
1. Runner exits 0 on happy scenario.
2. `edge_field_not_found.json` exits 0 (expected=null, actual=null → pass=true).
3. Fence-A: zero infra/application/interface imports.
4. ≥3 scenarios.
5. `git diff --cached --name-only` contains ZERO files from `apps/mcp-server/` (FREEZE ENFORCEMENT).
6. Existing tests pass.
7. G12 DoD gate satisfied.
8. Regex patterns derived from mcp-server archaeology are documented in `primitive.py` as a comment explaining the pattern source (e.g., `# Pattern adapted from fetchParseAndStoreBctc.ts regex heuristics — READ-ONLY reference`).

**Atomic commit format:**
```
feat(pdf-extractor): P2-B4 — field_extractor primitive, 3 scenarios (G1-full)

Regex-based named-field extraction from OCR text (BCTC structure).
Archaeology of mcp-server BCTC parsers — ZERO mcp-server write (freeze enforcement).
6 primitives total. G1-full band complete (≥18 scenarios pending re-verify).

Task: P2-B4 | AC: 8/8
```

---

### P2-C — G2 Re-verify: module composes all 6 primitives

**Owner:** dev-pdf-extractor
**Goals:** G2
**Files to modify:**
- `apps/pdf-extractor/domain/modules/financial_reports/ports.py` — add Protocol ports for 4 new primitives (ConfidenceScorerPort, LowConfidenceGatePort, RatioComputerPort, FieldExtractorPort)
- `apps/pdf-extractor/domain/modules/financial_reports/module.py` — wire all 6 primitives via ports
- `apps/pdf-extractor/domain/modules/financial_reports/mock_ports.py` — add mock implementations for 4 new ports
- `apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json` — update to exercise ≥3 primitives in sequence (or add a second module scenario)
- `apps/pdf-extractor/__tests__/unit/test_financial_reports_module.py` — update module unit test to inject all 6 mock ports

**AC:**
1. `from domain.modules.financial_reports import FinancialReportsModule` imports cleanly.
2. `grep -r "from infrastructure" apps/pdf-extractor/domain/modules/` returns 0 matches (Fence-B compliance preview).
3. `grep -rn "from domain.modules.financial_reports" apps/pdf-extractor/domain/modules/financial_reports/` returns 0 matches (no self-import cross-module leak).
4. Module `FinancialReportsModule` constructor accepts all 6 ports via dependency injection.
5. `env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=module --scenario=apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json` exits 0.
6. Module unit test in `test_financial_reports_module.py` passes with AsyncMock/mock ports — zero real infrastructure.

**Smoke check:**
```bash
env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=module --scenario=apps/pdf-extractor/scenarios/modules/financial_reports/multi_primitive_story.json
grep -r "from infrastructure" apps/pdf-extractor/domain/modules/
# Both: exit 0 / return 0 matches
```

**Atomic commit format:**
```
feat(pdf-extractor): P2-C — G2 re-verify: financial_reports module composes all 6 primitives

All 6 Protocol ports wired. Module scenario GREEN. Cross-module grep=0. Fence-B preview clean.

Task: P2-C | AC: 6/6
```

---

### P2-D — G3-full: OpenAPI confirm + composition-root grep

**Owner:** dev-pdf-extractor
**Goals:** G3
**Files to verify/modify:**
- `apps/pdf-extractor/main.py` — ensure ≤80 LOC (currently 88L per Phase-1 measurement; may need additional 8-line reduction)
- `apps/pdf-extractor/interface/` — confirm OpenAPI contract accessible at `/openapi.json` (FastAPI auto-generates; this task confirms it is served and captures evidence)

**Context:** Phase 1 (P1-A3) reduced main.py from 101L to ≤80 logical lines. The 88L count above is the raw line count including blanks — developer must re-verify. If main.py is still >80 logical non-blank non-comment lines, extract any remaining startup logic (additional helpers to `infrastructure/startup.py` or `infrastructure/lifespan.py`).

**AC:**
1. `wc -l apps/pdf-extractor/main.py` ≤88 raw lines AND `grep -c "^[^#[:space:]]" apps/pdf-extractor/main.py` (non-blank, non-comment) ≤80.
2. `curl -s http://localhost:5001/openapi.json | python3 -m json.tool` exits 0 (service running during verification) — OR: `python3 -c "from main import create_app; app = create_app(); import json; print(app.openapi())"` executed with PYTHONPATH=apps/pdf-extractor returns valid JSON schema.
3. `grep -n "normalize\|score\|compute_ratio\|extract_field\|gate_confidence" apps/pdf-extractor/main.py` returns 0 matches (primitive op-names must not appear in composition root).
4. `grep -n "validate_financial_figures\|decimal_normalizer\|confidence_scorer\|low_confidence_gate\|ratio_computer\|field_extractor" apps/pdf-extractor/main.py` returns 0 matches (primitive module paths must not appear in composition root — they are wired via use-case and module, not directly in main.py).
5. `apps/pdf-extractor/interface/` directory contains at minimum `handlers.py` and `serializers.py` (HTTP contract layer is present — confirms G3 "HTTP interface contract documented" clause).

**Smoke check:**
```bash
grep -n "normalize\|score\|compute_ratio\|extract_field\|gate_confidence" /path/to/apps/pdf-extractor/main.py
# Must return 0 matches
wc -l apps/pdf-extractor/main.py
```

**Atomic commit format:**
```
feat(pdf-extractor): P2-D — G3-full: OpenAPI confirm + composition-root grep=0

main.py ≤80 LOC enforced. Primitive op-names absent from composition root.
FastAPI /openapi.json served. G3 verification complete.

Task: P2-D | AC: 5/5
```

---

### P2-E1 — G6 + G7 re-verify: dashboard 6-card render + canonical env-audit

**Owner:** qa
**Goals:** G6, G7
**Files touched:** none (verification only — evidence recorded in handoff)

**Canonical G7 env-audit form (QA durable ruling — baked here):**
```bash
env -i PYTHONPATH=. python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=<any-scenario>
# Then in the runner's process context:
env | grep -iE "DB_PATH|VPS_|VINAHOST|STORAGE_DIR|OCR|TESSERACT|TOKEN|SECRET|API_KEY|PASSWORD"
# Must return EMPTY
```
CTX_ADVISOR_* variables are Claude Code harness context-sizing integers — NOT credentials. Exclude from forbidden grep. This is the unambiguous final goal-gate form for "sandbox env audit returns empty."

**AC:**
1. Open `apps/pdf-extractor/dashboard/index.html` via `file://` in a browser. Six primitive cards visible (validate-financial-figures, decimal-normalizer, confidence-scorer, low-confidence-gate, ratio-computer, field-extractor) plus module (financial-reports) plus service (pdf-extractor) panel.
2. After running `env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive` (all primitives), all 6 primitive cards show GREEN.
3. After running `env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=module`, the financial-reports module card shows GREEN.
4. G7 env-audit: `env -i PYTHONPATH=. python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=<any>` → forbidden-grep EMPTY (canonical form confirmed).
5. Zero JavaScript console errors on dashboard load.
6. Evidence: QA screenshot of all 3 panels open + terminal output of env-audit pasted in handoff.

**Note:** If dashboard currently shows only 2 primitive cards (Phase-1 stub), dev-pdf-extractor must update `dashboard/index.html` to add 4 new primitive cards BEFORE P2-E1 dispatches. PM must sequence this correctly: P2-D (G3) completes first → dev updates dashboard cards as part of P2-D or P2-F prep → P2-E1 then verifies. Architect recommendation: include dashboard card expansion in P2-C or P2-D scope (updating HTML to add 4 placeholder cards that are populated by the runner).

**Atomic commit format:** No commit — QA records evidence in handoff file only.

---

### P2-E2 — G8-final: 1 deliberate broken primitive + 5 known-bad scenarios

**Owner:** qa
**Goals:** G8
**Files to create (permanent artefacts — never delete):**
- `apps/pdf-extractor/scenarios/primitives/decimal_normalizer/known_bad_expected_wrong.json` — valid input, intentionally wrong expected value
- `apps/pdf-extractor/scenarios/primitives/validate_financial_figures/known_bad_threshold_wrong.json`
- `apps/pdf-extractor/scenarios/primitives/confidence_scorer/known_bad_score_wrong.json`
- `apps/pdf-extractor/scenarios/primitives/low_confidence_gate/known_bad_disposition_wrong.json`
- `apps/pdf-extractor/scenarios/primitives/ratio_computer/known_bad_ratio_wrong.json`
- One deliberate bug in a chosen primitive (TEMP MODIFY — reverted after G8 honesty is proven; see AC-5)

**AC:**
1. QA creates 5 scenario JSON files with intentionally wrong `expected` values (outputs that do not match what the code actually produces). Running each through the sandbox exits non-zero and shows RED on dashboard.
2. QA modifies ONE primitive (e.g., `decimal_normalizer/primitive.py`) to return a wrong value (deliberate bug). Runs sandbox → that primitive's card shows RED on dashboard.
3. Dashboard shows 6 total red cards: 5 known-bad scenarios + 1 broken primitive card.
4. All other previously-green primitive and module scenarios remain GREEN (isolated to the 6 red cases).
5. QA reverts the deliberate bug in the primitive file (a separate commit) — dashboard returns to 5-red-known-bad (the 5 permanent known-bad JSON files stay; the broken primitive reverts to good code). The 5 permanent bad-expected JSON files remain in the scenarios directory permanently as honesty fixtures.
6. Evidence: QA captures `honesty_table` (mapping each red card to its scenario file) + screenshots `test_a` (6-red state) + `test_b` (revert, green-with-5-red-fixtures state) in handoff.

**Atomic commit format (5 known-bad files):**
```
test(pdf-extractor): P2-E2 — G8 honesty fixtures: 5 known-bad scenario files (permanent)

Permanent RED fixtures for G8 dashboard honesty proof.
Expected values intentionally wrong. Will always show RED.
QA honesty_table in handoff.

Task: P2-E2 | AC: 5 known-bad files created
```

---

### P2-F — Dashboard honesty implementation

**Owner:** dev-pdf-extractor
**Goals:** G8
**Files to modify:**
- `apps/pdf-extractor/dashboard/index.html` — ensure dashboard honestly reflects per-card pass/fail from trace JSON (no hard-coded GREEN; status driven entirely from sandbox runner output)
- `apps/pdf-extractor/sandbox/runner.py` — if needed, extend to produce per-card trace entries for all 6 primitives

**AC:**
1. Dashboard card colour (green/red) is driven entirely from the runner's trace JSON, not from any hard-coded HTML class.
2. Running `env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive` with a broken primitive → that card shows RED; all others GREEN.
3. Running the 5 known-bad scenario files → 5 RED cards in the primitives panel.
4. Running the known-good scenarios → those cards GREEN.
5. No false-green possible: if runner exits non-zero for a scenario, the card must show RED.
6. G12 DoD gate: sandbox-green evidence for all previously-passing scenarios (i.e., non-known-bad scenarios) pasted into handoff before RETURN. Known-bad fixtures remain RED — that is correct behaviour.

**Atomic commit format:**
```
feat(pdf-extractor): P2-F — G8 honest dashboard: card status driven from runner trace JSON

No hard-coded green. RED = runner exit non-zero. Known-bad fixtures show RED (correct).
All 6 primitive cards + module card + service panel render from trace output.

Task: P2-F | AC: 6/6
```

---

### P2-A1 — Pre-revert tag + `pyproject.toml` Fence-A/B

**Owner:** dev-pdf-extractor
**Goals:** G4
**Files to modify:**
- `apps/pdf-extractor/pyproject.toml` — append `[tool.importlinter]` section with Fence-A and Fence-B contracts

**Pre-condition:** Create git tag BEFORE any CI or fence changes:
```bash
git tag pdf-extractor-pre-ci
```
This tag must point to the clean pre-fence commit. Tag is created BEFORE the pyproject.toml edit. No --force retag. If tag already exists (should not), abort and report to PM.

**AC:**
1. `git tag pdf-extractor-pre-ci` created and pointing to the commit immediately before this task's changes.
2. `apps/pdf-extractor/pyproject.toml` has `[tool.importlinter]` section with root_package and ≥2 contracts (Fence-A and Fence-B) per §Fence Linter Decision above.
3. `cd apps/pdf-extractor && pip install import-linter && lint-imports` exits 0 on the current clean codebase (no violations — the primitives already imported cleanly).
4. `python3 -c "import tomllib; d=tomllib.load(open('apps/pdf-extractor/pyproject.toml','rb')); print(d['tool']['importlinter'])"` exits 0 and prints the importlinter section (TOML valid).
5. Fence-A contract: source_modules=`domain.primitives`, forbidden_modules=`infrastructure`, `application`, `interface`.
6. Fence-B contract: source_modules=`domain.modules`, forbidden_modules=`infrastructure`, `interface`.

**Smoke check:**
```bash
cd apps/pdf-extractor && pip install import-linter && lint-imports
# Must exit 0
```

**Atomic commit format:**
```
chore(arch/pdf-extractor): P2-A1 — import-linter Fence-A/B in pyproject.toml; pdf-extractor-pre-ci tag

G4 per pilot-charter. Fence-A: domain.primitives must not import infrastructure/application/interface.
Fence-B: domain.modules must not import infrastructure/interface.
lint-imports exits 0 on clean codebase.

Task: P2-A1 | AC: 6/6
```

---

### P2-A2 — Add `py-lint` CI job to `.github/workflows/ci.yml`

**Owner:** dev-pdf-extractor
**Goals:** G4
**Files to modify:**
- `.github/workflows/ci.yml` — add parallel `py-lint` job scoped to `apps/pdf-extractor/`

**AC:**
1. A new job named `py-lint` added to `.github/workflows/ci.yml`.
2. Job uses `ubuntu-latest`, `timeout-minutes: 10`.
3. Job installs Python (3.11+) via `actions/setup-python`, installs `import-linter` via pip.
4. Job runs `cd apps/pdf-extractor && pip install import-linter && lint-imports`.
5. Job runs in parallel with (not dependent on) the existing `bun test` job — no `needs:` clause pointing to `test`.
6. YAML is valid: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"` exits 0.

**Note on import-linter invocation:** `lint-imports` discovers config from `pyproject.toml` automatically when run from the package directory. If discovery fails, add `--config pyproject.toml` explicitly.

**Smoke check:**
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "YAML valid"
```

**Atomic commit format:**
```
chore(arch/ci): P2-A2 — add py-lint CI job for pdf-extractor import-linter fence

Parallel CI job. lint-imports enforces Fence-A/B on every push.
Gate: CI fails if any import violates fence rules.

Task: P2-A2 | AC: 6/6
```

---

### P2-A3 — Verify CI green on clean codebase

**Owner:** qa
**Goals:** G4
**Files touched:** none (verification only)

**AC:**
1. Trigger a push to `main` (or observe the commit from P2-A2) — CI runs both `bun test` and `py-lint` jobs.
2. `py-lint` job exits green (exit 0) on the current codebase.
3. `bun test` job is unaffected (still exits 0).
4. Evidence: CI run URL + log excerpt showing `py-lint: passed` recorded in handoff.

**Smoke check:**
```bash
gh run list --limit 5 --json status,conclusion,name
# Look for py-lint with conclusion: success
```

**Atomic commit format:** No commit — QA records CI run URL + evidence in handoff.

---

### P2-A4 — Deliberate-violation artifact: CI red/green cycle proof

**Owner:** qa
**Goals:** G4
**Files touched:**
- `apps/pdf-extractor/domain/primitives/validate_financial_figures/primitive.py` (TEMP MODIFY — add forbidden import, then revert)

**Protocol:**
1. QA adds a deliberate Fence-A violation: one line `from infrastructure import config` (or any infra import) at the top of `validate_financial_figures/primitive.py`.
2. Commit: `test(arch/ci): P2-A4-violation — deliberate Fence-A import for CI red proof`
3. Observe CI run → `py-lint` job exits non-zero (red); `bun test` is unaffected.
4. Revert the violation in a second commit: `test(arch/ci): P2-A4-revert — remove deliberate Fence-A import`
5. Observe CI run → `py-lint` job exits 0 (green).
6. Evidence: two CI run URLs (one red, one green) + `lint-imports` output excerpt showing the violation message recorded in handoff.

**AC:**
1. Violation commit contains one forbidden import that lint-imports catches.
2. CI py-lint job exits non-zero on violation commit.
3. Revert commit removes the violation cleanly.
4. CI py-lint job exits 0 on revert commit.
5. `bun test` unaffected throughout.

**Atomic commit formats:**
```
test(arch/ci): P2-A4-violation — deliberate Fence-A import for CI red proof
(Note: Never merged to any release branch. Evidence only.)

test(arch/ci): P2-A4-revert — remove deliberate Fence-A import
```

---

### P2-G — G9: Playwright headless Path B trust contract

**Owner:** qa
**Goals:** G9
**Files to create:**
- `apps/pdf-extractor/dashboard/playwright.config.js` (or `.ts`)
- `apps/pdf-extractor/dashboard/trust-contract.spec.js` (Playwright test)
- `apps/pdf-extractor/dashboard/trust-contract-verdict.json` (VERDICT output committed)

**Pre-condition:** Dashboard must be in a fully populated state (all 6 primitive cards GREEN after runner, honest RED on known-bad fixtures) before Playwright runs. QA verifies this before dispatching P2-G.

**Playwright approach (Path B — Day-0 default per L6 carry-over):**
```javascript
// trust-contract.spec.js skeleton
const { test, expect } = require('@playwright/test');
const path = require('path');

test('pdf-extractor dashboard trust contract', async ({ page }) => {
  const htmlPath = path.resolve(__dirname, 'index.html');
  await page.goto('file://' + htmlPath);

  // Panels rendered
  await expect(page.locator('.panel-primitives')).toBeVisible();
  await expect(page.locator('.panel-module')).toBeVisible();
  await expect(page.locator('.panel-service')).toBeVisible();

  // Cards per tier: 6 primitive cards
  const primitiveCards = page.locator('.panel-primitives .card');
  await expect(primitiveCards).toHaveCount(6);

  // Honest status: known-bad fixtures show RED
  // (QA verifies at least 1 red card exists from known-bad fixtures)
  const redCards = page.locator('.card.red, .card.status-fail');
  await expect(redCards.count()).resolves.toBeGreaterThanOrEqual(1);

  // Zero console errors
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  expect(errors).toHaveLength(0);

  // Zero network calls (file:// + no external requests)
  const networkRequests = [];
  page.on('request', req => networkRequests.push(req.url()));
  expect(networkRequests.filter(url => url.startsWith('http'))).toHaveLength(0);
});
```

**VERDICT JSON format:**
```json
{
  "verdict": "PASS",
  "capturedAt": "<ISO UTC>",
  "capturedBy": "qa",
  "panels_rendered": ["primitives", "module", "service"],
  "cards_per_tier": {"primitives": 6, "module": 1, "service": 1},
  "status_honest": true,
  "console_errors": 0,
  "network_calls_blocked": true
}
```

**AC:**
1. `npx playwright test apps/pdf-extractor/dashboard/trust-contract.spec.js` exits 0.
2. All 3 panels visible (primitives, module, service).
3. Exactly 6 primitive cards rendered.
4. At least 1 red card visible (known-bad fixture confirms honesty).
5. Zero console errors captured.
6. Zero HTTP network requests (file:// only).
7. `trust-contract-verdict.json` committed with `verdict: "PASS"`.

**Atomic commit format:**
```
test(pdf-extractor): P2-G — G9 Playwright trust contract PASS + verdict JSON

Path B headless. 3 panels / 6 primitive cards / honest status / 0 console errors / 0 network calls.

Task: P2-G | AC: 7/7
```

---

### P2-J0 — Preflight: bug-inventory baseline confirmation

**Owner:** qa
**Goals:** G10
**Files touched:** none (read-only verification)

**Architect finding (verified):**
`docs/data/bug-inventory.json` has `pdf_extractor_baseline` block with `baselineCycleCount=1.5`. Two injection candidates identified: `BCTC-decimal-shift-class` (decimal-normalizer primitive, `g10InjectionCandidate=true`) and `BCTC-confidence-threshold-boundary` (low_confidence_gate primitive, `g10InjectionCandidate=true`).

**AC:**
1. `docs/data/bug-inventory.json` valid JSON with `pdf_extractor_baseline.baselineCycleCount=1.5`.
2. At least 1 bug with `g10InjectionCandidate=true` in the baseline entry.
3. QA selects injection target: recommended = `decimal_normalizer` (G10) + `low_confidence_gate` (G11 Trial-2). Records in handoff.
4. Verify `pdf-extractor-pre-inject` tag does NOT yet exist (it will be created at P2-J2).

**Smoke check:**
```bash
python3 -c "
import json
d = json.load(open('docs/data/bug-inventory.json'))
b = d['pdf_extractor_baseline']
print('baseline:', b['baselineCycleCount'])
print('candidates:', [x['id'] for x in b['bugsIdentified'] if x.get('g10InjectionCandidate')])
"
```

**Atomic commit format:** No commit — preflight only. QA records result in handoff.

---

### P2-J1 — Design and document bug-injection spec

**Owner:** qa
**Goals:** G10
**Files to create:**
- `docs/architecture-briefs/2026-05-24-pdf-extractor-factory/p2-j-bug-injection-spec.md`

**Bug injection design (architect recommendation):**

**G10 target: `decimal_normalizer` primitive — decimal-shift single-literal.**

Inject a single-literal bug in `apps/pdf-extractor/domain/primitives/decimal_normalizer/primitive.py`:
Change the scale multiplier from `1e6` (or the correct billion-VND scaling constant) to `1e9` (or the wrong scale) in the `normalize_decimal()` function. This is the exact real-world decimal-shift bug class (VNM net_profit=0.000051 vs 51.0). The `edge_decimal_shift_vnm.json` scenario will flip from GREEN to RED immediately — proving the dashboard is the signal contract.

**G11 Trial-1 note:** G10 fix = G11 Trial-1 (decimal-normalizer is the G10 alias). The coupled scenario for Trial-1 is the `multi_primitive_story.json` module scenario (which exercises decimal_normalizer inside the module). If the fix changes normalizer behavior, the module scenario may flip RED — that is the regression canary for Trial-1.

**G11 Trial-2 target: `low_confidence_gate` primitive — threshold boundary single-literal.**
Change `0.2` to `0.3` in `gate_confidence()`. The `edge_low_confidence_flag.json` scenario (confidence=0.15) will still show `low_confidence` correctly with 0.3, BUT `boundary_0_20.json` (confidence=0.20 → should be `normal`) will now show `low_confidence` (wrong). This is the single-literal off-by-one on the boundary. Coupled scenario: any module scenario that exercises low_confidence_gate with confidence near 0.2.

**AC:**
1. Spec file created with: file modified, line changed, before/after (no actual code in doc), expected scenario RED.
2. Confirms bug is detectable by dashboard RED (not silently passing with wrong output).
3. Documents cycle-counting protocol: each fix attempt that does NOT flip all affected scenarios GREEN = 1 cycle.
4. Documents baseline: `baselineCycleCount=1.5`, target ≤2 cycles.
5. Documents both G10 and G11 injection targets (G10=decimal_normalizer, G11-T1=G10-alias, G11-T2=low_confidence_gate).

**Atomic commit format:**
```
docs(arch/pdf-extractor): P2-J1 — bug-injection spec for G10/G11

G10: decimal_normalizer scale literal. G11-T1: G10 alias + module coupling. G11-T2: low_confidence_gate threshold boundary 0.2→0.3.
Baseline: 1.5 cycles. Target: ≤2 cycles.

Task: P2-J1 | AC: 5/5
```

---

### P2-J2 — QA creates `pdf-extractor-pre-inject` tag, injects bug, dispatches dev

**Owner:** qa
**Goals:** G10
**Files touched:**
- `apps/pdf-extractor/domain/primitives/decimal_normalizer/primitive.py` (TEMP MODIFY — inject single-literal bug)

**Protocol:**
```bash
# 1. Create pre-inject tag BEFORE any modification
git tag pdf-extractor-pre-inject
# 2. Edit decimal_normalizer/primitive.py — change 1 literal (scale constant)
# 3. Commit the injection:
git add apps/pdf-extractor/domain/primitives/decimal_normalizer/primitive.py
git commit -m "test(pdf-extractor): P2-J2-inject — decimal-normalizer scale bug for G10 AI-fix proof"
# 4. Verify sandbox RED:
env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/decimal_normalizer/edge_decimal_shift_vnm.json
# 5. Dispatch dev-pdf-extractor with ONLY the failing scenario description and sandbox command
```

**AC:**
1. `pdf-extractor-pre-inject` tag created BEFORE injection commit.
2. Bug injected in a single atomic commit identifiable in git log.
3. `env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=<edge_decimal_shift_vnm.json>` shows RED.
4. Dashboard decimal_normalizer card shows RED.
5. `dev-pdf-extractor` dispatched with handoff containing ONLY: the failing dashboard scenario description + the sandbox runner command. No code pointer. No hint about the bug location.
6. Dispatch timestamp recorded (cycle counter starts at this commit).

**Atomic commit format:**
```
test(pdf-extractor): P2-J2-inject — decimal-normalizer scale literal bug for G10 AI-fix proof

Deliberate single-literal injection. Dashboard decimal_normalizer card = RED.
pre-inject tag = pdf-extractor-pre-inject (points to HEAD before this commit).
Agent dispatched with scenario-only context. Cycle counting begins.

Task: P2-J2 | AC: 6/6
```

---

### P2-J3 — dev-pdf-extractor fixes bug (≤2 cycles); dashboard GREEN

**Owner:** dev-pdf-extractor
**Goals:** G10, G12
**Files touched:**
- `apps/pdf-extractor/domain/primitives/decimal_normalizer/primitive.py` (MODIFY — fix)

**AC:**
1. Agent receives handoff with ONLY the failing dashboard scenario — no code pointer, no bug location hint.
2. Agent identifies bug from dashboard RED signal + sandbox output + source code inspection.
3. Fix applied in ≤2 commits (each fix attempt = 1 cycle; dashboard GREEN = success, not GREEN = 1 cycle consumed).
4. After fix: `env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive` → ALL primitive scenarios GREEN (including all 3 decimal_normalizer scenarios).
5. G12 DoD gate enforced: agent does NOT mark task DONE until sandbox runs all scenarios and dashboard shows GREEN.
6. Git log evidence: between injection commit (P2-J2) and final green commit = ≤2 commits by dev-pdf-extractor.

**Smoke check:**
```bash
env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive
env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=module
# Both: all scenarios GREEN (exit 0)
```

**Atomic commit format (each fix attempt):**
```
fix(pdf-extractor): P2-J3 — decimal-normalizer scale fix — G10 cycle [N] of ≤2

[What was wrong, what was fixed — single literal change]

Task: P2-J3 | AC: sandbox all-scenarios GREEN / dashboard green confirmed / G12 DoD check run
```

---

### P2-K1 — G11 Trial-1: decimal-normalizer mutation + module coupling proof

**Owner:** qa (injection + scenario design) + dev-pdf-extractor (fix)
**Goals:** G11
**Strategy:** Trial-1 is the G10 alias — the decimal_normalizer fix from P2-J3 IS Trial-1 if a coupled module scenario flipped RED during the fix. QA verifies the coupling retrospectively:

1. QA checks git log from P2-J2-inject to P2-J3-fix: was the `multi_primitive_story.json` module scenario RED at any point during the fix cycle?
2. If YES (module scenario RED, then agent fixed B before marking DONE): Trial-1 = PASS, outcome-(a) documented.
3. If NO (module scenario remained GREEN throughout): QA designs a NEW Trial-1 injection specifically for decimal_normalizer → module coupling. Inject a bug that causes `multi_primitive_story.json` to fail. Dispatch dev-pdf-extractor to fix. Document coupling proof.

**AC:**
1. Trial-1 scenario: decimal_normalizer primitive mutation + fix documented.
2. ≥1 coupled scenario RED observed at some point during the fix cycle (either retroactively from P2-J3, or from a fresh Trial-1 injection).
3. Agent fixed both the primary (decimal_normalizer primitive) and the coupled module scenario in the same task cycle.
4. Trial-1 outcome-(a) recorded: "fix of A caused B to go RED; agent addressed B before declaring DONE."
5. Git log evidence: shows the coupling event (B RED → B GREEN) within the same task.
6. G12 DoD gate: sandbox-green evidence for all scenarios pasted in handoff before dev marks DONE.

**Atomic commit format (if fresh injection needed):**
```
test(pdf-extractor): P2-K1-inject — decimal-normalizer mutation for G11 Trial-1 coupling proof
fix(pdf-extractor): P2-K1-fix — decimal-normalizer + module coupling fix, G11 Trial-1 PASS
```

---

### P2-K2 — G11 Trial-2: different primitive (low_confidence_gate) + coupling proof

**Owner:** qa (injection) + dev-pdf-extractor (fix)
**Goals:** G11
**Files touched:**
- `apps/pdf-extractor/domain/primitives/low_confidence_gate/primitive.py` (TEMP MODIFY — threshold 0.2→0.3)

**Protocol:**
1. QA creates a Trial-2 scenario designed so that fixing the low_confidence_gate primitive mutation ALSO causes a coupled module scenario to flip RED.
2. Coupled scenario: a `financial_reports` module scenario that exercises low_confidence_gate with `confidence=0.20` (which should be `normal` but with the 0.3 threshold will be `low_confidence`). The fix reverts 0.3→0.2, which restores the module scenario to GREEN.
3. Dispatch dev-pdf-extractor with ONLY: the failing primitive scenario. Agent fixes, runs sandbox, sees module scenario RED, fixes that too, then marks DONE.

**AC:**
1. `low_confidence_gate` primitive bug injected: `0.2→0.3` threshold literal.
2. Primitive scenario `boundary_0_20.json` (confidence=0.20) flips RED.
3. Dev-pdf-extractor fixes primitive → module scenario flips RED (coupling observed).
4. Agent fixes module coupling in same task cycle before declaring DONE.
5. G12 DoD: sandbox all scenarios GREEN before RETURN.
6. Trial-2 outcome-(a) documented: coupling proof × 2 trials = G11 PASS.

**Atomic commit format:**
```
test(pdf-extractor): P2-K2-inject — low_confidence_gate threshold 0.2→0.3 for G11 Trial-2
fix(pdf-extractor): P2-K2-fix — restore low_confidence_gate threshold; G11 Trial-2 coupling PASS

Outcome-(a): fix of low_confidence_gate caused module scenario RED; agent fixed before DONE.
G11 2-trial coupling proof complete: Trial-1 (decimal-normalizer) + Trial-2 (low_confidence_gate).

Task: P2-K2 | AC: 6/6
```

---

### P2-G5a — Pre-delete tag + move superseded code to `_deprecated/`

**Owner:** dev-pdf-extractor
**Goals:** G5a
**Context (brownfield §R-1):** After Phase-1 primitive extraction, `domain/services.py` still contains `validate_financial_figures()` as a call-site stub (or was updated to import from `domain.primitives.validate_financial_figures`). If the original function body remains in `domain/services.py` alongside the import, the old body is the G5a deletion target.

**Files to verify / move:**
- `apps/pdf-extractor/domain/services.py` — verify whether it still contains the original function body for any extracted primitive. If so, move the old body remnants to `apps/pdf-extractor/domain/_deprecated/services_pre_extract.py`.

**Protocol:**
```bash
# 1. Create pre-delete tag BEFORE any move
git tag pdf-extractor-pre-delete
# 2. Identify any superseded code (old function bodies now replaced by primitive imports)
# 3. Move to _deprecated/:
git mv apps/pdf-extractor/domain/services.py apps/pdf-extractor/domain/_deprecated/services_pre_extract.py
# OR (if services.py still serves a purpose): extract only the old bodies into _deprecated/
# 4. Add header: # DEPRECATED: G5a Phase 2. Original body superseded by domain/primitives/. Phase-2 G5a.
# 5. Verify all existing callers still import from domain.primitives (not from the old path)
```

**AC:**
1. `pdf-extractor-pre-delete` tag created BEFORE any file moves.
2. `apps/pdf-extractor/domain/_deprecated/` directory created.
3. Any superseded function bodies (from Phase-1 extracted primitives) are moved to `_deprecated/` with DEPRECATED header comment.
4. All existing imports from `domain.services` that called the old body now route through `domain.primitives.*` (no broken imports).
5. `python -m pytest apps/pdf-extractor/__tests__/unit/ -q` still passes.
6. `find apps/pdf-extractor/domain -name "*.py" -not -path "*/_deprecated/*" | xargs grep -l "validate_financial_figures\|normalize_decimal" | xargs grep "def validate_financial_figures\|def normalize_decimal"` returns 0 results (original function bodies gone from active domain paths).

**Atomic commit format:**
```
refactor(pdf-extractor): P2-G5a — move superseded domain code to _deprecated/ (G5a)

Pre-delete tag: pdf-extractor-pre-delete.
Primitive bodies now in domain/primitives/; old domain/services.py stubs moved.
All imports routed through primitives. Tests pass.

Task: P2-G5a | AC: 6/6
```

---

### P2-G5c — Zero `TODO.*migrat` grep

**Owner:** qa
**Goals:** G5c
**Files touched:** none (verification only — if any TODOs found, dev-pdf-extractor removes them first)

**AC:**
1. `grep -rn "TODO.*migrat" apps/mcp-server/src/ apps/pdf-extractor/ --include="*.ts" --include="*.py"` returns 0 results.
2. If any results found: QA creates a micro-task for dev-pdf-extractor to remove the comments (comment-only removal, no logic change), then re-verifies.
3. Evidence: grep output (0 lines) pasted in handoff.

**Smoke check:**
```bash
grep -rn "TODO.*migrat" apps/mcp-server/src/ apps/pdf-extractor/ --include="*.ts" --include="*.py" | wc -l
# Must print 0
```

**Atomic commit format (only if TODOs found and removed):**
```
chore(pdf-extractor): P2-G5c — remove TODO:migrate comments (G5c cleanup)

grep TODO.*migrat = 0 results across mcp-server + pdf-extractor.

Task: P2-G5c | AC: 3/3
```

---

## G5b-Clearance Sub-Task (Architect-Owned)

**ID:** P2-G5b-clearance
**Owner:** architect
**Trigger:** P2-G5c DONE + 1954c consolidation work has landed (or architect judges it has progressed enough to assess)
**Not a dev task.** PM does not dispatch this. Architect self-initiates.

### What the clearance sub-task must answer

The G5b rewire targets:
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts` (contains `fetch_ssc_reports`)
- `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` (the 1954c hot file)
- `apps/mcp-server/src/infrastructure/jobs/bctcBatchSweepJob.ts` (contains `bctc_batch_sweep`)

The architect must assess:

1. **Is 1954c consolidation landed?** The 1953-G-FAIL / 1954c freeze anchor protects a behavioral RCA — OCR-completion-but-store-strands (78h stale), missing ACK token, 4 write paths → 1 pull-job owner. Has the consolidation commit landed and been verified? Check `docs/data/bug-inventory.json` entry `1954-BCTC-write-chain-rca` (fixCycles=0, status=unresolved at last check).

2. **Is the G5b rewire still necessary, or moot?** If 1954c consolidation already routed `fetchParseAndStoreBctc.ts` calls through the pdf-extractor microservice HTTP client, the G5b HTTP-rewire is already complete by side-effect. In that case, architect rules G5b moot and G5 = YES (G5a + G5c done + G5b moot).

3. **If not moot — is it now safe?** The rewire touches `fetchParseAndStoreBctc.ts`. Once the 1954c consolidation is stable (no open fixCycles, no behavioral RCA in progress), the structural HTTP-rewire is no longer colliding with the frozen surface. Architect can emit a clearance signal.

### Clearance criteria (must ALL be true for clearance)

| Criterion | Source of truth |
|---|---|
| C-1: `1954-BCTC-write-chain-rca` status = `resolved` in bug-inventory.json | `docs/data/bug-inventory.json` |
| C-2: `1953-G-FAIL-BCTC-stale` status = `resolved` (78h stale bug fixed) | `docs/data/bug-inventory.json` |
| C-3: No open fixCycles on mcp-server BCTC path in last 30 days | git log + bug-inventory |
| C-4: Architect confirms `fetchParseAndStoreBctc.ts` is stable (no active RCA) | brownfield re-scan of mcp-server BCTC paths |

### Clearance output (AC for P2-G5b-clearance)

1. Architect emits `docs/signals/architect-pdf-extractor-g5b-clearance-<UTC>.json` with `clearance: "APPROVED"` (or `"MOOT"` if consolidation already routed the handler). Schema:
```json
{
  "from": "architect",
  "to": "po",
  "type": "g5b-clearance",
  "pilot": "pdf-extractor",
  "clearance": "APPROVED | MOOT | BLOCKED",
  "reason": "...",
  "criteria": {"C1": "PASS|FAIL", "C2": "PASS|FAIL", "C3": "PASS|FAIL", "C4": "PASS|FAIL"},
  "recommendation": "...",
  "createdAt": "<ISO UTC>"
}
```
2. If `clearance=BLOCKED`: architect explains what is still unresolved; G5b remains frozen; PO is notified.
3. If `clearance=APPROVED` or `MOOT`: PO reviews and emits freeze-lift signal in `pilot-status-pdf-extractor.json phase2.bctc_freeze_gate.lift_status = LIFTED` (PO-owned step — NOT architect).

**12/12 gate dependency:** G5 (and thus 12/12) cannot be reached until:
- G5b-clearance emits `APPROVED` or `MOOT`, AND
- PO emits freeze-lift signal, AND
- (if APPROVED) P2-G5b-dispatch rewire is completed and verified.

If clearance = MOOT, G5 can be closed without a rewire commit.

---

### P2-G5b-dispatch — G5b HTTP-rewire (HARD FROZEN)

**Owner:** dev-pdf-extractor
**Goals:** G5b (and thus G5 final YES)
**Status:** HARD FROZEN. PM MUST NOT dispatch, stage, or commit until BOTH signals received:
1. `architect-pdf-extractor-g5b-clearance-*.json` with `clearance: "APPROVED"`
2. PO explicit freeze-lift recorded in `pilot-status-pdf-extractor.json phase2.bctc_freeze_gate.lift_status = LIFTED`

**Files to modify (once unfrozen):**
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts` — rewire `fetch_ssc_reports` from direct domain call to HTTP call to pdf-extractor port 5001
- `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` — rewire BCTC parse+store flow to call pdf-extractor HTTP endpoint
- `apps/mcp-server/src/infrastructure/jobs/bctcBatchSweepJob.ts` — rewire `bctc_batch_sweep` to call pdf-extractor port 5001

**AC (once dispatched):**
1. `grep -r "from.*domain.*services.*extract\|from.*domain.*pdf" apps/mcp-server/src/interface/mcp/tools/financial-reports/` returns 0 matches (no direct domain imports).
2. All three handlers route via existing `pdfExtractorClient.ts` HTTP client (port 5001 already declared in `clients.ts`).
3. `cd apps/mcp-server && bun test` passes.
4. Integration test: BCTC MCP tool end-to-end via pdf-extractor service returns expected response shape.
5. `find apps/mcp-server/src -path "*pdf*" -name "*.ts" | xargs grep "from.*domain.*pdf"` returns 0 matches (G5 charter verification).
6. `grep -r "TODO.*migrat" apps/mcp-server/src/ apps/pdf-extractor/` returns 0 results.
7. `git diff --cached --name-only` before commit shows ONLY the 3 targeted mcp-server files (no drift into other services).
8. Architect 1954c-clearance signal path recorded in commit message.

**Atomic commit format:**
```
feat(pdf-extractor/mcp-server): P2-G5b — HTTP-rewire fetch_ssc_reports + bctc_batch_sweep → port 5001

BCTC freeze lifted: [clearance signal path]. 1954c consolidation landed [commit SHA].
Reports.ts + fetchParseAndStoreBctc.ts + bctcBatchSweepJob.ts → HTTP via pdfExtractorClient.
bun test passes. G5 = G5a + G5c + G5b DONE.

Task: P2-G5b-dispatch | AC: 8/8
```

---

## Python Smoke-Check Standard (all Python tasks)

All tasks touching Python source must pass before commit:

```bash
# Run from apps/pdf-extractor/ (with PYTHONPATH=apps/pdf-extractor)
env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive
env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=module
# Both: all scenarios GREEN (exit 0)

python -m pytest apps/pdf-extractor/__tests__/unit/ -q
# All unit tests GREEN

# After P2-A1 lands:
cd apps/pdf-extractor && pip install import-linter && lint-imports
# Exit 0 (zero fence violations)
```

**G7 canonical env-audit form (EVERY dev task, as G12 DoD evidence):**
```bash
env -i PYTHONPATH=apps/pdf-extractor python3 apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=<any-primitive-scenario>
# In runner's process context: forbidden-grep EMPTY
# CTX_ADVISOR_* excluded (Claude Code harness, not credentials)
```

---

## Goal Mapping

| Goal | Phase-2 task(s) | Terminal condition |
|---|---|---|
| G1-full | P2-B1 → P2-B4 | 6 primitives × ≥3 scenarios each = ≥18 total scenario JSONs; all GREEN |
| G2 re-verify | P2-C | Module composes all 6 primitives via ports; cross-module grep = 0 |
| G3-full | P2-D | main.py ≤80 LOC enforced; OpenAPI served; primitive op-names absent from main.py |
| G4 | P2-A1 → P2-A4 | import-linter Fence-A/B in pyproject.toml + CI job + deliberate-violation CI red/green proof |
| G5a | P2-G5a | Superseded in-service code in `_deprecated/`; pre-delete tag; tests pass |
| G5c | P2-G5c | Zero `TODO.*migrat` grep across mcp-server + pdf-extractor |
| G5b | P2-G5b-clearance → P2-G5b-dispatch | HARD FROZEN; see §G5b-Clearance Sub-Task |
| G5 (YES) | All 3 sub-goals | G5 = YES only when G5a + G5c done AND (G5b completed OR ruled MOOT) |
| G6 re-verify | P2-E1 (via dashboard update in P2-C/D) | Dashboard renders all 6 primitive cards GREEN + module + service; file:// compatible |
| G7 re-verify | P2-E1 | Canonical env-audit: `env -i PYTHONPATH=.` form → forbidden-grep EMPTY |
| G8-final | P2-E2 + P2-F | 5 permanent known-bad fixtures + 1 broken primitive = 6 honest red cards; honesty_table in signal |
| G9 | P2-G | Playwright headless Path B PASS; verdict JSON committed; 3 panels / 6 cards / 0 console errors |
| G10 | P2-J0 → P2-J3 | decimal-normalizer bug fixed in ≤2 cycles; all scenarios GREEN; baseline 1.5 |
| G11 | P2-K1 → P2-K2 | 2-trial coupling proof: Trial-1 decimal-normalizer + Trial-2 low_confidence_gate; outcome-(a)×2 = PASS |
| G12 continuation | P2-J3, P2-K1 (dev), P2-K2 (dev) | Streak #4/#5/#6: sandbox-green evidence in handoff before RETURN |
| 12/12 matrix close | PO-only atomic step | AFTER all G-goals reach terminal YES (including G5b). PO-only. Not dev/qa/architect. |

---

## §4.5 Compliance

This plan contains ZERO goal-flip instructions. No task may update `goals[X].status` to `YES`. No task may populate `decisionMatrix`. `goalsEarned` remains 0 throughout Phase 2. PO performs the 12/12 atomic close after all G-goals reach terminal state. This constraint is inviolable per pilot-charter.md §4.5.

---

## Risks and Mitigations

| Risk | Status | Mitigation |
|---|---|---|
| **R-1: Dashboard HTML needs 4 new primitive card slots** | IDENTIFIED | Developer must update dashboard/index.html to render 6 cards before P2-E1 dispatches. PM sequences: P2-D or P2-F includes dashboard card expansion. Architect recommendation: include in P2-C scope. |
| **R-2: field_extractor regex patterns need mcp-server archaeology** | KNOWN | P2-B4 is READ-ONLY. If archaeology is blocked (mcp-server BCTC files frozen), dev uses VNM/DHG OCR fixture patterns already documented in brownfield §2. No mcp-server write in any scenario. |
| **R-3: import-linter root_package discovery** | LOW | `lint-imports` discovers root from pyproject.toml `root_package` directive. If discovery fails, add `--config pyproject.toml` explicitly. Developer evaluates at P2-A1. |
| **R-4: G11 Trial-1 may not produce natural coupling** | MITIGATED | Architect specified decimal_normalizer → `multi_primitive_story.json` module scenario as the coupling path. If the natural coupling is not observed at P2-J3, QA designs a fresh Trial-1 injection (P2-K1 fresh-injection path). |
| **R-5: G5b clearance timeline unknown** | ACKNOWLEDGED | 12/12 cannot be reached until G5b resolves. Clearance depends on 1954c consolidation completion — outside Phase-2 control. This is the explicit blocker. Phase 2 proceeds with G5b sequenced LAST. All other 22 tasks are independent of G5b. |
| **R-6: Playwright chromium availability** | LOW | Playwright 1.60.0 + cached chromium confirmed available system-wide (kinh-dich / rag-service precedent). If not available in apps/pdf-extractor/, run `npx playwright install chromium`. |
| **R-7: main.py still >80 LOC** | LOW | Current raw count is 88 lines. Architect recommendation: P2-D verifies logical non-blank non-comment line count. If still >80, extract ≤8 additional lines to `infrastructure/startup.py` (already exists from P1-A3). |
| **R-8: Fence-B cross-module independence** | ACCEPTED | Only one module (`financial_reports`) in this pilot. Cross-module import risk is zero. Forbidden contract on `infrastructure` + `interface` covers the essential DDD violation surface. Independence contract not needed at this scope. |

---

## What PM Owes After Architect Hands Off

1. Per-task handoff files `docs/handoffs/TASK_P2-B1.md` through `docs/handoffs/TASK_P2-G5c.md` (22 files, copy AC + files-touched + smoke-check + commit format from Per-Task Spec above).
2. G5b-clearance and G5b-dispatch handoffs held in reserve (not created until clearance signal received).
3. Update `docs/TASKS.md` Phase-2 section with all Phase 2 tasks in priority order.
4. Set `pilot-status-pdf-extractor.json phase2.taskPlanStatus = "READY-FOR-DISPATCH"` and `phase2.status = "OPEN"`.
5. Set `pilot-status-pdf-extractor.json phase2.tasks` with task ID + status = PENDING for each of 22 dispatchable tasks.
6. Notify main terminal that Phase 2 is READY-FOR-DISPATCH with first task: **P2-B1** (dev-pdf-extractor).

---

## Sequencing Diagram

```
Day 1 — primitives (G1-full)
  P2-B1 → P2-B2 → P2-B3 → P2-B4   [sequential; WIP=1; dev-pdf-extractor]

Day 2 — module + composition root (G2/G3)
  P2-C (after P2-B4) → P2-D (after P2-C)

Day 2-3 — dashboard + honesty (G6/G7/G8)
  P2-E1 (qa, after P2-D)
  → P2-E2 (qa, after P2-E1)
  → P2-F (dev, after P2-E2)

Day 3-4 — import-linter fence (G4)
  P2-A1 (dev, after P2-F) → P2-A2 → P2-A3 (qa) → P2-A4 (qa)

Day 4-5 — Playwright + bug-fix setup (G9/G10)
  P2-G (qa, after P2-A4; dashboard + fence stable)
  P2-J0 (qa, parallel with P2-G)
  → P2-J1 (qa) → P2-J2 (qa — inject) → P2-J3 (dev — fix, ≤2 cycles) ← G12 streak #4

Day 5-6 — regression alarm (G11)
  P2-K1 (qa+dev) ← G12 streak #5
  → P2-K2 (qa+dev) ← G12 streak #6

Day 6-7 — G5a/G5c (BCTC-CLEAR)
  P2-G5a (dev, after P2-K2) → P2-G5c (qa)

Day 7+ — G5b clearance (BCTC-FROZEN)
  P2-G5b-clearance (architect — self-initiated after 1954c consolidation lands)
  → [PO freeze-lift signal]
  → P2-G5b-dispatch (dev)
  → PO 12/12 matrix close (PO-only atomic)
```

**Critical path:** P2-B4 → P2-C → P2-D → P2-F → P2-A4 → P2-J3 → P2-K2 → P2-G5a → P2-G5c → [P2-G5b-clearance] → [12/12]

**12/12 explicit blocker:** The 12/12 matrix close CANNOT proceed until G5b is resolved (cleared, lifted, and dispatched — or ruled MOOT by architect). All 22 other tasks are independent of G5b and can proceed normally. G5b is the single gating dependency for the terminal close.

---

## Architect Sign-Off

**Architect:** report-analyzer @ 2026-05-24
**Fence linter:** import-linter (locked SI-4, not golangci-lint/depguard which is Go-only, not eslint which is TS-only)
**Bug-inventory baseline confirmed:** `pdf_extractor_baseline.baselineCycleCount=1.5` (system-wide fallback; Phase-0 deliverable @31483c8c)
**G10 injection target:** `decimal_normalizer` (decimal-shift single-literal scale constant)
**G11 Trial-1:** decimal_normalizer G10 alias + multi_primitive_story module coupling
**G11 Trial-2:** `low_confidence_gate` threshold boundary 0.2→0.3 + module coupling
**G5b freeze:** HARD FROZEN per PO ruling (c) SPLIT — sequenced LAST. 12/12 blocked until G5b resolves.
**Next actor:** pm (create handoff files + update pilot-status + dispatch P2-B1)
**First dev task to dispatch:** P2-B1 (dev-pdf-extractor — confidence_scorer primitive)
