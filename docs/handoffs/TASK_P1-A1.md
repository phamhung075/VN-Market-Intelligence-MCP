---
task_id: P1-A1
title: "pdf-extractor Phase 1 — Sandbox Runner + Scenario Dir Layout + Composition Root"
pilot: pdf-extractor
phase: "1"
owner: dev-pdf-extractor
status: Done
priority: CRITICAL (HEADLINE RISK — gates all subsequent Phase-1 primitives)
created: 2026-05-24
authored_by: architect (Phase-1 first dispatch)
handoff_ref: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md §P1-A1
plan_ssot: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/phase-1-task-plan-python.md
charter_ref: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/pilot-charter.md
brownfield_ref: docs/architecture-briefs/2026-05-24-pdf-extractor-factory/p0-brownfield-inventory.md
bctc_freeze: CLEAR (no mcp-server writes, no BCTC path touch)
---

# TASK P1-A1 — pdf-extractor: Sandbox Runner + Scenario Dir Layout + Composition Root

## Context

This is the HEADLINE RISK task for the pdf-extractor SCALE pilot Phase 1. It builds the Python sandbox scenario runner that all subsequent primitive tasks depend on. Nothing else in Phase 1 can proceed until this task is DONE and the zero-credentials gate PASSES.

**Pilot:** pdf-extractor | **Language:** Python (locked Day 0) | **Zone:** `apps/pdf-extractor/` ONLY
**Goals advanced:** G7 (zero-cred sandbox), G12 (streak prerequisite)
**Blocks:** P1-A2 (scenario dirs), and through the zero-creds gate, P1-B1 (first primitive).

---

## Scope

Three sub-deliverables in one atomic task:

1. **Sandbox runner** — `apps/pdf-extractor/sandbox/runner.py` (JSON-in → trace-JSON-out, zero credentials)
2. **Scenario directory layout** — `apps/pdf-extractor/scenarios/{primitives,modules,service}/` (NOTE: P1-A2 is the standalone task for the full README set, but the directories themselves are pre-created here as scaffolding)
3. **Composition root shrink (partial)** — `apps/pdf-extractor/main.py` refactored to ≤80 logical lines

All three must land in one commit. This is the scaffold commit that opens Phase 1.

---

## Acceptance Criteria (7 — verbatim from task plan §P1-A1)

1. `python apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=<path>` runs without error when given a valid scenario JSON.
2. Output is a valid JSON trace to stdout: `{primitive, inputs, expected, actual, pass, error}`.
3. Exit code 0 = all scenarios PASS; exit code non-zero = at least 1 FAIL.
4. Runner imports ONLY from `domain/primitives/`. Zero imports from `infrastructure/`, `application/`, `interface/`, pdfplumber, pytesseract, aiohttp.
5. **ZERO-CREDS gate (BLOCKER before P1-B1):** `env | grep -iE "DB_PATH|VPS_|VINAHOST|STORAGE_DIR|OCR|TESSERACT|TOKEN|SECRET|API_KEY|PASSWORD"` run inside the sandbox process environment returns EMPTY.
6. **Scenario JSON grep (BLOCKER):** `grep -rniE "db_path|vps|vinahost|storage_dir|token|secret|api_key|password" apps/pdf-extractor/sandbox/` returns 0 matches.
7. `python apps/pdf-extractor/sandbox/runner.py --help` prints usage without error.

**Do NOT dispatch P1-B1 until AC-5 and AC-6 are confirmed PASS with literal terminal output pasted below.**

---

## Zero-Creds Gate Evidence (paste here before P1-B1 dispatch)

> dev-pdf-extractor: paste both commands and their literal terminal output here before returning.

### AC-5 — Env Audit (must return EMPTY)

```
Command: env | grep -iE "DB_PATH|VPS_|VINAHOST|STORAGE_DIR|OCR|TESSERACT|TOKEN|SECRET|API_KEY|PASSWORD"
Output:
[EMPTY — AC-5 PASS]
```

Verified: sandbox invoked with env={PYTHONPATH=apps/pdf-extractor, HOME=/Users/admin} only.
No credential vars present in sandbox process environment.

### AC-6 — Scenario JSON Grep (must return 0 matches)

```
Command: grep -rniE "db_path|vps|vinahost|storage_dir|token|secret|api_key|password" apps/pdf-extractor/sandbox/
Output:
[NO OUTPUT — 0 matches — AC-6 PASS]
```

---

## G12 DoD Gate Evidence (paste before RETURN)

