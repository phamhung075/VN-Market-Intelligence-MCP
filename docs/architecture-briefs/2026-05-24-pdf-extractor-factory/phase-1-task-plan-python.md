---
title: "Phase 1 Task Plan (Python) — pdf-extractor Pilot"
date: "2026-05-24"
author: "architect (pdf-extractor phase-0)"
pilot: "pdf-extractor"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-24"
sprint_deadline: "2026-07-05"
charter_ref: "docs/architecture-briefs/2026-05-24-pdf-extractor-factory/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-24-pdf-extractor-factory/p0-brownfield-inventory.md"
language: "Python"
deliverable: "PHASE0-D3"
parent_pattern: "docs/architecture-briefs/2026-05-23-macro-indicators-factory/phase-1-task-plan-go.md (macro pilot — structural template)"
bctc_freeze_status: "ACTIVE (1953-G-FAIL / 1954c). All Phase-1 tasks confirmed CLEAR. Phase-2 G5b FROZEN until 1954c lift."
---

# Phase 1 Task Plan (Python) — pdf-extractor Pilot

**Generated:** 2026-05-24 by architect (Phase 0)
**Pattern:** cloned from macro Phase-1 task plan structure, adjusted for Python domain
**Language:** Python (locked Day 0 — OCR/PDF ecosystem constraint, irreversible)
**Status:** READY-FOR-DISPATCH to dev-pdf-extractor

---

## Summary

Phase 1 delivers the Python sandbox scenario runner (G1/G7 prerequisite — the HEADLINE RISK task) plus the first primitive `validate-financial-figures` end-to-end, following the 5-bucket structure proven on TA and macro pilots. The 6 selected primitives are extracted sequentially (one per Phase-1/Phase-2 task) to keep WIP=1.

Phase 1 scope:
- **P1-A:** Scaffold — FastAPI composition root shrink + Python sandbox runner + scenario directory layout
- **P1-B1:** First primitive — `validate-financial-figures` (cheapest: pure move from `domain/services.py`)
- **P1-B2:** Second primitive — `decimal-normalizer` (fixes the decimal-shift bug class; requires mcp-server archaeology for fixture values but NO mcp-server write)
- **P1-C:** Module stub — `financial-reports` composing first-2 primitives via Protocol ports
- **P1-D:** Module scenario JSON (≥1 multi-primitive story)
- **P1-E:** Dashboard stub (3 panels) + edit-rerun handler + env audit (G7 all-sub-gates proof)

Remaining 4 primitives (`confidence-scorer`, `low-confidence-gate`, `ratio-computer`, `field-extractor`) + G4 fence CI + G5 deletion chain + G3 main.py shrink → Phase 2.

**BCTC freeze:** All Phase-1 tasks are CLEAR (confirmed in `p0-brownfield-inventory.md` §8). No freeze-clearance required from PO before dispatching any Phase-1 task.

---

## Charter Context

- **Deadline:** 2026-07-05 (kickoff + 6 sprints, hard)
- **Goals advanced in Phase 1:** G1 (primitives), G2 (module stub), G6 (dashboard stub), G7 (edit-rerun + zero-cred), G8 (honest NOT-RUN), G12 (streak-1/streak-2/streak-3)
- **Goals deferred to Phase 2:** G3 (main.py shrink), G4 (import-linter CI), G5 (G5b rewire), G9 (Playwright), G10 (blind bug fix), G11 (regression alarm)
- **WIP cap:** 1 task In Progress at a time (single dev-pdf-extractor agent)
- **Anti-scope-creep:** pilot covers `apps/pdf-extractor/` only. No mcp-server write during Phase 1.
- **Security:** zero DB credentials + zero VPS/OCR/Tesseract creds in sandbox process env
- **L84:** `git add <explicit-path>` per file always. No `-A` no `.`

---

## Pre-Revert Tags (Phase 1 scope)

Phase 1 creates the Python scaffold — no deletion or CI activation occurs in Phase 1. Tags for G4, G5, G10 are Phase 2:

| Tag | Phase | Who creates |
|---|---|---|
| `pdf-extractor-pre-ci` | Phase 2 — before import-linter CI job | dev-pdf-extractor |
| `pdf-extractor-pre-delete` | Phase 2 — before G5 _deprecated/ move | dev-pdf-extractor |
| `pdf-extractor-pre-inject` | Phase 2 — before G10 bug injection | qa |

PM must reference these tags in all Phase 2 handoff specs.

---

## Task Ledger

| ID | Title | Owner | Goals | Blocks | Blocked by | Est | AC count |
|----|-------|-------|-------|--------|------------|-----|----------|
| **P1-A1** | Sandbox runner: `apps/pdf-extractor/sandbox/runner.py` (JSON-in → trace-JSON-out, zero credentials, zero pdfplumber/pytesseract) | dev-pdf-extractor | G7, G12 | P1-A2 | — | 1h | 7 |
| **P1-A2** | Scenario directory layout: `apps/pdf-extractor/scenarios/{primitives,modules,service}/` + README | dev-pdf-extractor | G1, G7 | P1-A3 | P1-A1 | 20m | 3 |
| **P1-A3** | Composition root shrink: refactor `main.py` to ≤80 logical lines (extract `os.makedirs` to `infrastructure/startup.py`, extract lifespan to `infrastructure/lifespan.py`) | dev-pdf-extractor | G3 | P1-B1 | P1-A2 | 30m | 4 |
| **P1-B1** | First primitive: `domain/primitives/validate_financial_figures/` — move `validate_financial_figures()` from `domain/services.py`, add `__init__.py` export, update `ExtractPDFService` call-site import | dev-pdf-extractor | G1, G12 | P1-B2 | P1-A3 | 45m | 8 |
| **P1-B2** | Second primitive: `domain/primitives/decimal_normalizer/` — extract normalization logic (archaeology of mcp-server BCTC parsers for fixture values, NO mcp-server write; new code lives only in `apps/pdf-extractor/`) | dev-pdf-extractor | G1, G12 | P1-C | P1-B1 | 1.5h | 7 |
| **P1-C** | Module stub: `domain/modules/financial_reports/` — Python Protocol ports + barrel `__init__.py` + `FinancialReportsModule` composing P1-B1 + P1-B2 primitives via DI; mock ports in tests | dev-pdf-extractor | G2, G12 | P1-D, P1-E1 | P1-B2 | 1h | 7 |
| **P1-D** | Module scenario JSON: `scenarios/modules/financial_reports/` — ≥1 multi-primitive story (OCR text fixture → decimal-normalize → validate-figures → expected confidence) | dev-pdf-extractor | G2, G7, G12 | P1-E1 | P1-C | 30m | 4 |
| **P1-E1** | Dashboard stub HTML: `apps/pdf-extractor/dashboard/index.html` — 3 panels (primitives: 2 cards, module: financial-reports, service) in NOT-RUN state; file:// compatible; SI-2 boundary HTML comment; no console errors | dev-pdf-extractor | G6, G8, G9, G12 | P1-E2 | P1-C, P1-D | 2h | 7 |
| **P1-E2** | Edit-rerun handler + G7 all-sub-gates (env audit + scenario JSON grep + sandbox exit 0 on happy path + exit non-zero on failure scenario + edit→rerun cycle proven) | dev-pdf-extractor | G7, G8, G12 | P1-G | P1-E1 | 1.5h | 8 |
| **P1-G** | QA close-gate: 5-criterion Phase 1 exit gate (sandbox runner PASS, zero-cred audit PASS, primitive isolation confirmed, dashboard honest NOT-RUN, G12 streak-3 confirmed) | qa | closes Phase 1 | — | P1-E2 | 30m | 5 |

