---
title: "P0 Brownfield Inventory — pdf-extractor"
date: "2026-05-24"
author: "architect (pdf-extractor phase-0)"
pilot: "pdf-extractor"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/pdf-extractor-charter.md"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
phase: 0
deliverable: "PHASE0-D1"
language: "Python"
---

# P0 Brownfield Inventory — `apps/pdf-extractor/`

Scope: full brownfield scan of the existing Python microservice. Language is LOCKED Python — no rewrite. This is rewire + extract, not rebuild.

---

## 1. Source Files — LOC + DDD Layer Mapping

### Core source (module root)

| File | LOC | DDD Layer | Status |
|---|---|---|---|
| `domain/models.py` | 73 | **domain** — value objects + entities | CLEAN — `PDFDocument`, `ExtractedTable`, `ExtractedContent`; zero infra imports |
| `domain/repositories.py` | 56 | **domain** — port interfaces (ABC) | CLEAN — `PDFDocumentRepository`, `PDFStorageRepository`, `PDFExtractionEngine`; all abstract |
| `domain/errors.py` | 25 | **domain** — custom exceptions | CLEAN — `PDFProcessingError`, `PDFNotFoundError`, `PDFDownloadError`, `PDFLowQualityError` |
| `domain/services.py` | 194 | **domain** — domain service + validation | **MIXED** — `validate_financial_figures()` is a PURE primitive candidate (96 lines, deterministic, zero I/O); `ExtractPDFService` is a true domain service (orchestrates ports only, no direct infra); both live in same file — needs split at primitive extraction |
| `application/dtos.py` | 50 | **application** — DTOs | CLEAN — `ExtractPDFRequest`, `ExtractPDFResponse`, `ExtractedTableDTO` |
| `application/usecases.py` | 78 | **application** — use case | MOSTLY CLEAN — but L47 accesses `self.extract_service.doc_repo` directly (application bypasses domain service encapsulation); acceptable pre-refactor; must be DI-injected cleanly post-refactor |
| `infrastructure/config.py` | 27 | **infrastructure** — config loader | CLEAN — `Config.from_env()` reads env vars only |
| `infrastructure/extraction_engine.py` | 135 | **infrastructure** — OCR adapter | CLEAN — `PdfplumberExtractionEngine` implements `PDFExtractionEngine` port; uses pdfplumber + pytesseract; correctly isolated behind port |
| `infrastructure/repositories.py` | 193 | **infrastructure** — DB + HTTP adapters | CLEAN — `SQLitePDFDocumentRepository` + `HTTPPDFStorageRepository`; both implement domain ports; aiohttp HTTP is here |
| `interface/handlers.py` | 38 | **interface** — FastAPI route handlers | CLEAN — thin HTTP layer; delegates to `ExtractPDFUseCase`; no domain bypass |
| `interface/serializers.py` | 40 | **interface** — Pydantic schemas | CLEAN — `ExtractPDFRequestSchema`, `HealthResponse` |
| `main.py` | 101 | **composition root** | **RISK** — 101 lines (target ≤80). Has business-ish directory creation (`os.makedirs`) + an inline `@asynccontextmanager` lifespan inside `create_app()`. Wiring logic is correct. Requires shrinkage to ≤80 logical lines for G3 compliance. Port 5001 confirmed (L95). |

**Total source LOC: 1 010** (excluding tests, venv, `__init__.py` stubs)

### Tests inventory

| File | LOC | Coverage target |
|---|---|---|
| `__tests__/unit/test_extract_pdf_service.py` | 214 | `ExtractPDFService.process_pdf()` — AsyncMock ports, 5+ cases |
| `__tests__/unit/test_financial_validation.py` | 247 | `validate_financial_figures()` — 6 rule cases (VAL-01..06) |
| `__tests__/integration/test_extract_pdf_usecase.py` | 191 | `ExtractPDFUseCase.execute()` integration path |

**3 test files, 652 test LOC.** No scenario runner, no sandbox directory, no dashboard.

---

## 2. OCR/IO Boundary Map — CRITICAL FINDING

This is the single most important boundary for this service. The sandbox Security Clause requires zero VPS/OCR/DB credentials.

### CONFIRMED: OCR call + VPS PDF pull are ADAPTERS in `infrastructure/`