> G12 rule (flow commit e7541786): dev does NOT mark P1-A1 done until the Python sandbox shows scenarios green for the touched tier.
>
> For P1-A1, the "touched tier" is the sandbox runner itself. Run the help check and the trace output check:

```
Command: PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py --help
Output:
usage: sandbox/runner.py [-h] --tier {primitive,module,service} --scenario PATH

PDF Extractor sandbox scenario runner — JSON-in, trace-JSON-out.
Executes a pure-function primitive against a scenario JSON fixture.

PYTHONPATH must be set to apps/pdf-extractor before invocation.
Zero credentials: sandbox is a pure-function harness only.

options:
  -h, --help            show this help message and exit
  --tier {primitive,module,service}
                        Scenario tier: primitive | module | service
  --scenario PATH       Path to the scenario JSON file to execute.

Command: PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/echo_identity/happy.json
Output:
{
  "primitive": "echo_identity",
  "inputs": {
    "value": 42
  },
  "expected": 42,
  "actual": 42,
  "pass": true,
  "error": null
}
EXIT: 0 — PASS

Command: PYTHONPATH=apps/pdf-extractor python apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=apps/pdf-extractor/scenarios/primitives/echo_identity/failure_mismatch.json
Output:
{
  "primitive": "echo_identity",
  "inputs": {
    "value": 42
  },
  "expected": 99,
  "actual": 42,
  "pass": false,
  "error": null
}
EXIT: 1 — FAIL (honest RED — G8 confirmed)
```

G12 DoD gate: sandbox runner operational. echo_identity primitive demonstrates GREEN (happy) + honest RED (failure).
37 pytest tests pass. Commit: 75ab2eae.

---

## [Architect] Brownfield Findings

### Zone

`apps/pdf-extractor/` — MANDATORY. PM propagates. dev-team Step 3 routes by this.

**BUILD-STANDARD: lean** (apps/pdf-extractor/ already exists — new feature / Phase 1 scaffold in existing service).
**BUILD-STANDARD-REF:** `docs/standards/microservice-build-standard.md`

### Verified Paths

- `apps/pdf-extractor/main.py` — FastAPI composition root, currently 101 LOC (target ≤80 after P1-A3 sub-deliverable). Extract `os.makedirs` → `apps/pdf-extractor/infrastructure/startup.py:ensure_dirs(cfg)` and `@asynccontextmanager lifespan` → `apps/pdf-extractor/infrastructure/lifespan.py:build_lifespan(cfg)`.
- `apps/pdf-extractor/domain/services.py` — contains `validate_financial_figures()` function (lines 23–98) that will be moved in P1-B1. Do NOT touch in P1-A1.
- `apps/pdf-extractor/infrastructure/` — existing layer; `startup.py` and `lifespan.py` are NEW files to create in the shrink.
- `apps/pdf-extractor/sandbox/` — does NOT exist yet. Create `runner.py` here.
- `apps/pdf-extractor/scenarios/` — does NOT exist yet. Create directory tree here.

### Design Decisions — Sandbox Runner

**DDD Layer:** `apps/pdf-extractor/sandbox/` is OUTSIDE the DDD layers. It is a developer-tool harness — not domain, not infrastructure. It must import ONLY from `domain/primitives/` (read-only); zero infrastructure imports.

**Runner contract:**
- CLI: `python sandbox/runner.py --tier=primitive --scenario=<path.json>` (also `--tier=module`, `--tier=service` for later phases)
- Input: scenario JSON file on disk. Schema: `{primitive, inputs, expected}` (or `{module, inputs, expected}` for module tier).
- Output: JSON trace to stdout: `{primitive, inputs, expected, actual, pass, error}`. One trace object per scenario file.
- Exit: 0 = all PASS, non-zero = ≥1 FAIL.
- PYTHONPATH: caller sets `PYTHONPATH=apps/pdf-extractor` before invoking runner.

**Zero-infra rule (AC-4):** Runner may NOT import pdfplumber, pytesseract, aiohttp, or any infrastructure module. It resolves the primitive by dynamic import from `domain/primitives/<name>/` and calls the pure function directly with `inputs` dict.

**Dynamic dispatch pattern (recommended):**
```python
# runner.py conceptual skeleton — do not copy verbatim
import importlib, json, sys, argparse

def run_scenario(scenario_path: str) -> dict:
    data = json.loads(open(scenario_path).read())
    primitive_name = data["primitive"]          # e.g. "validate_financial_figures"
    module = importlib.import_module(f"domain.primitives.{primitive_name}")
    fn = getattr(module, primitive_name)         # convention: function name == primitive name
    actual = fn(**data["inputs"])
    passed = actual == data["expected"]
    return {"primitive": primitive_name, "inputs": data["inputs"],
            "expected": data["expected"], "actual": actual, "pass": passed, "error": None}
```

