# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

## Working Memory

### 2026-05-24 — BT-1 DONE (vn_number_normalize + reconcile_figures + select_period_column)

**Commit:** `e74abc43` | Sprint: BCTC-TABLE

**Root cause fixed:** VN number format decimal-shift. "2.840.370" was being passed directly to `float()` → 2.84 (wrong). "1.234,56" → ValueError → None. Fixed by calling `vn_number_normalize` first in the `process_report()` pipeline.

**Delivered:**
- `domain/primitives/vn_number_normalize/` — VN-format → EN-US string pre-parser
- `domain/primitives/reconcile_figures/` — "agree"|"shift"|"low" anomaly detector (mirrors mcp-server `isDecimalShiftAnomaly` formula)
- `domain/primitives/select_period_column/` — period column picker (keyword hint + position heuristic; TODO for BT-3 model hook)
- 3 new ports + 3 new mocks in financial_reports module
- `process_report()` extended with `api_bridge_revenue`, `table_cells`, `column_hint`, `column_headers` args (backward-compat — all optional)
- `sandbox/runner.py` wires 9 adapters

**Evidence:** 235 pytest PASS (186 baseline + 49 new). 9 sandbox scenarios GREEN. import-linter: 63 files, Fence-A KEPT, Fence-B KEPT, 2/0. Commit zero foreign files.

**Next:** qa BT-1 verification.

---

### 2026-05-24 — dashboard inspector button DONE

**Commit:** `9b2c3c9a`

Added `<a class="inspector-btn">` to `dashboard/index.html` header. Opens `http://localhost:3000/api/bctc-inspect` in a new tab (`target="_blank" rel="noopener"`). Styled as a green sibling to `.reload-btn`. Zero JS, zero fetch(), file:// compatible. trust-contract: 7/7 PASS. Single file in commit — no contamination.

---

### 2026-05-24 — PI-2 DONE (side-by-side PDF inspection viewer)

**Commit:** `4651c080`

**Delivered:**
- `infrastructure/inspection_store.py` — `InspectionStore(db_path, pdf_dir, extraction_dir)` with `list_docs()`, `get_pdf_bytes()`, `get_extraction()`. UUID validation on all filesystem access. Lazy pdf_path backfill via ticker-from-URL heuristic (single unambiguous match only).
- `interface/viewer.html` — SI-2 boundary comment; pdf.js CDN 4.2.67 left pane + text/table right pane; honest-degrade messages for missing PDF/extraction; `<iframe>` fallback if CDN down.
- `interface/handlers.py` — 4 new routes: `GET /inspect`, `GET /inspect/pdfs`, `GET /inspect/pdf/{doc_id}`, `GET /inspect/extraction/{doc_id}`. Signature extended to `register_routes(router, extract_usecase, inspection_store)`.
- `domain/repositories.py` — `find_all()` abstract method added to `PDFDocumentRepository`.
- `infrastructure/repositories.py` — `_ensure_schema()` migration adds nullable `pdf_path TEXT` column; `find_all()` + `set_pdf_path()` implemented.
- `main.py` — `InspectionStore` wired in `create_app()`; `PDF_DIR` env var (default `/app/data/pdfs`).
- 47 new tests (23 unit + 24 integration). Total: 161 pytest PASS.
- Import-linter: 2 fences KEPT, 0 broken. Frozen files: untouched.

**User URL:** `http://localhost:5001/inspect` (or Docker port 5001)

**Next:** qa PI-3 verification.

### 2026-05-24 — DASHBOARD FILE:// FIX DONE (false-green repair)

**Commit:** `a9fdf056`

**Defect:** `dashboard/index.html` used `fetch(entry.path)` to load trace JSONs. Under `file://` (double-click), Chrome/Safari block fetch() of local files (opaque/null origin CORS). Every card showed NOT-RUN despite all trace JSONs being present and valid on disk.