| Component | Location | Layer | Sandbox-eligible? |
|---|---|---|---|
| `PdfplumberExtractionEngine.extract_tables()` | `infrastructure/extraction_engine.py:26` | infrastructure | NO — calls pdfplumber, binary I/O |
| `PdfplumberExtractionEngine.extract_text_ocr()` | `infrastructure/extraction_engine.py:71` | infrastructure | NO — calls pdfplumber + pytesseract (Tesseract) |
| `PdfplumberExtractionEngine._ocr_page()` | `infrastructure/extraction_engine.py:116` | infrastructure | NO — calls pytesseract.image_to_string() |
| `HTTPPDFStorageRepository.fetch_pdf()` | `infrastructure/repositories.py:155` | infrastructure | NO — aiohttp GET to VPS URL |
| `SQLitePDFDocumentRepository.*` | `infrastructure/repositories.py:52` | infrastructure | NO — SQLite; credential env var DB_PATH |
| `Config.from_env()` | `infrastructure/config.py:20` | infrastructure | NO — reads `DB_PATH`, `STORAGE_DIR` |

**All OCR calls and VPS PDF pulls are correctly behind ports in `infrastructure/`. Domain layer imports ZERO from infrastructure (golden rule CONFIRMED CLEAN).**

### CONFIRMED: Primitive candidates are PURE post-OCR transforms

The 5 candidates below take ONLY primitive Python types (floats, strings, booleans) as inputs — zero bytes, zero file handles, zero network sockets, zero DB connections. They are deterministic given the same input. All 5 can be executed inside the sandbox with a JSON input fixture.

| Primitive | Source Location | Inputs | Output | Deterministic? |
|---|---|---|---|---|
| `confidence-scorer` | Inlined in `ExtractPDFService.process_pdf()` L148 — `ocr_conf < _OCR_CONFIDENCE_THRESHOLD and not tables` quality gate | `ocr_confidence: float`, `table_count: int` | `pass: bool`, `quality_score: float` | YES |
| `decimal-normalizer` | NOT yet extracted — the decimal-shift bug class (VNM net_profit=0.000051, DHG rev=0.000009) lives in downstream mcp-server BCTC parsers. The primitive here normalizes raw numeric strings from OCR text (e.g. "0.051" → 51.0 in billion VND). Target: extract from parsing patterns in `fetchParseAndStoreBctc.ts` patterns → pure Python function | `raw_string: str`, `unit_hint: str` | `normalized_float: float` | YES |
| `ratio-computer` | NOT yet extracted — computes derived financial ratios (gross margin = gross_profit/net_revenue, D/E = total_liabilities/equity). Pure arithmetic | `numerator: float`, `denominator: float`, `ratio_type: str` | `ratio: float \| None` | YES |
| `field-extractor` | Inlined in mcp-server `fetchParseAndStoreBctc.ts` regex patterns — extracts named fields from OCR text using regex heuristics. Python variant: regex-based field matcher | `text: str`, `field_name: str` | `value: str \| None` | YES |
| `low-confidence-gate` | Inlined as `_OCR_CONFIDENCE_THRESHOLD = 0.5` in `domain/services.py:17` and the insert-gate logic in mcp-server (confidence=0 skips insert; <0.2 low_confidence flag; ≥0.2 normal). Two distinct gates to unify | `confidence: float` | `disposition: Literal["skip", "low_confidence", "normal"]` | YES |

**Additionally, `validate_financial_figures()` in `domain/services.py:23-98` (96 lines) is already a near-complete primitive: pure function, 6 rules, deterministic, zero I/O, already unit-tested. It should become the SIXTH primitive during extraction — it is today's most complete primitive candidate.**

---

## 3. Final Primitive Count + List (Architect Confirmed)

**6 primitives** selected for this pilot (charter §G1 calibration said "5 candidate primitives" — architect adds `validate-financial-figures` as the 6th because it already exists as a near-complete pure function in `domain/services.py` and is already tested; extracting it costs one move, not a rewrite):