**Fixture scenario JSON schema:**
```json
{
  "primitive": "validate_financial_figures",
  "inputs": { "...": "..." },
  "expected": "<value>"
}
```

**Composition root shrink (P1-A3 sub-deliverable baked into this task):**
- `main.py` keeps: `create_app()`, `app = create_app()`, `if __name__ == "__main__"` block, FastAPI route registrations.
- `main.py` MUST NOT contain: `os.makedirs` calls (→ `infrastructure/startup.py`), `@asynccontextmanager lifespan` body (→ `infrastructure/lifespan.py`).
- No domain logic is added to `main.py`. This is purely mechanical extraction.

### Scenario Directory Layout

```
apps/pdf-extractor/scenarios/
├── README.md                          (top-level schema overview)
├── primitives/
│   ├── validate_financial_figures/    (created by P1-A1 scaffold; JSONs added by P1-B1)
│   ├── decimal_normalizer/            (created by P1-A1 scaffold; JSONs added by P1-B2)
│   └── (future primitives Phase 2)
├── modules/
│   └── financial_reports/             (created by P1-A1 scaffold; JSONs added by P1-D)
└── service/
    └── (Phase 2+ service-tier scenarios)
```

Create directories now with `.gitkeep` placeholders so git tracks them. Primitive-specific READMEs (describing per-primitive JSON schema) are P1-A2 scope — do not block P1-A1 on them.

### Risk Flags

**R-1 (HEADLINE RISK — ZERO-CREDS):** Sandbox must never see DB_PATH, VPS credentials, OCR credentials, or any secret. AC-5 (env audit) + AC-6 (scenario JSON grep) are mandatory blockers before P1-B1 dispatch. dev-pdf-extractor must run both checks in the actual sandbox shell environment, not a clean terminal, to catch env leaks from .venv activation or shell profile.

**R-2 (Import contamination):** If runner.py ever imports from `infrastructure/`, the G4 fence (Phase 2 import-linter) will catch it — but the damage will already exist in the codebase. Verify AC-4 with `grep -rn "from infrastructure\|import infrastructure\|from application\|import pdfplumber\|import pytesseract\|import aiohttp" apps/pdf-extractor/sandbox/` = 0 matches.

**R-3 (PYTHONPATH discipline):** Runner depends on `PYTHONPATH=apps/pdf-extractor` being set by the caller. Document this in `sandbox/runner.py` docstring. Failure to set it will produce `ModuleNotFoundError` on `from domain.primitives...` — expected and safe; not a bug.

**R-4 (main.py shrink):** The composition root refactor is mechanical. Do NOT add new behavior. If `create_app()` imports break after extraction, fix by importing from the new `infrastructure/startup.py` and `infrastructure/lifespan.py` modules.

### Scan Clean

true (brownfield confirmed in `p0-brownfield-inventory.md` §3: domain/ has ZERO infra imports; golden rule PASS).

---

## Execution Constraints

- **Explicit-file staging ONLY:** `git add apps/pdf-extractor/sandbox/runner.py apps/pdf-extractor/scenarios/... apps/pdf-extractor/main.py apps/pdf-extractor/infrastructure/startup.py apps/pdf-extractor/infrastructure/lifespan.py`
- **No `-A`, no `.`** in any git add command.
- **Commit-retry idiom:** if `git commit` fails with `index.lock` or `HEAD.lock`, wait 5s and retry once (fleet committer active concurrently). Do NOT use `--no-verify` or `--force`.
- **All on main** — no branches.
- **No push.**
- **PYTHONPATH:** `PYTHONPATH=apps/pdf-extractor` for all sandbox commands.
- **Signal after commit:** emit `docs/signals/dev-pdf-extractor-P1-A1-done-<UTC>.json` with `task: "P1-A1"`, `verdict: "PASS"`, `ac5_pass: true`, `ac6_pass: true`, `zero_creds_gate: "PASS"`.

## RETURN

After commit and signal:

```
DONE: P1-A1 sandbox runner + scenario dirs + composition root shrink
ZONE: apps/pdf-extractor/
ZERO-CREDS-GATE: PASS (AC-5 + AC-6 evidence pasted above)
G12-DOD: PASS (sandbox runner operational, --help green)
NEXT: P1-A2 (scenario directory READMEs per-primitive)
NOTE: P1-B1 remains BLOCKED until this handoff contains AC-5+AC-6 PASS evidence.
PIPELINE: continue
```