**Fix:** New `sandbox/gen_traces_js.py` reads all `dashboard/traces/<tier>/*.json` and emits `window.__TRACES = {...}` into `dashboard/traces.js`. `index.html` now loads it via `<script src="traces.js">` (not subject to file:// CORS restriction) and reads from `window.__TRACES` synchronously — no fetch(), no server required. `rerun.sh` now calls `gen_traces_js.py` after each runner.py invocation.

**Files changed:** `dashboard/index.html`, `dashboard/traces.js` (new), `sandbox/gen_traces_js.py` (new), `sandbox/rerun.sh`.

**G12 evidence:** 114 pytest PASS. Sandbox: 7 canonical PASS + service-tier NOT-RUN (honest). 6 intentional-RED known_bad fixtures unaffected. Security clause: clean.

**Next:** QA verifies double-click renders PASS badges.

---

### 2026-05-24 — P2-G5a DONE (move superseded code to _deprecated/)

**Commit:** `d339303f` | **Tag:** `pdf-extractor-pre-delete`

**Finding:** No function bodies from P1-B1/P1-B2 extraction remained in domain/services.py — the `def validate_financial_figures` and `def normalize_decimal` bodies were already fully moved to domain/primitives/ in Phase 1. Only a backward-compat re-export shim existed.

**What was moved to `_deprecated/`:**
- `domain/primitive/` (singular) — proto-scaffold `mock_echo` with zero live callers. Runner uses `domain.primitives.{name}` (plural). Moved to `_deprecated/domain_primitive_mock_echo/` with DEPRECATED header.

**Import update:** `test_financial_validation.py` updated to import directly from `domain.primitives.validate_financial_figures` (backward-compat shim dependency on `domain.services` removed).

**Evidence:** 114 pytest PASS. lint-imports: 2 KEPT 0 broken. Sandbox: 20 GREEN primitive (1 deliberate honest-RED fixture), module PASS. Zero mcp-server files touched.

**Next:** P2-G5c (qa: zero TODO.*migrat grep)

---

### 2026-05-24 — P2-J3 DONE (G10 regression repair — low_confidence_gate threshold)

**Fix commit:** `1a678571` | **Cycle count:** 1

**Defect:** `_LOW_CONF_THRESHOLD` injected as `0.1` (canonical: `0.2`) at `primitive.py:40`.
`confidence=0.15` → `0.15 < 0.1 → False` → returned `"normal"` instead of `"low_confidence"`.

**Fix:** One-literal restore `0.1 → 0.2`. Diagnosed from sandbox failing scenario only (sealed spec NOT read).

**Evidence:** 3/3 non-known_bad low_confidence_gate scenarios GREEN; 20/20 primitive tier non-known_bad GREEN; 114 pytest pass.

**G10 measurement integrity:** PRESERVED. Next: P2-K1/K2 (G11 regression alarm).

---

### 2026-05-24 — P2-A1 + P2-A2 DONE (import-linter G4 fence + CI job)

**P2-A1 commit:** `8d2b7ee9` | **P2-A2 commit:** `c6f4615b`

**Delivered:**
- `pdf-extractor-pre-ci` tag created before changes (anchor for G4 pre-revert)
- `pyproject.toml` — `[tool.importlinter]` section added:
  - root_packages: domain + infrastructure + application + interface
  - Fence-A: domain.primitives must NOT import infrastructure/application/interface
  - Fence-B: domain.modules must NOT import infrastructure/interface
  - `import-linter>=2.0` in dev deps + requirements.txt
- `.github/workflows/ci.yml` — `py-lint` job added (parallel, no needs:, ubuntu-latest, timeout 10m)
  - working-directory: apps/pdf-extractor, runs `lint-imports --config pyproject.toml`

**lint-imports clean-run result:**
- Analyzed 58 files, 77 dependencies
- Contracts: 2 kept, 0 broken — EXIT 0

**Offline evidence model:** No push (pilot binding constraint). G4 proof = lint-imports exits 0 clean
(P2-A1 evidence) + non-zero on deliberate violation (P2-A4 qa task upcoming).

**Zone exception:** `.github/workflows/ci.yml` is outside apps/pdf-extractor/ — documented as
the one allowed G4 exception per spec. All other changes in zone.

**pytest:** 114 passed — no regression.

**Next:** qa P2-A3 (verify CI green after push) + P2-A4 (deliberate-violation proof)

---

### 2026-05-24 — P2-F DONE (dashboard honesty — 6 primitive cards + 8 TRACE_PATHS)

**Commit:** `1356dcce`

**Delivered:**
- `dashboard/index.html` — 4 new primitive card HTML slots added (#section-primitives):
  `card-confidence-scorer`, `card-low-confidence-gate`, `card-ratio-computer`, `card-field-extractor`
- TRACE_PATHS expanded from 4 to 8 (6 primitive + module + service)
- Status is TRACE-DRIVEN via existing `setBadge()`/`renderTrace()` — not hardcoded

**Evidence:**
- G6: 6 primitive card IDs confirmed in HTML
- G8 honesty: known_bad_score_wrong → trace.pass=false → badge-fail RED CONFIRMED
- Final state: all 6 primitive traces honest-green (happy scenarios)
- G12 DoD: 19 real scenarios GREEN (18 primitive + 1 module)
- pytest: 114 passed

**Commit contamination note:** 3 mcp-server RAG rename files (pre-staged by another agent)
slipped into commit. Own P2-F files are correctly included. Not destructive — renames only.

**Next:** qa re-verifies G6/G8, then P2-A1 (G4 DDD fence with import-linter)

---

### 2026-05-24 — P2-B1 through P2-B4 DONE (4 new primitives, G1-full complete)

**Commits:**
- P2-B1 (confidence_scorer) → files committed via shared index in `459b6912`
- P2-B2 (low_confidence_gate) → files committed via shared index in `a1a7224a`
- P2-B3 (ratio_computer) → `74d84022`
- P2-B4 (field_extractor) → `865493a1`
- Handoff → `dc5a8415`

**Delivered:**
- 4 pure primitives: confidence_scorer, low_confidence_gate, ratio_computer, field_extractor
- 12 scenario JSONs (3 each) + 3 from Phase 1 = 18 real scenarios total
- 4 unit test files (95 total pytest tests PASS)
- G12 DoD: all primitive + module sandbox tiers GREEN

**Key contracts:**
- confidence_scorer: `score_confidence(ocr_confidence, table_count) → {pass, quality_score}`
- low_confidence_gate: `gate_confidence(confidence) → "skip"|"low_confidence"|"normal"` (0.0=skip, <0.2=low, ≥0.2=normal)
- ratio_computer: `compute_ratio(numerator, denominator, ratio_type) → Optional[float]` (div-by-zero → None)
- field_extractor: `extract_field(text, field_name) → Optional[str]` (regex BCTC patterns, READ-ONLY mcp-server archaeology)

**Freeze compliance:** ZERO mcp-server writes in all commits. Field_extractor used READ-ONLY archaeology of balanceSheetExtractor.ts and incomeStatementExtractor.ts patterns.

**Shared index race:** Multiple agents committed concurrently to main. P2-B1/B2 files landed in other agents' commits (valid — files correct). P2-B3/B4 committed atomically with only pdf-extractor files.

**Next:** P2-C — G2 re-verify: financial_reports module composes all 6 primitives via ports

---

### 2026-05-24 — P1-E1 + P1-E2 DONE (dashboard stub HTML + edit-rerun handler + G7 all sub-gates)

**P1-E1 commit:** `d449879c` | **P1-E2 commit:** `e1c78908`

**Delivered:**
- `dashboard/index.html` — 3-panel (Primitives×2, Module×1, Microservice×1), NOT-RUN defaults, SI-2 boundary comment, zero network calls, reads traces from `dashboard/traces/<tier>/`
- `sandbox/rerun.sh` — edit-rerun handler: re-triggers runner.py, writes trace JSON to `dashboard/traces/<tier>/<name>.json`
- `.gitignore` updated — `dashboard/traces/` excluded (runtime artifacts)
- G12 streak B1→C→E1 COMPLETE (3rd consecutive streak)

**G7 sub-gate evidence:**
1. env audit: CTX_ADVISOR_* vars matched TOKEN substring (benign advisor vars, not credentials). No real DB/VPS/OCR/auth material. PASS.
2. sandbox/ grep: 0 matches. PASS.
3. zero-infra import: `import domain.primitives.validate_financial_figures` → IMPORT OK. PASS.
4. edit-rerun cycle: changed expected 1.0→0.9, FAIL trace written; restored 1.0, PASS trace written. Dashboard card refreshes confirmed. PASS.

**Race note:** P1-E2 commit `e1c78908` was contaminated by concurrent pilot staging (news-fetch/mcp-server files slipped in between my diff-check and commit). My 4 files are correctly included. Other pilot's files were also validly committed within same atomic push. No history rewrite — documented here only.

**Gate evidence:**
- G12 streak #3 COMPLETE: 7/7 sandbox scenarios GREEN, 55/55 pytest PASS
- All 4 G7 sub-gates PASS

**Next:** P1-G (QA close-gate) — Owner: qa

---

### 2026-05-24 — P1-B2 + P1-C + P1-D DONE (decimal-normalizer + financial-reports module + module scenario)

**P1-B2 commit:** `561e2df1` | **P1-C commit:** `ce03ab35` | **P1-D commit:** `c847ea00`

**Delivered:**
- `domain/primitives/decimal_normalizer/` — normalize_decimal() pure function, corrects VNM/DHG decimal-shift via unit_hint="raw_micro" (×1_000_000). 3 scenarios GREEN.
- `domain/modules/financial_reports/` — FinancialReportsModule composing both primitives via Protocol ports (DI). Fence-B: 0 infra imports, 0 self cross-imports.
- `domain/modules/financial_reports/ports.py` — DecimalNormalizerPort + FinancialValidatorPort Protocols
- `domain/modules/financial_reports/mock_ports.py` — MockDecimalNormalizerPort + MockFinancialValidatorPort for tests
- `sandbox/runner.py` — extended with module-tier dispatch (run_module_scenario + _run_financial_reports_module)
- `scenarios/modules/financial_reports/multi_primitive_story.json` — multi-primitive story: raw strings → normalize → validate → confidence=1.0

**Gate evidence:**
- G12 STREAK #2 OFFICIAL: 6/6 primitive scenarios GREEN (validate_financial_figures × 3, decimal_normalizer × 3)
- Module-tier: --tier=module --scenario=multi_primitive_story.json → EXIT 0
- 55/55 pytest PASS
- BCTC freeze: zero mcp-server writes confirmed

**Runner note:** `run_scenario(path)` refactored to `run_scenario(path, tier)`. Module runner wires real primitive adapters inline (no infra). The `decimal_normalizer` alias in `__init__.py` satisfies runner convention (module_name == callable_name).

**Next:** P1-E1 (dashboard stub HTML, G12 streak #3)

---

### 2026-05-24 — P1-A1 DONE (sandbox runner + scenario dirs + composition root shrink)

Commits: `75ab2eae` (impl), `f72c465b` (handoff+signal)

**Delivered:**
- `sandbox/runner.py` — JSON-in trace-JSON-out, zero creds, stdlib only
- `sandbox/__init__.py` — package marker
- `domain/primitives/__init__.py` + `echo_identity/` — scaffold primitive for G12 DoD
- `scenarios/` — directory tree with .gitkeep placeholders + README + 3 echo_identity fixtures
- `infrastructure/startup.py:ensure_dirs(cfg)` — extracted from main.py
- `infrastructure/lifespan.py:build_lifespan(cfg)` — extracted from main.py
- `main.py` refactored: 64 logical lines (target ≤80, was 101)
- `__tests__/unit/test_sandbox_runner.py` — 5 new tests (TDD RED→GREEN)

**Gate evidence:**
- AC-5 PASS: sandbox env is empty of all credential vars
- AC-6 PASS: 0 grep matches in sandbox/ for credential strings
- G12 DoD PASS: echo_identity happy=exit 0 (GREEN), failure=exit 1 (honest RED)
- 37 pytest tests PASS (23 pre-existing + 5 sandbox runner + 9 integration)

**Next:** P1-A2 (scenario directory READMEs per-primitive)
**P1-B1 unblocked:** zero-creds gate confirmed PASS

---

### 2026-05-14 — 1908a VNM Q4 2025 low-confidence spike (c91)

**Root cause: BCTC-VAL-07 hard fail due to totalAssets positional extraction error.**

`extractSplitBlockAll` mapped sbMap["270"] to `Tài sản dài hạn khác` (957,073 triệu) instead of grand total (~53,312,371 triệu). Since `totalLiabilities (18.8M) > totalAssets (957k) * 5`, VAL-07 hard-fails → confidence_financial=0.00.

Key: the BCTC-VAL-01-POSITION guard (task 1815, 2026-05-02) would have saved VAL-01 (netRevenue > totalAssets * 30x) but VAL-07 fires independently.

**Fix needed:** add plausibility check in `extractBalanceSheet` — if `(currentAssets.total + nonCurrentAssets.total) / totalAssets > 5`, override with the sub-total sum. Option B per report 1908a.

**Reparse required after fix:** DELETE VNM Q4 2025 row, then trigger bctcReparseJob.

**Systemic:** DIG Q4 2025 has same pattern. Banking cohort arrives 2026-05-15 — fix is P1.

---

### 2026-05-11 — 1870a FPT BCTC verify FAIL

FPT PDF layout: balance sheet (pages 4-7, VND), income stmt labels only (page 8), giải trình (page 9, triệu), cash flow (page 10, VND).

Known trap: `P_NET_PROFIT = /l[ợo]i\s+nhu[ậa]n\s+sau\s+thu[ếe]/i` matches balance-sheet item 421 "Lợi nhuận sau thuế chưa phân phối". Fix: add `(?!\s+ch[ưu]a\s+ph[âa]n\s+ph[ốo]i)` negative lookahead.

Corruption note: running `bun -e` while container is alive causes SQLITE_CORRUPT. Always use `docker exec <container> bun -e` from within running container process — this is safe. The issue was the two processes sharing WAL. Recovery via alpine sqlite3 `.recover` worked.

Disk-scan only repopulates MISSING rows (cnt=0). To force reparse of an existing bad row: DELETE the row first, then trigger scan.

1870b follow-up: P_NET_PROFIT fix in `apps/mcp-server/src/domain/services/financial-reports/incomeStatementExtractor.ts`.

### 2026-05-14 — 1909a cashFlowExtractor expansion (COMPLETE)

Refactored `cashFlowExtractor.ts` to multi-layout parity with balanceSheetExtractor:

Key decisions:
- Split-block for cash flow uses item codes 01-70 (not 100-440 like balance sheet). Codes must be standalone 1-2 digit integers on their own lines or in `(20 = ...)` inline formula labels. Separator: `31/12/2025 Triệu VND` on one line.
- Drift guard fires on all 3 section totals independently (ocfSubtotals, invSubtotals, finSubtotals). Guard only fires when ≥2 non-zero subtotals present (avoids false positives on sparse data).
- E-4 legit zero: both statedTotal AND subtotalSum checked — if either is 0, guard skips. This is different from BS 1908c which only checks both>0 for the override pair.
- `computeCashFlowConfidence`: 5 key fields = operatingCF, investingCF, financingCF, netCashFlow, endingCash. Score = nonZeroCount/5. lowConfidence flag = score > 0 AND score < 0.2.
- Return type kept as `CashFlowStatement` (backward compat). Confidence exposed via separate `computeCashFlowConfidence(cf)` export.

Test fixture trap: VNM split-block fixture needs EXACTLY N codes in label block and N values in value block. Values are position-zipped to codes in sorted order. Extra values silently ignored. Miscounted → wrong semantic mapping. Always count codes and values before asserting test expectations.

SHA: 57cd4352 | Branch: worktree-agent-abcb87d17b89cec2e
22 new tests GREEN | 108 baseline BCTC tests PASS | tsc 0 errors

---

### 2026-05-19 — 1951d BCTC pipeline diagnostic (read-only)

**Task:** Diagnose why only 9 of 39 watchlist stocks have any BCTC data (Q1-2026: 0/39).

**Scope:** mcp-server source + local DB + pull-side logs. No code changes.

**Key findings (3 blockers):**

1. **PRIMARY — SSC-URL dead-end in bctcPdfPullJob:**
   `bctcPdfPullJob` queries `WHERE source_url LIKE 'http://125.212.251.27:8765/bctc-files/%'` only. 34 of 43 pending Q1-2026 queue rows have `staticfile.hsx.vn` SSC portal URLs — never touched, attempts=0, sitting idle since 2026-04-30 (19 days). The pull job runs every 30 min and downloads 0 every time.
   File: `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts:L238`

2. **SECONDARY — pdftoppm + tesseract MISSING from container:**
   Runbook says poppler-utils was added to Dockerfile 2026-04-27, but current container has neither `pdftoppm` nor `tesseract`. The 4 PDFs already pulled (GAS 17MB, EIB 13MB, DHG 8MB, FPT 2.6MB) are all image-based (not text-native). OCR cache is empty for all 4. bctcReparseJob ran 2 attempts on EIB/DHG/FPT and failed. GAS has no feedback row yet.
   File: `apps/mcp-server/Dockerfile`

3. **SECONDARY — bctcBatchSweep never ran:**
   Zero cron_job_runs records for bctcBatchSweepJob. Scheduled for 2026-04-25 09:00 UTC (Q1-2026 season). Either not registered in scheduler or recordJobRun not called.
   File: `apps/mcp-server/src/scheduler/financial-reports/bctcBatchSweepJob.ts`

**DB state:**
- financial_reports: 9 stocks (all Q4-2025, 0 Q1-2026)
- bctc_vps_queue: 43 pending (34 SSC-URL, 9 null-URL), 12 done (all Q4-2025 + 4 Q1-2026), 28 url_not_found (Q4-2025 rows that VPS never cached)
- OCR cache: 13 Q4-2025 files cached, 0 Q1-2026 files cached

**Diagnostic output:** `docs/signals/dev-pdf-extractor-1951d-pipeline-diagnostic.json`

---

### 2026-05-25 — BT-3-A DONE (TextTableExtractor + TablePushClient + ports + config)

**Commit:** `8f6d6c50` | Sprint: BCTC-TABLE

5 files: `infrastructure/text_table_extractor.py`, `infrastructure/table_push_client.py`, `domain/modules/financial_reports/ports.py` (+2 protocols), `infrastructure/config.py` (+mcp_server_url), `__tests__/unit/test_text_table_extractor.py` (20 tests).

255 pytest PASS (235 baseline + 20 new). Fence-A/B KEPT (66 files). R-5 deliberate-violation test confirmed fence is LIVE (non-false-green).

KEY INSIGHT: BCTC OCR has two layouts — code-first ("100 label value") and label-first ("A. label 100 value"). Both handled by two regex patterns in `_try_parse_code_row()`. FPT code 100 = 58,102,970,741,619 VND exact (golden anchor).

---

### 2026-05-25 — BT-3-B DONE (ExtractTablesUseCase + POST /extract-tables route + composition root)

**Commit:** `6adc6a97` | Sprint: BCTC-TABLE

4 files: `application/extract_tables_usecase.py` (CREATE), `interface/handlers.py` (MODIFY), `main.py` (MODIFY), `__tests__/unit/test_extract_tables_usecase.py` (CREATE, 10 tests).

**265 pytest PASS (255 baseline + 10 new). Fence-A/B KEPT (67 files, 112 deps, 0 broken).**

Balance-check logic (pure, in application layer):
- Code 270 = Total Assets, 300 = Total Liabilities, 400/440 = Total Equity
- Tolerance 1 VND absolute
- Returns None for non-balance-sheet sections
- FPT golden: 88,089,621,779,862 = 44,338,155,487,272 + 43,751,466,292,590 → delta=0.0, pass=True

DDD invariants maintained: application layer imports ONLY domain ports + stdlib.

**Next:** BT-3-C — wire new usecase into `process_report()` → add `structured_table_rows` + `balance_check` return keys to `FinancialReportsModule` (backward-compat).

**Remediation owner:** ops (VPS must cache SSC-URL PDFs + Dockerfile must restore poppler-utils+tesseract). Flag to po for combined decision with ops-1951d diagnostic.

---

### 2026-05-25 — BT-3-C DONE (module integration + real-FPT integration test)

**Commit:** TBD | Sprint: BCTC-TABLE

**3 files staged:** `domain/modules/financial_reports/module.py` (MODIFY), `infrastructure/text_table_extractor.py` (MODIFY — block-column layout + OCR coercion), `__tests__/integration/test_extract_tables_fpt.py` (CREATE), `pyproject.toml` (MODIFY — slow mark). Also docs: `docs/architecture/microservice/pdf-extractor/usecases.md`, `docs/architecture/microservice/pdf-extractor/infrastructure.md`.

**269 pytest PASS (265 unit + 4 integration). Fence-A/B KEPT (0 broken). Sandbox pass=true. Zero creds.**

**What was delivered:**
- `process_report()` now returns 2 additive keys: `structured_table_rows` (list|None) + `balance_check` (dict|None) when `table_assembler` optional port is wired.
- New optional params: `table_assembler: Optional[TableAssemblerPort] = None` in `__init__`; `pages: Optional[list] = None` + `statement_section: str` in `process_report()`.
- `_compute_table_balance_check()` pure helper (codes 270/300/400, 1 VND tolerance) in domain layer.
- Integration test on REAL FPT PDF (pages 4-7, Tesseract vie+eng): 171 rows, balance_pass=True.

**CRITICAL OCR LAYOUT WORK (extractor fixes needed to pass real-FPT test):**
- Added block-column detection (`_detect_block_column_layout()`) — FPT pages 4-6 render labels/codes/values in separate OCR blocks, NOT on same line.
- `_extract_block_columns()` reconstructs rows by positional zip of code list + value list.
- `_coerce_ocr_number()` fixes OCR comma artifact: "44,338.155.487.272" → "44.338.155.487.272" (Total Liabilities parse).
- Layout 4 regex for single-space label-code-value: "D. VỐN CHỦ SỞ HỮU 400 43.751.466.292.590..." (FPT page 7).
- `_parse_value_cells()` fallback: single-space split for two VN numbers joined by one space.

**FPT golden anchors verified in integration test:**
- Code 270 Total Assets: 88,089,621,779,862 VND ✓
- Code 300 Total Liabilities: 44,338,155,487,272 VND ✓ (OCR coercion applied)
- Code 400 Total Equity: 43,751,466,292,590 VND ✓
- balance_pass = True, delta = 0.0 ✓

**sandbox/runner.py: NOT MODIFIED (frozen pilot surface — architect override).**
sandbox scenario `structured_table_extraction` DEFERRED to PO decision (see handoff BT-3-C).

**NEXT:** BT-3i → dev-mcp-server (schema + push handler + inspector GET route + HTML render).

---

### 2026-05-25 — BT-5 DONE (cross-check confidence gate)

**Commit:** TBD | Sprint: BCTC-TABLE

5 files: `application/extract_tables_usecase.py` (MODIFY), `domain/repositories.py` (MODIFY — AlertPort Protocol), `infrastructure/alert_adapter.py` (CREATE), `main.py` (MODIFY), `__tests__/unit/test_extract_tables_cross_check.py` (CREATE, 6 tests).

**275 pytest PASS (269 baseline + 6 new). Fence-A/B KEPT (68 files, 119 deps, 0 broken). Zero creds.**

**What was delivered:**
- `_run_reconciliation_gate()` pure function: balance_pass=False OR reconcile_figures >10x → "cross_check_fail"
- Gate runs BEFORE push in Step 3 of `execute()` (balance_sheet only)
- `AlertPort(Protocol)` in domain/repositories.py — pure, zero infra imports
- `TelegramAlertAdapter` in infrastructure/alert_adapter.py — reads env creds, fire-and-forget, never raises
- `blocked_reason: str | None` added to execute() return (None when pass, "cross_check_fail" when blocked)
- `alert_port: Optional[AlertPort] = None` constructor param (backward-compat — existing 10 tests unaffected)

**Red→Green:** 6 failed (TypeError: unexpected keyword arg 'alert_port') → 6 passed after implementation.

**FPT golden gate:** balance_pass=True + reconcile_figures("agree") → gate PASS → push called once. Regression anchors confirmed.

**BT-5i DEFERRED:** blocked_reason in GET /api/bctc-inspect/table/{doc_id} response is mcp-server zone. Appended deferred note routing BT-5i to dev-mcp-server in handoff.

**NEXT:** BT-4 (ops/dev-mainserver-crawls deploy) → BT-4b (one-shot re-extraction) → BT-6 (qa).