| # | Primitive Name | Python Package Path | Source | Rationale |
|---|---|---|---|---|
| 1 | `validate-financial-figures` | `domain/primitives/validate_financial_figures/` | `domain/services.py:23-98` — `validate_financial_figures()` | Already pure, already tested; cheapest extraction; anchors the primitive pattern |
| 2 | `confidence-scorer` | `domain/primitives/confidence_scorer/` | `domain/services.py:17` + quality-gate L148 | Standalone threshold logic; test: confidence=0.4+tables=0→FAIL, confidence=0.8→PASS |
| 3 | `decimal-normalizer` | `domain/primitives/decimal_normalizer/` | Distributed across mcp-server BCTC parsers (not yet in pdf-extractor domain); brings the decimal-shift bug class in-scope | Fixes the highest-ROI known bug class (VNM/DHG decimal shift) |
| 4 | `low-confidence-gate` | `domain/primitives/low_confidence_gate/` | `domain/services.py:17` (_OCR_CONFIDENCE_THRESHOLD) + mcp-server insert-gate logic | Unifies two gating behaviours into one primitive with 3-way output |
| 5 | `ratio-computer` | `domain/primitives/ratio_computer/` | Not yet extracted — pure arithmetic (gross_margin, D/E, ROE etc.) | Deterministic, zero infra, trivially testable |
| 6 | `field-extractor` | `domain/primitives/field_extractor/` | mcp-server BCTC regex extraction patterns (ported to Python) | Named-field extraction from OCR text; enables scenario-based coverage of extraction accuracy |

**Module recommendation (G2):** ONE module only — `financial-reports` — composing all 6 primitives via Python Protocol ports. Path: `domain/modules/financial_reports/`.

**Module name LOCKED: `financial-reports`** — matches the MCP tool folder `apps/mcp-server/src/interface/mcp/tools/financial-reports/` (the G5b rewire scope).

---

## 4. MCP Tool Handlers in `apps/mcp-server/` — G5b HTTP-Rewire Scope

The pdf-extractor microservice is ALREADY an HTTP service at port 5001. The mcp-server already has `pdfExtractorClient.ts` calling it. However several BCTC tools bypass the microservice and call domain logic directly.

### G5b HTTP-Rewire Target List (exact tool handlers)

| MCP Tool | Tool File | Implementation Mode | G5b Action |
|---|---|---|---|
| `fetch_ssc_reports` | `apps/mcp-server/src/interface/mcp/tools/financial-reports/reports.ts` | Calls `fetchParseAndStoreBctc` use case (direct import) → orchestrates PDF download + parse + store in mcp-server | BCTC FREEZE — do NOT touch until 1953-G-FAIL/1954c cleared |
| `get_bctc_full` | `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` | Direct SQLite reads + `computePeriodDelta` domain service + `computeSentimentTrend` — reads from `financial_reports` table | BCTC FREEZE — do NOT touch; SQL reads acceptable post-migration |
| `bctc_batch_sweep` | `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcBatchSweepTool.ts` | Calls `runBctcBatchSweep` scheduler job | BCTC FREEZE — do NOT touch |
| `bctc_skip` | `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcSkipTool.ts` | SQLite status update only | Low-risk; not a primitive call; defer |
| `get_cash_flow` | `apps/mcp-server/src/interface/mcp/tools/financial-reports/cashFlowTool.ts` | SQLite reads from `financial_reports` | Low-risk; not a primitive call; defer |
| `get_bctc_ocf` | `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcOcfTool.ts` | SQLite reads | Low-risk; defer |
| `compute_accruals` | `apps/mcp-server/src/interface/mcp/tools/financial-reports/computeAccrualsTool.ts` | Domain calculation; direct DB reads | Potential rewire candidate post-freeze |
| (health check) | `apps/mcp-server/src/index.ts:121` | `checkPdfExtractorHealth()` → already HTTP | Already HTTP — DONE |
| (extraction path) | `apps/mcp-server/src/infrastructure/fetchers/pdf.ts:219` | `extractViaMicroservice()` via `pdfExtractorClient.ts` → POST /extract | Already HTTP — DONE |

**Key architectural finding:** The pdf-extractor microservice HTTP path (`pdfExtractorClient.ts` → POST `/extract`) is ALREADY wired and operational. The mcp-server `pdf.ts` fetcher calls it with fallback. `index.ts` health-checks it. This is a materially BETTER starting point than macro-indicators was: G5b scope for Phase 2 is NARROW (only the domain-calling tools listed above — and all of them are gated by BCTC freeze).

**G5b scope summary:** The existing HTTP path (`/extract`) already works. The remaining G5b work (primitive API endpoints in pdf-extractor, rewire of domain-calling BCTC tools) is Phase-2-only and depends on BCTC freeze lifting. No Phase-1 task needs to touch G5b.

---

## 5. DDD Layer Assessment

