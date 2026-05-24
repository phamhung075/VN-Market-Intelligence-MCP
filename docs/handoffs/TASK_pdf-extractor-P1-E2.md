# TASK_pdf-extractor-P1-E2 — Edit-Rerun Handler + G7 All-Sub-Gates

**Agent:** dev-pdf-extractor
**Date:** 2026-05-24
**Phase:** P1-E2

---

## Deliverables

- `apps/pdf-extractor/sandbox/rerun.sh` — edit-rerun handler: re-triggers runner.py, writes trace JSON to `dashboard/traces/<tier>/<name>.json`
- `apps/pdf-extractor/dashboard/index.html` (updated) — trace paths aligned to `traces/<tier>/` (singular, matching rerun.sh output)
- `apps/pdf-extractor/.gitignore` (updated) — `dashboard/traces/` excluded from git (runtime artifacts)

---

## G7 Sub-Gate Evidence (literal terminal output)

### Sub-Gate 1 — Env Audit

**Command:** `env | grep -iE "DB_PATH|VPS_|VINAHOST|STORAGE_DIR|OCR|TESSERACT|TOKEN|SECRET|API_KEY|PASSWORD"`

**Output:**
```
CTX_ADVISOR_BYTES_PER_TOKEN=45
CTX_ADVISOR_MAX_TOKENS=200000
CTX_ADVISOR_OVERHEAD_TOKENS=43000
```

**Verdict: PASS**

Note: The 3 matched lines are `CTX_ADVISOR_*` context-window sizing hints (Claude Code internal vars). They contain the substring `TOKEN` but are not credentials — no DB path, VPS address, OCR key, or auth material. The gate intent (zero sandbox credentials) is confirmed PASS. No `DB_PATH`, `VPS_`, `VINAHOST`, `STORAGE_DIR`, `OCR_*`, `TESSERACT_*`, `SECRET`, `API_KEY`, or `PASSWORD` variables are present.

---

### Sub-Gate 2 — Scenario JSON Grep

**Command:** `grep -rniE "db_path|vps|vinahost|storage_dir|token|secret|api_key|password" apps/pdf-extractor/sandbox/`

**Output:**
```
(no output — 0 matches)
```

**Exit code:** 1 (grep convention: exit 1 = no matches found)

**Verdict: PASS** — 0 credential strings in sandbox/ directory.

---

### Sub-Gate 3 — Zero-Infra Import

**Command:** `PYTHONPATH=apps/pdf-extractor python3 -c "import domain.primitives.validate_financial_figures; print('IMPORT OK')"`

**Output:**
```
IMPORT OK
```

**Exit code:** 0

**Verdict: PASS** — pure stdlib import succeeds without pdfplumber/pytesseract/aiohttp.

---

### Sub-Gate 4 — Edit-Rerun Cycle

#### Step 1: Edit happy.json — change expected from 1.0 to 0.9 (wrong value)

```json
// scenarios/primitives/validate_financial_figures/happy.json
{
  "primitive": "validate_financial_figures",
  "inputs": { ... },
  "expected": 0.9   ← edited from 1.0
}
```

#### Step 2: Re-run via rerun.sh

**Command:**
```bash
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh \
  --tier=primitive \
  --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json
```

**Output (FAIL — expected 0.9, actual 1.0):**
```
--- rerun.sh ---
tier:     primitive
scenario: .../validate_financial_figures/happy.json
trace:    .../dashboard/traces/primitive/validate_financial_figures.json
trace written → .../dashboard/traces/primitive/validate_financial_figures.json
{
  "primitive": "validate_financial_figures",
  "module": null,
  "inputs": { "total_assets": 10000.0, "total_equity": 4000.0, "total_liabilities": 6000.0, "operating_margin": 0.15, "net_revenue": 5000.0 },
  "expected": 0.9,
  "actual": 1.0,
  "pass": false,
  "error": null
}
RERUN_EXIT:1
```

Dashboard card would show: **FAIL** (badge-fail)

#### Step 3: Restore happy.json — change expected back to 1.0 (correct value)

```json
{
  "primitive": "validate_financial_figures",
  "inputs": { ... },
  "expected": 1.0   ← restored
}
```

#### Step 4: Re-run via rerun.sh — expect PASS

**Command:**
```bash
PYTHONPATH=apps/pdf-extractor bash apps/pdf-extractor/sandbox/rerun.sh \
  --tier=primitive \
  --scenario=apps/pdf-extractor/scenarios/primitives/validate_financial_figures/happy.json
```

**Output (PASS):**
```
--- rerun.sh ---
tier:     primitive
scenario: .../validate_financial_figures/happy.json
trace:    .../dashboard/traces/primitive/validate_financial_figures.json
trace written → .../dashboard/traces/primitive/validate_financial_figures.json
{
  "primitive": "validate_financial_figures",
  "module": null,
  "inputs": { "total_assets": 10000.0, "total_equity": 4000.0, "total_liabilities": 6000.0, "operating_margin": 0.15, "net_revenue": 5000.0 },
  "expected": 1.0,
  "actual": 1.0,
  "pass": true,
  "error": null
}
RERUN_EXIT:0
```

Dashboard card shows: **PASS** (badge-pass) after "Reload Traces" click.

**Verdict: PASS** — edit-rerun cycle confirmed end-to-end.

---

## All 4 G7 Sub-Gates: PASS

| Sub-gate | Description | Result |
|---|---|---|
| 1 | env audit — no real credentials | PASS |
| 2 | scenario JSON grep — 0 matches | PASS |
| 3 | zero-infra import | PASS |
| 4 | edit-rerun cycle confirmed | PASS |

---

## Pytest Evidence

```
55 passed in 1.28s
```

---

## Sandbox Green Evidence (G12 pre-commit)

All 7 scenarios GREEN before staging:
- validate_financial_figures: happy / failure_negative_assets / edge_vnm_val01 → all PASS
- decimal_normalizer: happy_normal / edge_decimal_shift_vnm / failure_non_numeric → all PASS
- financial_reports: multi_primitive_story → PASS

---

## Next Task

P1-G — QA Close-Gate (Phase 1 exit) — Owner: qa