**Total atomic tasks:** 10 (3 A-bucket + 2 B-bucket + 1 C-bucket + 1 D-bucket + 2 E-bucket + 1 G close-gate)
**Total estimated effort:** ~9.3 hours (single agent, WIP=1)
**G12 streak tasks:** P1-B1 (streak #1), P1-C (streak #2), P1-E1 (streak #3) — each must show sandbox-green evidence before RETURN

---

## Detailed AC Per Task

### P1-A1 — Sandbox Runner (HEADLINE RISK — gates G1, G7)

**File:** `apps/pdf-extractor/sandbox/runner.py`

**Acceptance Criteria:**
1. `python apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=<path>` runs without error when given a valid scenario JSON.
2. Output is a valid JSON trace to stdout: `{primitive, inputs, expected, actual, pass, error}`.
3. Exit code 0 = all scenarios PASS; exit code non-zero = at least 1 FAIL.
4. Runner imports ONLY from `domain/primitives/`. Zero imports from `infrastructure/`, `application/`, `interface/`, pdfplumber, pytesseract, aiohttp.
5. **ZERO-CREDS gate (BLOCKER before P1-B1):** `env | grep -iE "DB_PATH|VPS_|VINAHOST|STORAGE_DIR|OCR|TESSERACT|TOKEN|SECRET|API_KEY|PASSWORD"` run inside the sandbox process environment returns EMPTY.
6. Scenario JSON grep (BLOCKER): `grep -rniE "db_path|vps|vinahost|storage_dir|token|secret|api_key|password" apps/pdf-extractor/sandbox/` returns 0 matches.
7. `python apps/pdf-extractor/sandbox/runner.py --help` prints usage without error.

**Do NOT dispatch P1-B1 until AC-5 and AC-6 are confirmed PASS.**

---

### P1-A2 — Scenario Directory Layout

**Files:** `apps/pdf-extractor/scenarios/primitives/`, `scenarios/modules/`, `scenarios/service/`, `scenarios/README.md`

**Acceptance Criteria:**
1. Three directories exist: `scenarios/primitives/validate_financial_figures/`, `scenarios/primitives/decimal_normalizer/`, `scenarios/modules/financial_reports/`.
2. Each primitive directory contains a `README.md` describing scenario JSON schema for that primitive.
3. Directories are committed (git tracks empty directories via `.gitkeep` if needed).

---

### P1-A3 — Composition Root Shrink

**Target:** `apps/pdf-extractor/main.py` ≤80 logical lines (currently 101 — 21-line reduction needed).

**Acceptance Criteria:**
1. `main.py` is ≤80 non-blank non-comment lines after refactor.
2. `os.makedirs` calls extracted to `infrastructure/startup.py:ensure_dirs(cfg)` — called from `create_app()`.
3. `@asynccontextmanager lifespan` extracted to `infrastructure/lifespan.py:build_lifespan(cfg)` — imported into `main.py`.
4. `create_app()` + `app = create_app()` + `if __name__ == "__main__"` block remain in `main.py`. No domain logic added.

**Note:** This is a mechanical refactor. It does NOT need to satisfy G3 fully (G3 also requires OpenAPI confirmation + grep for domain ops — that is Phase-2 scope). Phase-1 AC-1 just proves ≤80 lines.

---

### P1-B1 — First Primitive: `validate-financial-figures` (G12 streak #1)

**Files:**
- `domain/primitives/validate_financial_figures/__init__.py` — exports `validate_financial_figures`
- `domain/primitives/validate_financial_figures/primitive.py` — moved from `domain/services.py:23-98`
- `scenarios/primitives/validate_financial_figures/happy.json` — all figures valid → confidence 1.0
- `scenarios/primitives/validate_financial_figures/edge_vnm_val01.json` — VNM scenario: assets=957, equity=18829 → 0.0 (VAL-01 hard violation)
- `scenarios/primitives/validate_financial_figures/failure_negative_assets.json` — assets=-100 → 0.0 (VAL-02)
- `domain/services.py` — call-site updated: `from domain.primitives.validate_financial_figures import validate_financial_figures`

**Acceptance Criteria:**
1. `python sandbox/runner.py --tier=primitive --scenario=scenarios/primitives/validate_financial_figures/happy.json` exits 0.
2. `python sandbox/runner.py --tier=primitive --scenario=scenarios/primitives/validate_financial_figures/failure_negative_assets.json` exits non-zero (honest RED).
3. `from infrastructure import anything` inside `domain/primitives/validate_financial_figures/primitive.py` → would fail import-linter when fence lands (architect verifies by reading imports — zero infra/application/interface imports confirmed).
4. `domain/services.py` still passes all existing unit tests in `__tests__/unit/test_extract_pdf_service.py` and `__tests__/unit/test_financial_validation.py` (call-site update must not break callers).
5. `dashboard` shows primitive card as GREEN after `runner.py --tier=primitive` pass (if dashboard stub exists from P1-E1; else this AC is waived for P1-B1 and applied at P1-E2).
6. G12 DoD gate: dev-pdf-extractor must paste sandbox-green evidence into handoff before RETURN.
7. `git add` is explicit-file only: `git add apps/pdf-extractor/domain/primitives/validate_financial_figures/__init__.py apps/pdf-extractor/domain/primitives/validate_financial_figures/primitive.py apps/pdf-extractor/domain/services.py apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json ...`
8. Scenario JSON count: ≥3 (happy + VAL-01 VNM edge + VAL-02 failure).

---

### P1-B2 — Second Primitive: `decimal-normalizer` (G12 streak #2 contributes via streak counting; see P1-C for official streak-2)

**CAUTION (BCTC freeze):** This task requires archaeology of `apps/mcp-server/src/application/usecases/fetchParseAndStoreBctc.ts` regex patterns to understand the decimal-shift bug class (VNM net_profit=0.000051, DHG rev=0.000009). dev-pdf-extractor reads mcp-server source. **dev-pdf-extractor writes NOTHING to mcp-server** — the new primitive code lives only in `apps/pdf-extractor/domain/primitives/decimal_normalizer/`. If any mcp-server file appears in `git diff --cached`, the task is BLOCKED and dev-pdf-extractor must unstage before commit.

**Files:**
- `domain/primitives/decimal_normalizer/__init__.py`
- `domain/primitives/decimal_normalizer/primitive.py` — `normalize_decimal(raw_string: str, unit_hint: str = "billion_vnd") -> float | None`
- `scenarios/primitives/decimal_normalizer/happy_normal.json` — "1234.5" → 1234.5
- `scenarios/primitives/decimal_normalizer/edge_decimal_shift_vnm.json` — "0.000051" + unit_hint=raw_micro → 51.0 (VNM net_profit case)
- `scenarios/primitives/decimal_normalizer/failure_non_numeric.json` — "N/A" → None (no crash)

**Acceptance Criteria:**
1. `python sandbox/runner.py --tier=primitive --scenario=scenarios/primitives/decimal_normalizer/happy_normal.json` exits 0.
2. `python sandbox/runner.py --tier=primitive --scenario=scenarios/primitives/decimal_normalizer/edge_decimal_shift_vnm.json` exits 0, actual matches expected (VNM decimal-shift corrected).
3. `python sandbox/runner.py --tier=primitive --scenario=scenarios/primitives/decimal_normalizer/failure_non_numeric.json` exits 0 (failure scenario: expected=null, actual=null, pass=true).
4. Zero imports from infrastructure, application, interface, pdfplumber, pytesseract, aiohttp in `decimal_normalizer/primitive.py`.
5. `git diff --cached --name-only` contains ZERO files from `apps/mcp-server/` (FREEZE ENFORCEMENT).
6. ≥3 scenario JSON files for this primitive.
7. G12 DoD gate: sandbox-green evidence pasted into handoff before RETURN.

---

### P1-C — Module Stub: `financial-reports` (G12 streak #2 OFFICIAL)

**Files:**
- `domain/modules/financial_reports/__init__.py`
- `domain/modules/financial_reports/ports.py` — Python Protocol types: `DecimalNormalizerPort`, `FinancialValidatorPort`
- `domain/modules/financial_reports/module.py` — `FinancialReportsModule` class composing primitives via ports
- `domain/modules/financial_reports/mock_ports.py` — test mock implementations for use in unit tests

**Acceptance Criteria:**
1. `from domain.modules.financial_reports import FinancialReportsModule` imports cleanly.
2. `grep -r "from infrastructure" domain/modules/` returns 0 matches (Fence-B: module imports no infrastructure).
3. `grep -r "from domain.modules.financial_reports" domain/modules/financial_reports/` returns 0 matches (no self-import cross-module).
4. Module imports primitives from `domain.primitives.validate_financial_figures` and `domain.primitives.decimal_normalizer` — both via Protocol ports, not direct function calls.
5. Module unit test (in `__tests__/unit/test_financial_reports_module.py`) runs with AsyncMock/mock ports only — zero real infrastructure.
6. G12 DoD gate: sandbox-green evidence for primitive tier (re-run all primitive scenarios, all must PASS) pasted into handoff before RETURN.
7. G12 streak-2 confirmation: this is the second consecutive task with sandbox-green evidence.

---

### P1-D — Module Scenario JSON

**Files:**
- `scenarios/modules/financial_reports/multi_primitive_story.json` — OCR text fixture → decimal-normalize → validate-figures → expected composite confidence

**Acceptance Criteria:**
1. `python sandbox/runner.py --tier=module --scenario=scenarios/modules/financial_reports/multi_primitive_story.json` exits 0.
2. Scenario exercises ≥2 primitives in sequence (decimal-normalizer then validate-financial-figures).
3. Scenario JSON contains ZERO real VPS URLs, ZERO real DB paths, ZERO credential strings.
4. ≥1 module-tier scenario file exists.

---

### P1-E1 — Dashboard Stub HTML (G12 streak #3)

**File:** `apps/pdf-extractor/dashboard/index.html`

**Acceptance Criteria:**
1. Opens via `file://` URL in browser without network calls.
2. Three panels visible: Primitives (2 cards: validate-financial-figures, decimal-normalizer), Module (financial-reports), Microservice (pdf-extractor).
3. All cards show honest `NOT-RUN` status before sandbox is run (no false greens).
4. Zero JavaScript console errors on load.
5. Dashboard reads trace JSON from `scenarios/` directory on rerun (or from `sandbox/traces/` if runner writes traces there — dev decides; either is acceptable).
6. SI-2 boundary HTML comment baked in: `<!-- SI-2 BOUNDARY: pdf-extractor dashboard ONLY — do not merge into docs/dashboards/index.html (stock-price exclusive) -->`.
7. G12 DoD gate: this is the third task in the streak. QA confirms: (a) git log shows sandbox-check step before final commit, (b) sandbox-green evidence is pasted in handoff. G12 streak-3 = COMPLETE.
8. `git add apps/pdf-extractor/dashboard/index.html` — explicit-file only.

---

### P1-E2 — Edit-Rerun Handler + G7 All-Sub-Gates

**Files:** dashboard edit-rerun handler (JavaScript or Python script that re-triggers `sandbox/runner.py` and refreshes trace JSON read by dashboard); optionally `sandbox/rerun.sh`

**Acceptance Criteria:**
1. **G7 sub-gate-1 (env audit):** `env | grep -iE "DB_PATH|VPS_|VINAHOST|STORAGE_DIR|OCR|TESSERACT|TOKEN|SECRET|API_KEY|PASSWORD"` run in sandbox process returns EMPTY.
2. **G7 sub-gate-2 (scenario JSON grep):** `grep -rniE "db_path|vps|vinahost|storage_dir|token|secret|api_key|password" apps/pdf-extractor/sandbox/` returns 0 matches.
3. **G7 sub-gate-3 (zero-infra build check):** `python -c "import domain.primitives.validate_financial_figures"` succeeds with PYTHONPATH=apps/pdf-extractor and without pdfplumber/pytesseract/aiohttp installed (pip install only domain-needed pure-Python packages: none required beyond stdlib).
4. **G7 sub-gate-4 (edit→rerun cycle):** dev edits `scenarios/primitives/validate_financial_figures/happy.json` (changes one expected value), re-runs `python sandbox/runner.py --tier=primitive --scenario=<path>`, confirms dashboard card refreshes with new result.
5. All 4 sub-gates confirmed PASS before RETURN.
6. Evidence: sub-gate results pasted as literal terminal output in handoff.

---

### P1-G — QA Close-Gate (Phase 1 exit)

**Owner:** qa (not dev-pdf-extractor)

**Acceptance Criteria:**
1. `python sandbox/runner.py --tier=primitive` runs all scenario JSONs under `scenarios/primitives/` — ALL exit 0.
2. `python sandbox/runner.py --tier=module` runs all module scenarios — ALL exit 0.
3. G7 zero-creds audit: all 4 sub-gates PASS (env audit + scenario grep + zero-infra import + edit→rerun).
4. Dashboard `apps/pdf-extractor/dashboard/index.html` renders 3 panels, all cards PASS (green after runner), no console errors.
5. G12 streak-3 confirmed: git log shows sandbox-green evidence in handoff for P1-B1 + P1-C + P1-E1 (3 consecutive dev tasks).

QA emits phase-1 close-gate signal: `docs/signals/qa-pdf-extractor-phase1-gate-<UTC>.json` with `gateVerdict: "PASS"` or `gateVerdict: "FAIL"`.

---

## Goals Advanced in Phase 1

| Goal | Phase-1 Tasks | Earned-Pending Status |
|---|---|---|
| G1 | P1-B1, P1-B2 (2 primitives + scenarios) | EARNED-PENDING (core-2 band; Phase 2 adds 4 more) |
| G2 | P1-C (module stub + module scenario) | EARNED-PENDING |
| G3 | P1-A3 (≤80 LOC — partial; Phase 2 finishes OpenAPI confirm) | PARTIALLY (≤80 LOC only) |
| G6 | P1-E1 (dashboard stub) | EARNED-PENDING |
| G7 | P1-A1 + P1-E2 (zero-cred + edit-rerun) | EARNED-PENDING (all 4 sub-gates) |
| G8 | P1-E1 + P1-E2 (honest NOT-RUN + honest RED on failure scenario) | EARNED-PENDING |
| G12 | P1-B1 + P1-C + P1-E1 (streak-3) | EARNED-PENDING |

Goals STILL-UNMET (Phase 2): G3 (full OpenAPI + grep), G4 (import-linter CI), G5 (G5b rewire — BCTC freeze), G9 (Playwright), G10 (blind bug fix), G11 (regression alarm).

**goalsEarned stays 0 throughout Phase 1.** PO-only at 12/12 terminal Phase 3. No goal flip instructions in any task. §4.5 inviolable.

---

## BCTC Freeze Assessment — Per-Task (Repeated for PM)

| Task | BCTC Path Touch? | Requires Freeze Clearance? |
|---|---|---|
| P1-A1 (sandbox runner) | NO | NO — CLEAR |
| P1-A2 (scenario dirs) | NO | NO — CLEAR |
| P1-A3 (main.py shrink) | NO | NO — CLEAR |
| P1-B1 (validate-financial-figures primitive) | NO | NO — CLEAR |
| P1-B2 (decimal-normalizer) | READ-ONLY of mcp-server source for archaeology; ZERO mcp-server writes | NO — CLEAR (PM note: freeze applies to mcp-server writes; reads are safe) |
| P1-C (module stub) | NO | NO — CLEAR |
| P1-D (module scenario) | NO | NO — CLEAR |
| P1-E1 (dashboard) | NO | NO — CLEAR |
| P1-E2 (edit-rerun + G7) | NO | NO — CLEAR |
| P1-G (QA close-gate) | NO | NO — CLEAR |

**All 10 Phase-1 tasks are CLEAR. PM can dispatch P1-A1 immediately.**

**Phase-2 G5b tasks that ARE gated:** The rewiring of `fetch_ssc_reports` and `bctc_batch_sweep` MCP tool handlers (touching `fetchParseAndStoreBctc.ts`) requires explicit PO freeze-lift signal for 1954c before PM dispatches. Architect will flag in Phase-2 task plan. PO must not dispatch these tasks without the lift signal.

---

## Execution Notes

- **Fleet serialization:** INTERIM FLEET-WIDE SINGLE-COMMITTER serialization applies. Run `git diff --cached --name-only` before staging — must be empty.
- **Python path:** All dev work in `apps/pdf-extractor/`. Set `PYTHONPATH=apps/pdf-extractor` when running sandbox.
- **No venv credentials:** sandbox runner must NOT activate `.venv` when checking env audit. Run with system Python (or bare venv with only stdlib).
- **Commit atomicity:** Each task = 1 commit (or 2 if signal is emitted separately). No bundling of multiple tasks.
- **Signal pattern:** dev emits `docs/signals/dev-pdf-extractor-P1-<task>-done-<UTC>.json` after each task commit.