| Layer | Files | Status | Notes |
|---|---|---|---|
| **domain/** | models.py, repositories.py, errors.py, services.py | MOSTLY CLEAN | `validate_financial_figures()` should become primitive-1; `ExtractPDFService` is a correct domain service |
| **application/** | usecases.py, dtos.py | MOSTLY CLEAN | L47 direct `self.extract_service.doc_repo` access is a mild DDD smell; pre-refactor acceptable |
| **infrastructure/** | config.py, extraction_engine.py, repositories.py | CLEAN | All implement domain ports; no domain bypass |
| **interface/** | handlers.py, serializers.py | CLEAN | Thin HTTP layer; no domain bypass |
| **composition root** | main.py | **NEEDS SHRINK** | 101 LOC; target ≤80; `os.makedirs` + lifespan inline bloat fixable |

**Golden rule check:** `domain/` has ZERO imports from `infrastructure/` — CONFIRMED CLEAN.

**No `domain/primitives/`, no `domain/modules/`, no `cmd/sandbox/` equivalent (Python scenario runner), no `dashboard/` — RED verdict as expected pre-Phase-1.**

---

## 6. Risk Flags

### R-1 — `validate_financial_figures()` is already correct but lives mixed with `ExtractPDFService` in same file (LOW-MEDIUM)

`domain/services.py` mixes a pure primitive candidate (`validate_financial_figures`, L23–98) with a domain service (`ExtractPDFService`, L101–194). The pure function is called by the service at L168 with all `None` inputs (always returns `1.0`). This means financial validation is effectively inert in the current pipeline. **The extraction → domain-primitives folder split is safe (move, not rewrite) and must not break the service's `confidence_financial` field assignment.** The call site in `ExtractPDFService` must be refactored to call via the primitive's new location.

### R-2 — Decimal-shift bug class lives in mcp-server, not pdf-extractor (HIGH for G10/G11)

The `decimal-normalizer` primitive does not yet exist as code in `apps/pdf-extractor/`. The decimal-shift patterns (VNM net_profit=0.000051, DHG rev=0.000009) live in `fetchParseAndStoreBctc.ts` regex parsers in mcp-server. Porting the normalization logic to a Python primitive requires archaeology of the mcp-server parser + careful scenario JSON construction with real-world fixture values. This is Phase-1 primitive task P1-B2 work, not scaffold work.

### R-3 — Python sandbox tooling gap (HEADLINE RISK for G1/G7)

Unlike Go services (which have `cmd/sandbox/main.go`), no Python scenario runner exists. There is no `python sandbox runner --tier=primitive` equivalent. Building it is a Phase-1 prerequisite — it MUST land before the first primitive task (P1-B1) to satisfy G1 (primitives run in sandbox) and G7 (zero-cred env audit). **This is the single gating task for the entire Phase 1 sequence.**

### R-4 — BCTC freeze blocks all G5b rewire tasks (HIGH for scheduling)

The recurring-bug freeze (1953-G-FAIL / 1954c architect rethink) is **currently in force and has been for multiple sprints** (confirmed: `B-08-BCTC-VPS-stale-78h` still open, `1954-BCTC-write-chain-rca` still open with `fixCycles=0`). Every Phase-1 task that touches BCTC code paths (`fetchParseAndStoreBctc.ts`, `bctcBatchSweepJob`, any BCTC scheduler) is FROZEN until 1954c lands. Phase-1 tasks do NOT touch these paths (Phase-1 scope is Python-side only: scaffold + primitives + module stub + dashboard). Phase-2 G5b rewire tasks (rewiring MCP BCTC tools to call new primitive HTTP endpoints) ARE potentially blocked — see §8 BCTC freeze assessment.

### R-5 — Security Clause: VPS + OCR + DB credential scope is WIDER than Go pilots (HIGH for G7)

This service touches three credential surfaces that Go pilots did not:
- `DB_PATH` → `pdf_extractor.db` (SQLite path/credential)
- `STORAGE_DIR` → file system path
- VPS URL embedded in `fetch_pdf()` — may be a VPS_URL env var

The G7 env audit forbidden grep must include ALL of: `DB_|API_KEY|SECRET|TOKEN|PASSWORD|VPS_|VINAHOST|STORAGE_DIR|PDF_EXTRACTOR_DB`. Scenario JSON must never embed real VPS URLs (use `http://localhost:9999` or `file://fixtures/` pattern).

### R-6 — `main.py` at 101 LOC violates G3 target of ≤80 (MEDIUM)

The composition root `main.py` is 101 logical lines. G3 requires ≤80. The `os.makedirs` calls (L40–41) and the inline `@asynccontextmanager lifespan` function (L59–66) are the bloat. These can be extracted to `infrastructure/config.py` (makedirs) and a `lifespan.py` helper (context manager) without touching domain logic. This is a Phase-2 G3 task.

### R-7 — No import fence exists yet (MEDIUM for G4)

No `import-linter` contracts in `pyproject.toml`. The golden rule (domain zero infra imports) is CURRENTLY CLEAN but is not mechanically enforced — it depends on developer discipline. G4 requires `import-linter` CI enforcement. Pre-revert tag `pdf-extractor-pre-ci` must be created before the fence CI task lands (Phase 2).

---

## 7. Python Sandbox Architecture Recommendation

The Python analog of Go's `cmd/sandbox/main.go` is a script at `apps/pdf-extractor/sandbox/runner.py` (or `cmd/sandbox/runner.py` for structural consistency with Go pilots).

Recommended interface:
```
python apps/pdf-extractor/sandbox/runner.py --tier=primitive --scenario=<path-to-json>
```

Input (scenario JSON):
```json
{
  "primitive": "validate-financial-figures",
  "inputs": { "total_assets": 10000.0, "total_equity": 4000.0, ... },
  "expected": { "confidence": 1.0 }
}
```

Output (trace JSON, to stdout):
```json
{
  "primitive": "validate-financial-figures",
  "inputs": { ... },
  "expected": { "confidence": 1.0 },
  "actual": { "confidence": 1.0 },
  "pass": true,
  "error": null
}
```

Exit code: 0 = all scenarios PASS; non-zero = at least one FAIL (required for G8 honest-red proof).

**No DB connection, no VPS URL, no pdfplumber, no pytesseract** — the sandbox ONLY imports from `domain/primitives/`. Infrastructure imports are forbidden in primitive code (G4 fence enforces this). The `PYTHONPATH` inside the sandbox invocation should be scoped to `apps/pdf-extractor/` only.

---

## 8. BCTC Freeze Assessment — Phase-1 Task-by-Task

**Freeze status (as of 2026-05-24):** 1953-G-FAIL / 1954c ACTIVE. `B-08-BCTC-VPS-stale-78h` OPEN. `1954-BCTC-write-chain-rca` fixCycles=0 OPEN. Freeze has been in force for multiple sprints. No clearance signal found. **FREEZE IS IN FORCE.**

| Phase-1 Task | BCTC Code Path Touch? | Freeze Impact |
|---|---|---|
| P1-A: scaffold (FastAPI composition root ≤80L + Python sandbox runner + scenario dir layout) | NO — `main.py` restructure is purely structural; no BCTC logic touched | CLEAR — no freeze-clearance required |
| P1-B1: first primitive `validate-financial-figures` (move from `domain/services.py`) | NO — pure Python move within `apps/pdf-extractor/`; no mcp-server touch | CLEAR — no freeze-clearance required |
| P1-B2: second primitive `decimal-normalizer` | CAUTION — the decimal-normalizer logic lives in mcp-server BCTC parsers (`fetchParseAndStoreBctc.ts`). Porting the logic to Python is READ-ONLY from mcp-server (archaeology only); the new primitive lives ONLY in `apps/pdf-extractor/domain/primitives/`. No mcp-server write. | CONDITIONAL — read mcp-server source only, write nothing in mcp-server; this is safe. PM should note: if dev accidentally edits mcp-server BCTC files during P1-B2, that edit is FROZEN. |
| P1-C: module stub `financial-reports` | NO — pure `apps/pdf-extractor/` Python; no mcp-server touch | CLEAR |
| P1-D: module scenario JSON | NO | CLEAR |
| P1-E: dashboard stub + edit-rerun handler + env audit | NO | CLEAR |

**All Phase-1 tasks are CLEAR of the BCTC freeze.** No Phase-1 task requires PO freeze-clearance before dispatch.

**Phase-2 tasks that ARE freeze-gated:**

| Phase-2 Task (anticipated) | BCTC Code Path Touch? | Freeze Gate |
|---|---|---|
| G5b: rewire `fetch_ssc_reports` tool to call pdf-extractor primitive API endpoint | YES — touches `reports.ts` + `fetchParseAndStoreBctc` use case | HARD FREEZE — requires 1954c clearance from PO before PM can dispatch |
| G5b: rewire `bctc_batch_sweep` tool | YES — touches `bctcBatchSweepJob.ts` | HARD FREEZE — requires 1954c clearance |
| G3: main.py shrink to ≤80 LOC | NO — structural only | CLEAR |
| G4: import-linter fence CI | NO — adds `pyproject.toml` contracts + CI job; no BCTC logic | CLEAR |
| G9: PO Playwright dashboard verification | NO | CLEAR |
| G10/G11: bug injection (decimal-normalizer or low-confidence-gate) | NO — injection in `apps/pdf-extractor/domain/primitives/` only | CLEAR |

**EXPLICIT FLAG TO PO:** Two Phase-2 G5b tasks require 1954c freeze clearance before PM can dispatch. PM must gate these tasks on a PO freeze-lift signal. Architect will flag again in the Phase-2 task plan.

---

## 9. G4 Python Fence Tool Recommendation (SI-4)

**Recommended tool: `import-linter`** (PyPI: `import-linter`, package `lint-imports`)

Rationale:
- Declarative contracts in `pyproject.toml` `[tool.importlinter]` section — no extra config file
- Supports import independence rules: "module X must not import from Y" (exact match for DDD primitive-isolation)
- CI integration: `lint-imports` CLI exits non-zero on violation (G4 R-FENCE gate requirement)
- Works with any Python project structure; does not require a monorepo plugin
- Available on PyPI; add to `dev` optional deps in `pyproject.toml`

**Contracts to encode (Fence-A + Fence-B):**

```ini
[importlinter]
root_packages = [domain, application, infrastructure, interface]

[[importlinter:contract]]
name = "Fence-A: domain/primitives must not import infrastructure, application, or interface"
type = independence
modules = [
    domain.primitives.validate_financial_figures,
    domain.primitives.confidence_scorer,
    domain.primitives.decimal_normalizer,
    domain.primitives.low_confidence_gate,
    domain.primitives.ratio_computer,
    domain.primitives.field_extractor,
]
ignore_imports = []

[[importlinter:contract]]
name = "Fence-B: domain/modules must not import from other modules or infrastructure"
type = forbidden
source_modules = [domain.modules.financial_reports]
forbidden_modules = [infrastructure, interface]
```

**CI job:** `.github/workflows/ci-pdf-extractor.yml` — `working-directory: apps/pdf-extractor` — runs `lint-imports`. Deliberate-violation proof: inject one `from infrastructure.config import Config` into a primitive → CI must exit non-zero with fence-a contract name in output — then revert (never committed per G4 protocol).

**Pre-revert tag:** `pdf-extractor-pre-ci` — created immediately before the CI job activation commit (Phase 2 P2-A equivalent).

---

## 10. Python Scenario Runner Gap — G1 Prerequisite Scope

**Explicit statement per task instruction:** NO Python scenario runner exists in `apps/pdf-extractor/` as of this brownfield scan. There is no `sandbox/runner.py`, no `scenarios/` directory, no dashboard. This is the first Phase-1 task and a HARD PREREQUISITE for G1.

**Build scope (Phase-1 first task, P1-A):**
- `apps/pdf-extractor/sandbox/runner.py` — JSON-in → trace-JSON-out, zero credentials, zero pdfplumber, zero pytesseract
- `apps/pdf-extractor/scenarios/primitives/` — directory layout for scenario JSON files
- `apps/pdf-extractor/scenarios/modules/` — module-tier scenario directory
- `apps/pdf-extractor/scenarios/service/` — service-tier scenario directory
- Test: run `python sandbox/runner.py --tier=primitive --scenario=scenarios/primitives/validate_financial_figures/happy.json` — must exit 0
- Env audit: `env | grep -iE "DB_PATH|VPS_|VINAHOST|OCR|TESSERACT|TOKEN|SECRET|API_KEY|PASSWORD"` must return EMPTY in sandbox process

This is not optional and not deferrable. It gates every G1, G7, G8 scenario.

---

## 11. Phase 0 Exit Gate Verification

| Gate criterion | Status |
|---|---|
| All deliverables landed (signal trail) | PENDING (this scan = D1 complete; D2–D5 PENDING) |
| `pilot-status-pdf-extractor.json` Phase 0 fields populated | PARTIALLY DONE (PO pre-populated; brownfield link PENDING) |
| No code in `domain/primitives/` or `domain/modules/` yet | CONFIRMED — both directories absent |
| No `sandbox/` directory yet | CONFIRMED — absent |
| No `dashboard/` directory yet | CONFIRMED — absent |

---

**Scan complete. 6 primitives confirmed. Module name LOCKED: `financial-reports`. G4 fence tool: `import-linter`. All Phase-1 tasks CLEAR of BCTC freeze. Phase-2 G5b BCTC rewire tasks HARD-FROZEN until 1954c clears — requires explicit PO freeze-lift signal before PM can dispatch.**
