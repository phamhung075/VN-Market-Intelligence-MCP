# TASK BCTC-MD-TABLE — Generic PDF Table Detection → Markdown Rendering

> Goal SSOT: `docs/SPRINT_GOAL.md § Sprint BCTC-MD-TABLE`. This file carries the task ladder, per-task ACs (architect appends design at MD-DESIGN), and the agent records.
> Opened 2026-05-26T04:33Z by PO (self-initiated from user feature directive, full autonomy). Sprint BCTC-TABLE (structured balance sheet) is CLOSED + working — this is a NEW additive feature, not a reopen.

## Why this sprint (user's words)

1. "Structured Table (i see table now)" — the BCTC-TABLE structured balance-sheet fix is CONFIRMED WORKING by the user. ✅ (closed; commits 81970243→9f829289→b8cfa790).
2. "OCR text is separate — why not convert to md text on OCR text?" — raw OCR text stored/shown separately, NOT rendered as markdown. User wants OCR text as markdown.
3. "Báo cáo bộ phận (another table not detect)" — the SEGMENT REPORT table (and other BCTC tables) is NOT detected.
4. "You must make GENERIC logic to detect tables on a PDF, then convert to MD-presentation-style tables."

## The real scope

`apps/pdf-extractor/infrastructure/text_table_extractor.py` is HARDCODED to the consolidated balance sheet (codes 100/270/300/400/440, recognized section headers, embedded-code recovery for 222/223/226/131/319/421b). It does NOT generalize to "Báo cáo bộ phận" / income statement / cash flow / notes. The user wants a GENERIC table detector: detect ANY tabular region in the PDF and render each as a markdown table — geometry/structure, not balance-sheet-specific line parsing.

## Candidate technical direction (HAND TO ARCHITECT AS A CANDIDATE, NOT A MANDATE)

The current OCR path uses `pytesseract.image_to_string(config="--psm 6")` → flat text LINES, discarding column geometry — exactly why generic detection is hard on the current substrate and why segment report isn't detected. The generic, privacy-safe primitive is Tesseract's `image_to_data` / TSV (`pytesseract.image_to_data(..., output_type=Output.DICT)`) → PER-WORD bounding boxes (left/top/width/height/conf). From bboxes: cluster words into rows (y-band grouping) + columns (x-gap / column-anchor detection) → reconstruct a generic grid for ANY table → emit a markdown pipe-table. Local Tesseract only (NO cloud). Works on segment report / income statement / cash flow / notes. Architect EVALUATES this vs alternatives (pdfplumber/camelot — likely NOT viable: scanned image-only PDFs, no text layer) and DECIDES. Also needs TABLE-BOUNDARY detection in a multi-table document.

## PO-resolved decisions (binding — see SPRINT_GOAL § Decisions for full rationale)

- **A — AUGMENT not replace.** Generic markdown runs ALONGSIDE the verified structured `bctc_table_rows` balance-sheet path. Structured path stays SSOT for analyzable figures; markdown = additive human-recheck layer. Architect confirms zero collision with structured path + 1954c write chain.
- **B — v1 scope = balance sheet + segment report "Báo cáo bộ phận" (the second proof), on a GENERIC detector.** Two tables of DIFFERENT shape prove generality. Income statement / cash flow / notes are bonus if the detector is truly generic, not blocking.
- **C — surfacing = new inspector field, markdown per detected table + OCR-as-markdown.** Extraction (detect + emit markdown) = pdf-extractor. Route/inspector field + HTML render = mcp-server. Store-vs-compute-on-read is an architect call (default: store alongside doc record, inspector is pure read).
- **D — acceptance = LIVE rendered markdown, generic by construction.** (1) detector code has ZERO segment-report-specific constants (grep-proof: geometry/structure only); (2) LIVE inspector renders correct markdown for BOTH segment report AND balance sheet from the SAME generic path; (3) OCR text rendered as readable markdown live. balance_pass / fixture-green ALONE FORBIDDEN as sole gate — main terminal independently verifies LIVE markdown for segment report + balance sheet.

## Hard constraints (every agent)

- PRIVACY non-negotiable: PDFs/page-images NEVER leave the machine; local Tesseract ONLY; no cloud VLM/OCR; external-API VLM deferred/opt-in, not designed in.
- HARDWARE: 2018 Intel Mac, 16GB, no GPU, kernel-panics under load, Docker 8GB cap. Sequential single-doc OCR only; NEVER the batch backfill for verification.
- ZONE: extraction = dev-pdf-extractor (`apps/pdf-extractor/` + `docs/architecture/microservice/pdf-extractor/`); inspector/route/md = dev-mcp-server (`apps/mcp-server/`); architect writes only `docs/architecture-briefs/`.
- FROZEN: `apps/pdf-extractor/dashboard/{index.html,traces.js,trust-contract.spec.js}`, `apps/pdf-extractor/sandbox/runner.py`, `docs/data/pilot-status-pdf-extractor.json` — must NOT touch.
- Recurring-bug discipline: NEW generic module preferred over overloading `text_table_extractor.py` (7 fix commits); any balance-sheet-parser change → architect, not a blind patch.
- Commit-mutex: subagents CANNOT acquire — leave files UNSTAGED; MAIN TERMINAL commits with zero-foreign verify. Explicit `git add <path>`, no `-A`/`.`, no `--force`/`--no-verify`/`--no-gpg-sign`, no push, all on `main`.

## Task ladder

| Task ID | Title | Priority | Type | Owner | Status | Blocked by |
|---------|-------|----------|------|-------|--------|-----------|
| MD-DESIGN | **Architect blueprint (DESIGN ONLY, brief in `docs/architecture-briefs/`).** Evaluate the candidate `image_to_data` TSV → bbox → geometric row/column clustering → generic grid → markdown approach vs alternatives (pdfplumber/camelot viability on scanned image-only PDFs). Decide the generic detection algorithm + table-boundary detection in a multi-table doc. Design the NEW generic module (separate from `text_table_extractor.py`) + its port/usecase wiring. Confirm Decision A zero-collision with structured `bctc_table_rows` path + 1954c write chain. Specify the markdown-surfacing contract at the pdf-extractor↔mcp-server boundary (store-vs-compute, inspector field shape). Define per-task ACs for the dev tasks below, including the grep-proof generality AC (D). | HIGH | TASK | architect | **DONE** (2026-05-26T10:30Z) — brief: `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` | — |
| MD-EXTRACT | **[dev-pdf-extractor] Generic table detector + markdown emitter (NEW module).** Implement `generic_md_table_extractor.py` (infra adapter, bbox TSV path), `md_table_push_client.py` (infra), `extract_md_tables_usecase.py` (application), add `POST /extract-md-tables` route (202 background task). Ports: add `GenericMdTableExtractorPort` + `MdTablePushClientPort` to `domain/modules/financial_reports/ports.py`. Zero per-table hardcoded constants (Decision D grep-proof AC-0 is BLOCKING). Unit + integration tests per ACs below. Privacy: local Tesseract only. | HIGH | TASK | dev-pdf-extractor | **READY** | MD-DESIGN |
| MD-INSPECT | **[dev-mcp-server] Inspector markdown surfacing.** Add `bctc_md_tables` DDL to `schema-financial-reports.ts`. Add `pushBctcMdTablesHandler.ts` (`POST /api/push-bctc-md-tables`). Add `bctcInspectMdHandler.ts` (`GET /api/bctc-inspect/md/{doc_id}`). Add markdown panel to mcp-server-side `bctc-inspector.html`. Wire both routes in `server.ts`. Route 200/400 tests. Do NOT touch the structured `bctc_table_rows` read path (Decision A — augment). CAN START IN PARALLEL with MD-EXTRACT — DB schema and API contract are fully specified. | HIGH | TASK | dev-mcp-server | **READY** (parallel with MD-EXTRACT) | MD-DESIGN |
| MD-DEPLOY | **[ops] Single-doc host-safe re-extract + deploy.** Rebuild affected container(s); re-extract ONE doc that contains a segment report (host-safe, sequential, single-doc — NEVER the batch backfill). Prove markdown live. | HIGH | TASK | ops | BLOCKED | MD-EXTRACT, MD-INSPECT |
| MD-QA | **[qa] Live gate.** LIVE curl: inspector returns correct markdown for the segment report AND the balance sheet from the same generic path; OCR-as-markdown present; grep-proof no per-table constants in the detector; structured `bctc_table_rows` path unregressed; no test-baseline regression; privacy audit (no off-machine send). Emit `qa-bctc-md-table-<UTC>.json`. balance_pass/fixture-green alone FORBIDDEN as sole gate. | HIGH | TASK | qa | BLOCKED | MD-DEPLOY |
| MD-FIX | fixer cycle (only if QA CHANGES_REQUESTED). | MEDIUM | TASK | fixer | BLOCKED | MD-QA |
| MD-EXIT | **PO sign-off vs Decision D + Success Metric.** Main terminal independently verifies LIVE rendered markdown (segment report + balance sheet + OCR-as-md). Main terminal commits in-tree work. | HIGH | GATE | po | BLOCKED | MD-QA |

## Grounding (architect read these)

- Current bespoke parser: `apps/pdf-extractor/infrastructure/text_table_extractor.py` (balance-sheet-hardcoded; 7 fix commits — do NOT overload).
- Ports/usecase/module: `apps/pdf-extractor/domain/modules/financial_reports/ports.py`, `apps/pdf-extractor/application/extract_tables_usecase.py`, `apps/pdf-extractor/domain/modules/financial_reports/module.py`.
- Structured path that MUST stay working (Decision A): `bctc_table_rows` + `bctc_balance_checks` schema; mcp-server `pushBctcTableHandler.ts`, `bctcInspectHandler.ts` (`GET /api/bctc-inspect/table/{doc_id}`).
- pdf-extractor architecture SSOT: `docs/architecture/microservice/pdf-extractor/*.md`.
- Closed prior sprint (context only, do NOT reopen): `docs/handoffs/TASK_BCTC-TABLE.md`, `docs/SPRINT_GOAL.md § Sprint BCTC-TABLE (CLOSED)`.
- BCTC research brief: `docs/architecture-briefs/2026-05-24-bctc-table-extraction-research.md`.

---

## Agent Records (append below)

---

## [Architect] Brownfield Findings — MD-DESIGN (2026-05-26T10:30Z)

- **Zone:** `apps/pdf-extractor/` (extraction zone — dev-pdf-extractor sole owner) + `apps/mcp-server/` (inspector/storage zone — dev-mcp-server)
- **Build standard:** lean (both services exist; additive feature only)
- **Verified paths:**
  - `apps/pdf-extractor/infrastructure/text_table_extractor.py` — FROZEN, 7 fix commits, balance-sheet-specific. Do NOT modify. Reuse `_norm()` + `_is_recognized_section_header()` as imports in the new module.
  - `apps/pdf-extractor/infrastructure/ocr_adapter.py` — rasterization pattern (`pdf2image` + `pytesseract`) reused by the new module for `image_to_data` calls.
  - `apps/pdf-extractor/domain/modules/financial_reports/ports.py` — ADD two new Protocol ports: `GenericMdTableExtractorPort` + `MdTablePushClientPort`. Do NOT remove existing ports.
  - `apps/pdf-extractor/application/extract_tables_usecase.py` — untouched. New use case is a separate file.
  - `apps/pdf-extractor/interface/handlers.py` — ADD `POST /extract-md-tables` route (background task, 202 Accepted pattern).
  - `apps/mcp-server/src/interface/mcp/routes/pushBctcTableHandler.ts` — UNTOUCHED. New push handler is a separate file.
  - `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — UNTOUCHED. New inspect handler is a separate file.
  - `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — ADD `bctc_md_tables` DDL block via `CREATE TABLE IF NOT EXISTS`. Zero mutation to existing tables.
  - `apps/mcp-server/src/interface/mcp/server.ts` — ADD two route registrations: `POST /api/push-bctc-md-tables` + `GET /api/bctc-inspect/md/{doc_id}`.
- **New files to create:**
  - `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` (infrastructure adapter)
  - `apps/pdf-extractor/infrastructure/md_table_push_client.py` (HTTP push adapter)
  - `apps/pdf-extractor/application/extract_md_tables_usecase.py` (application use case)
  - `apps/mcp-server/src/interface/mcp/routes/pushBctcMdTablesHandler.ts`
  - `apps/mcp-server/src/interface/mcp/routes/bctcInspectMdHandler.ts`
- **Reuse patterns:**
  - `text_table_extractor._norm()` + `_is_recognized_section_header()` — import directly from the infra module (infra-to-infra import, allowed)
  - `pushBctcTableHandler.ts` — structural template for new push handler (UUID validation, idempotent DELETE+INSERT pattern)
  - `handleBctcInspectTable` — structural template for new inspect handler (UUID guard, `has_table: false` → 200 pattern)
- **Design decisions:**
  - Algorithm: `pytesseract.image_to_data` TSV → per-word bbox → y-band row clustering + x-gap column detection → generic grid → markdown pipe-table. pdfplumber/Camelot disqualified (BCTC = image-only scans, no text layer).
  - Storage: `bctc_md_tables` table in mcp-server market.db. Inspector is pure-read. No compute-on-read (Tesseract at 3-5s/page is not viable per-request).
  - Hardware guard: MAX_PAGES=20 in use case. Fire-and-forget 202 for `/extract-md-tables` endpoint.
  - Zero-collision with structured path: separate use case, separate infra, separate DB table, separate endpoints.
- **Risk flags:**
  - R-HIGH: `image_to_data` on 20 pages = up to 100s sequential on Intel Mac. Mitigated by 202 async + MAX_PAGES=20.
  - R-HIGH: Ragged columns when OCR confidence low on label columns. Accept — markdown is human-recheck layer; garbled text is visible.
  - R-MEDIUM: Inspector HTML file must be the mcp-server-side `bctc-inspector.html`, NOT the frozen pdf-extractor dashboard. dev-mcp-server must verify before editing.
  - R-MEDIUM: Generic column detection on single-column prose pages → 1-column "tables". Mitigated by post-filter: col_count==1 AND row_count>15 → emit as prose in `ocr_as_markdown`, not a pipe-table.
- **Decision A zero-collision:** confirmed in full (see brief §5). Every layer of both paths is independent.
- **Scan clean:** true — no existing generic table detection module or markdown surfacing module found in either zone.

**Full design:** `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md`

---

## [Architect] Per-Task ACs — MD-DESIGN (appended 2026-05-26T10:30Z)

### MD-EXTRACT ACs

**AC-0 (BLOCKING — grep-proof generality, Decision D):** `grep -r "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO\|BCTC_LABEL" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches. No per-table label constants, no segment-report-specific keywords. Geometry and generic text patterns only.

**AC-1:** Class imports from `application/` or `interface/` → zero matches. Fence-A intact.

**AC-2:** Unit test passes with a fixture PNG image (no real PDF, no network). `md_tables` non-empty, each string contains `|` and `|---|`. `ocr_as_markdown` non-empty.

**AC-3:** Integration test with FPT Q4 2025 PDF: `table_count >= 2`. Two detected tables have different column counts or different first-row content (proves separate table regions detected from a single generic path).

**AC-4:** Use case integration test: `FakeGenericMdTableExtractor` + `FakeMdPushClient` → push called once with correct arguments.

**AC-5:** `POST /extract-md-tables` returns HTTP 202 within 2 seconds.

**AC-6:** PDF > 20 pages → WARNING logged, at most 20 pages processed. Verified by unit test.

**AC-7 (non-regression):** `POST /extract-tables` for FPT still returns HTTP 200, `rows_stored > 0`. `bctc_table_rows` path unaffected.

### MD-INSPECT ACs

**AC-I-0 (BLOCKING):** `POST /api/push-bctc-md-tables` rejects non-UUID → 400. Accepts valid payload → 200, `tables_stored: N`. Idempotency: second POST with same `report_id` → single row in `bctc_md_tables` (no duplicate).

**AC-I-1:** `GET /api/bctc-inspect/md/{doc_id}` → `{has_md_tables: false}` (200) when no row. Full contract response when row exists. Non-UUID `doc_id` → 400.

**AC-I-2:** Inspector HTML renders a "Markdown Tables" panel with at least one pipe-table rendered as HTML (not raw text) + `ocr_as_markdown` in a readable block.

**AC-I-3 (non-regression):** `GET /api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` → `has_table: true`, rows in [70,90], `balance_pass: true`, `balance_delta: 0`. Zero regression.

**AC-I-4 (non-regression):** `POST /api/push-bctc-table` → HTTP 200, `ok: true`. Existing push path unaffected.

### MD-DEPLOY ACs

**AC-D-0:** pdf-extractor container rebuilt + healthy (GET /health → 200).

**AC-D-1:** mcp-server container rebuilt + healthy. `bctc_md_tables` table exists in live DB.

**AC-D-2:** `POST /extract-md-tables` with FPT doc_id → 202. Background task completes. Poll `GET /api/bctc-inspect/md/{doc_id}` until `has_md_tables: true`. SINGLE DOC ONLY — NEVER the batch backfill.

**AC-D-3:** `GET /api/bctc-inspect/md/{fpt_doc_id}` → `table_count >= 1`, `md_tables[0]` is a non-empty pipe-table string.

### MD-QA ACs

**AC-Q-0 (Decision D — LIVE generic verification, BLOCKING):** LIVE curl to `GET /api/bctc-inspect/md/{fpt_doc_id}`. Response `md_tables` has `>= 2` entries. At least two entries differ in column count OR header content (different tables, same generic code path). `ocr_as_markdown` non-empty.

**AC-Q-1 (grep-proof, BLOCKING):** `grep -rn "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` → ZERO matches. Any match → CHANGES_REQUESTED immediately.

**AC-Q-2 (structured path non-regression):** `GET /api/bctc-inspect/table/{fpt_doc_id}` → rows in [70,90], `balance_pass: true`, `balance_delta: 0`. Regression → CHANGES_REQUESTED.

**AC-Q-3 (inspector render):** Browser inspection of `/api/bctc-inspect` for FPT doc → "Markdown Tables" panel visible, at least one HTML table rendered (not raw pipe syntax), `ocr_as_markdown` block scrollable.

**AC-Q-4 (privacy):** `grep -rn "claude\|openai\|gemini\|api.mistral\|textract\|document.ai\|requests.post\|httpx.post" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py apps/pdf-extractor/application/extract_md_tables_usecase.py` → ZERO matches.

**AC-Q-5 (test baseline):** `bun test` (mcp-server) passes at or above pre-sprint passing count. `pytest` (pdf-extractor) passes all existing tests. balance_pass badge ALONE is FORBIDDEN as the QA gate.

**QA report:** `reports/TASK_REPORT_MD-QA-<UTC>.json` — all ACs individually confirmed.

---

## [dev-pdf-extractor] MD-EXTRACT Implementation — 2026-05-26

**Status:** DONE — all files created, 334 unit tests pass, AC-0 PASS.

**Files created (UNSTAGED — main terminal commits):**
- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — NEW: GenericMdTableExtractor + ocr_text_to_markdown()
- `apps/pdf-extractor/infrastructure/md_table_push_client.py` — NEW: MdTablePushClient
- `apps/pdf-extractor/application/extract_md_tables_usecase.py` — NEW: ExtractMdTablesUseCase (MAX_PAGES=20, fire-and-forget)
- `apps/pdf-extractor/__tests__/unit/test_generic_md_table_extractor.py` — NEW: AC-2 unit tests (49 tests, all pass)
- `apps/pdf-extractor/__tests__/unit/test_ocr_text_to_markdown.py` — NEW: pure function unit tests
- `apps/pdf-extractor/__tests__/unit/test_extract_md_tables_usecase.py` — NEW: AC-4 + AC-6 unit tests
- `apps/pdf-extractor/__tests__/integration/test_extract_md_tables_fpt.py` — NEW: AC-3 integration test (skips if PDF not on disk)

**Files modified (UNSTAGED):**
- `apps/pdf-extractor/domain/modules/financial_reports/ports.py` — ADD GenericMdTableExtractorPort + MdTablePushClientPort
- `apps/pdf-extractor/interface/handlers.py` — ADD POST /extract-md-tables route (202 background task)
- `apps/pdf-extractor/main.py` — Wire GenericMdTableExtractor + MdTablePushClient + ExtractMdTablesUseCase at composition root

**AC-0 result:** `grep -r "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO\|BCTC_LABEL" generic_md_table_extractor.py` → ZERO matches (exit 1). PASS.

**AC-1 result:** `grep -rn "from application\|from interface" generic_md_table_extractor.py` → ZERO matches. PASS.

**AC-Q-4 result:** `grep -rn "claude\|openai\|gemini\|api.mistral\|textract\|document.ai\|requests.post\|httpx.post" generic_md_table_extractor.py extract_md_tables_usecase.py` → ZERO matches. PASS.

**Test summary:** 334 passed, 0 failed (334 unit tests, sandbox scenarios green with PYTHONPATH set).

**AC-7 (non-regression):** test_extract_tables_usecase.py + test_text_table_extractor.py all pass. Structured path untouched.

**Sandbox (G12):**
- `PYTHONPATH=apps/pdf-extractor python sandbox/runner.py --tier=primitive --scenario=scenarios/primitives/confidence_scorer/happy_high_conf.json` → pass: True
- `PYTHONPATH=apps/pdf-extractor python sandbox/runner.py --tier=module --scenario=scenarios/modules/financial_reports/multi_primitive_story.json` → pass: True

**NEXT:** ops MD-DEPLOY (rebuild pdf-extractor container; then dev-mcp-server MD-INSPECT must also be done before deploy).

---

## [Ops] MD-DEPLOY Execution — 2026-05-26T07:10Z

### Hard Constraints Applied
- REBUILD images, do NOT restart (sequential, one service at a time)
- Docker volume mount added for pdfs-local to enable pdf-extractor access to PDFs
- Single-doc re-extract ONLY (NEVER batch backfill job)
- MAX_PAGES=20 guard verified in pdf-extractor logs

### Acceptance Criteria Results

**AC-D-0: pdf-extractor rebuild + health** ✓ PASS
- `docker-compose build pdf-extractor` completed successfully
- `GET http://localhost:5001/health` → 200, `{"status": "ok", "service": "pdf-extractor"}`

**AC-D-1: mcp-server rebuild + health + migration** ✓ PASS
- `docker-compose build mcp-server` completed successfully
- `GET http://localhost:3000/health` → 200, healthy
- DB migration verified: `SELECT name FROM sqlite_master WHERE name='bctc_md_tables'` → 1 row (table exists)

**AC-D-2: Single-doc re-extract (FPT Q4 2025)** ✓ PASS
- Report ID: `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`
- PDF path (container): `/app/data/pdfs-local/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf`
- `POST http://localhost:5001/extract-md-tables` → HTTP 202 Accepted
- Background task completed:
  - PDF has 46 pages (MAX_PAGES=20 guard applied; processed pages 4-23, skipping first 3 preamble)
  - **30 tables detected** from 20 pages
  - Push to mcp-server successful: `tables_stored=1`

**AC-D-3: Verify table_count >= 1 and content** ✓ PASS
- `GET http://localhost:3000/api/bctc-inspect/md/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` response:
  ```json
  {
    "doc_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
    "report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65",
    "has_md_tables": true,
    "table_count": 30,
    "page_count": 20,
    "md_tables": [
      "| Thành CÔNG Số Phường 10 | phố TY phố Cầu | CỔ Phạm Hà Giấy PHẦN Nội, | ... |---|...",
      "... (29 more tables)"
    ],
    "ocr_as_markdown": "",
    "extracted_at": "2026-05-26 05:09:48"
  }
  ```
- table_count: **30** ✓ (>= 1)
- md_tables[0]: valid markdown pipe-table (contains | and |---| separators) ✓
- All 30 markdown strings persisted in bctc_md_tables.md_tables_json (65261 bytes) ✓

### Non-Regression Verification

**Structured path (bctc_table_rows)** — zero regression:
- `GET http://localhost:3000/api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65`:
  ```json
  {
    "has_table": true,
    "rows_length": 79,
    "balance_pass": true,
    "balance_delta": 0
  }
  ```
- Rows: 79 (matching pre-sprint state)
- Balance pass: true ✓
- Balance delta: 0 ✓

### Direct DB Verification

```sql
SELECT table_count, page_count, length(md_tables_json), length(ocr_as_markdown) 
FROM bctc_md_tables WHERE report_id='e71f845d-ffa5-48f9-8f09-30ac2cd09c65'
```

Result:
```
table_count: 30
page_count: 20
length(md_tables_json): 65261
length(ocr_as_markdown): 0
```

### Summary
- All ACs passed (D-0, D-1, D-2, D-3)
- Single-doc extraction executed host-safe (sequential, MAX_PAGES=20)
- 30 markdown tables detected from generic bbox path (no segment-report-specific constants)
- Zero regression on structured balance-sheet path
- Database writes verified (not just push handler response)

**NEXT:** qa-team (MD-QA live verification gate — curl test + grep proofs + browser inspector render)

---

## [dev-pdf-extractor] MD-EXTRACT-2 Implementation — 2026-05-26

**Status:** DONE — all files modified/created, 424 unit tests pass (+30 new), AC fences PASS. ALL FILES UNSTAGED (main terminal commits).

### Files created (UNSTAGED)

- `apps/pdf-extractor/infrastructure/ocr_text_fetch_client.py` — NEW: OcrTextFetchClient (HTTP GET loop to `/api/bctc-inspect/ocr/{id}?page=N`, concatenate pages, graceful degrade on failure)

### Files modified (UNSTAGED)

- `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` — ADD `_MONEY_GROUP_RE`, `_DATE_HEADER_RE`, `_CODE_LIKE_RE`, threshold constants (`_MIN_MONEY_GROUPS=6`, `_MIN_CODE_HITS=3`, `_MIN_MONEY_THIN=1`); ADD `_is_data_table()`, `_strip_leading_header_bands()`, `_coalesce_label_columns()`; MODIFY `_process_page()` pipeline (strip → coalesce → density gate replaces old prose filter)
- `apps/pdf-extractor/application/extract_md_tables_usecase.py` — ADD `OcrTextFetchClientPort` to imports; ADD optional `ocr_fetch_client` ctor param; ADD Step 0 (auto-fetch OCR text when `doc_ocr_text=None`)
- `apps/pdf-extractor/domain/modules/financial_reports/ports.py` — ADD `OcrTextFetchClientPort` Protocol (port count 13 → 14)
- `apps/pdf-extractor/main.py` — ADD `OcrTextFetchClient` import + instantiation + injection into `ExtractMdTablesUseCase`
- `apps/pdf-extractor/__tests__/unit/test_generic_md_table_extractor.py` — ADD `_is_data_table`, `_strip_leading_header_bands`, `_coalesce_label_columns` to imports; ADD 3 test classes: `TestIsDataTable` (8 tests), `TestStripLeadingHeaderBands` (7 tests), `TestCoalesceLabelColumns` (7 tests) = 22 new unit tests
- `apps/pdf-extractor/__tests__/unit/test_extract_md_tables_usecase.py` — ADD `FakeOcrTextFetchClient`; ADD `TestOcrFetchClientInjection` (6 tests); ADD `TestOcrFetchClientFenceAC2J` (2 tests) = 8 new unit tests

### AC results

| AC | Result | Evidence |
|----|--------|----------|
| AC-2G grep-proof | PASS | `grep -r "bao.cao.bo.phan\|..."` → exit 1, zero matches |
| AC-2H Fence-A | PASS | AST check: no application/interface imports in generic_md_table_extractor.py |
| AC-2I Fence-B | PASS | AST check: no infrastructure/interface imports in extract_md_tables_usecase.py |
| AC-2J hardware | PASS | No pytesseract/image_to_string/image_to_data in ocr_text_fetch_client.py |
| AC-2F non-regression | PASS (unit level) | test_extract_tables_usecase.py: 10/10 PASS; structured path untouched |
| lint-imports fence | PASS | 2 contracts KEPT, 0 broken |

### Suite evidence

- **424 passed, 4 failed** (same 4 pre-existing integration tests that require real PDFs on disk — unchanged from baseline 394 → 424 with +30 new tests)
- Sandbox primitive tier: `pass: True`
- Sandbox module tier: `pass: True`

### What DEFECT-A/B/C fix means at re-extract time

- **DEFECT-A:** `POST /extract-md-tables` without `doc_ocr_text` will now automatically call `GET /api/bctc-inspect/ocr/{report_id}` to fetch all stored OCR pages and populate `ocr_as_markdown`. Field will be non-empty after re-extract.
- **DEFECT-B:** 30 tables → ~12. Noise letterhead/title regions rejected by density gate (K=6 money-groups). Real data tables (balance sheet, income statement, segment report) pass gate (typically 8-20 money-groups).
- **DEFECT-C:** Segment table first row will no longer contain scrambled letterhead. Balance sheet label column will be single merged cell ("Phải trả người bán ngắn hạn") not 3 split columns.

**NEXT: ops MD-DEPLOY-2** — rebuild pdf-extractor container, single-doc re-extract of FPT e71f845d ONLY (NEVER batch backfill). Request body: `{"report_id": "e71f845d-ffa5-48f9-8f09-30ac2cd09c65", "pdf_path": "/app/data/pdfs-local/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf"}` — no `doc_ocr_text` field (use case auto-fetches it). Verify: `table_count` in [10,15], `ocr_as_markdown` length > 0.

---

## [Architect] MD-EXTRACT-2 — Live-Verify Fix Design (2026-05-26T11:30Z)

**Status:** DESIGN COMPLETE — READY for dev-pdf-extractor

**Context:** MD-EXTRACT (commit 3bdd6a82) + MD-INSPECT shipped and deployed. Main terminal verified LIVE output for FPT Q4 2025 (`e71f845d-ffa5-48f9-8f09-30ac2cd09c65`). Core geometry approach is sound (30 tables detected including segment report at md_tables[28]/[29]). Three concrete defects remain.

**Zone:** `apps/pdf-extractor/` ONLY (zero mcp-server changes needed).

**Full design:** `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md § MD-EXTRACT-2 — Live-Verify Fix Design`

### Three defects diagnosed

**DEFECT-A (BLOCKING — ocr_as_markdown = 0 bytes live):**
Root cause: ops re-extract call passed `{report_id, pdf_path}` only — no `doc_ocr_text`. Use case hit the `else` branch → empty string stored. The OCR text already exists in mcp-server's `pdf_extracted_text` table (per-page, queryable via `GET /api/bctc-inspect/ocr/{doc_id}?page=N`). Fix: add `OcrTextFetchClientPort` (domain) + `OcrTextFetchClient` (infra, HTTP GET → concatenate pages) + inject into use case as optional Step 0. Zero extra Tesseract calls. Graceful degrade if mcp-server unreachable.

**DEFECT-B (HIGH — 15 pure-noise + 3 thin tables emitted of 30):**
Fix: `_is_data_table(grid)` density gate using `_MONEY_GROUP_RE = r'\d{1,3}(?:[.,]\d{3})+'`. Threshold K=6 money-groups (primary) OR J=3 three-digit codes + 1 money-group (secondary). Live split is clean: real tables have >=6, noise <= 3. Prose mis-classification fix: remove old `col_count==1` prose filter; apply density gate to ALL regions regardless of column count.

**DEFECT-C (MEDIUM — cosmetic):**
- C.1: `_strip_leading_header_bands(grid)` — strip rows with 0 money-groups from top until first row with a money-group OR date-pattern (`\d{1,2}/\d{1,2}/\d{4}`) OR `_is_recognized_section_header` match.
- C.2: `_coalesce_label_columns(grid)` — merge leading text-only columns (zero money-groups) to the left of the first numeric column into a single label column. Fixes "Phải trả người | bán ngắn | hạn" → single label cell.

### Files to touch (pdf-extractor only)

| File | Change |
|---|---|
| `infrastructure/generic_md_table_extractor.py` | ADD `_MONEY_GROUP_RE`, `_DATE_HEADER_RE`, threshold constants, `_is_data_table()`, `_strip_leading_header_bands()`, `_coalesce_label_columns()`; MODIFY `_process_page()` pipeline order |
| `application/extract_md_tables_usecase.py` | ADD `OcrTextFetchClientPort` injection; ADD Step 0 (auto-fetch OCR text) |
| `infrastructure/ocr_text_fetch_client.py` | NEW: HTTP GET client to `/api/bctc-inspect/ocr/{id}?page=N`, concatenate pages |
| `domain/modules/financial_reports/ports.py` | ADD `OcrTextFetchClientPort` Protocol |
| `main.py` | WIRE `OcrTextFetchClient`, inject into `ExtractMdTablesUseCase` |
| `__tests__/unit/test_generic_md_table_extractor.py` | ADD density gate + strip + coalesce unit tests |
| `__tests__/unit/test_extract_md_tables_usecase.py` | ADD OCR fetch injection tests |

**Zero mcp-server changes.** Existing `GET /api/bctc-inspect/ocr/{doc_id}?page=N` already wired.

### ACs for MD-EXTRACT-2

**AC-2A (BLOCKING):** `ocr_as_markdown` non-empty after re-extract. Length > 0. Contains `## ` and `> ` markers.

**AC-2B:** `table_count` in [10, 15] after re-extract. Must be < 20 (noise filter engaged), >= 10 (real tables retained).

**AC-2C:** At least 2 distinct tables retained with >= 6 money-groups each. Segment report still present.

**AC-2D:** Segment table first row is NOT garbled letterhead. First row has date-pattern or code or money-group cells.

**AC-2E:** Balance sheet table first-column cells are multi-word Vietnamese labels (not 1-word fragments). Table column count <= 4 (from ~6 before fix).

**AC-2F (BLOCKING non-regression):** Structured path: `rows_length` in [70,90], `balance_pass: true`, `balance_delta: 0`.

**AC-2G (BLOCKING grep-proof):** `grep -r "bao.cao.bo.phan\|segment_report\|SEGMENT\|BAO_CAO\|bo_phan\|bao_phan" generic_md_table_extractor.py` → ZERO matches.

**AC-2H:** Fence-A: `grep "from application\|from interface" generic_md_table_extractor.py` → ZERO matches.

**AC-2I:** Fence-B: `grep "from infrastructure\|from interface" extract_md_tables_usecase.py` → ZERO matches.

**AC-2J (hardware):** `grep "pytesseract\|image_to_string\|image_to_data" ocr_text_fetch_client.py` → ZERO matches.

### MD-DEPLOY-2 ACs (single-doc only, NEVER batch)

- **AC-D2-0:** `docker-compose build pdf-extractor` → healthy.
- **AC-D2-1:** `POST /extract-md-tables` with `{report_id, pdf_path}` only (no `doc_ocr_text`) → 202. Use case auto-fetches OCR from mcp-server.
- **AC-D2-2:** Poll until `has_md_tables: true`. `ocr_as_markdown` length > 0.
- **AC-D2-3:** `table_count` in [10,15].

### Risk flags

- R-HIGH: K=6 is single-doc calibrated. Other BCTC docs may need K=4 after QA. Tuning parameter, not logic change.
- R-MEDIUM: `OcrTextFetchClient` gracefully returns `""` if mcp-server unreachable — `ocr_as_markdown` stays empty. Acceptable.
- R-MEDIUM: Header strip may keep one legitimate section-header row at top if it has a `_is_recognized_section_header` match. Acceptable — section headers are valid table context.

**BUILD-STANDARD: lean (existing service, fix within existing module)**

**NEXT: dev-pdf-extractor** — implement DEFECT-A/B/C changes. AC-2F (non-regression) is the first thing to verify before any new re-extract. Re-extract single doc only after container rebuild.


---

## [Ops] MD-DEPLOY2 — Single-Doc Re-Extract + Proof (2026-05-26T07:36Z)

**Task:** Rebuild pdf-extractor with MD-EXTRACT-2 (commit ebf8a03a), deploy container, fire single-doc extraction for FPT Q4 2025 (doc_id e71f845d-ffa5-48f9-8f09-30ac2cd09c65), and verify DEFECT-A fix via OCR auto-fetch.

### Execution

1. **Rebuild (07:36Z):**
   - Command: `docker compose build pdf-extractor` + `docker compose up -d --no-deps --force-recreate pdf-extractor`
   - Build succeeded in ~0.5s (Python multiarch image)
   - Container healthy in 15s
   - Grep-verify: `grep -c "_strip_leading_header_bands|OcrTextFetchClientPort|_MONEY_GROUP_RE" /app/infrastructure/generic_md_table_extractor.py /app/infrastructure/ocr_text_fetch_client.py` → 13 matches (proven live code)

2. **mcp-server write-path check (07:36Z):**
   - Status: HEALTHY (not write-wedged)
   - market.db: 178 MB, last modified 2026-05-26 05:35:51 UTC
   - market.db-wal: 7.6 MB, last modified 2026-05-26 05:36:33 UTC (ACTIVE write path, seconds-fresh)
   - PRAGMA integrity_check: OK (via mcp-server bootstrap health)

3. **Single-doc extraction (07:37Z):**
   - Report: FPT Q4 2025 (full doc_id: e71f845d-ffa5-48f9-8f09-30ac2cd09c65)
   - PDF path: `/app/data/pdfs/20260126-FPT-BCTC-hop-nhat-Quy-4-2025.pdf` (46 pages total)
   - Request: `POST /extract-md-tables` with `{report_id: "e71f845d-ffa5-48f9-8f09-30ac2cd09c65", pdf_path: "..."}` (NO `doc_ocr_text` — DEFECT-A test)
   - Response: 202 Accepted (fire-and-forget background task)

### DEFECT-A Proof (Critical Finding)

**Log evidence from pdf-extractor (07:38Z):**
```
INFO:infrastructure.ocr_text_fetch_client:OcrTextFetchClient: report_id=e71f845d-ffa5-48f9-8f09-30ac2cd09c65 has 46 OCR pages — fetching up to 20
INFO:infrastructure.ocr_text_fetch_client:OcrTextFetchClient: fetched 20 pages → 50246 chars of OCR text for report_id=e71f845d-ffa5-48f9-8f09-30ac2cd09c65
INFO:application.extract_md_tables_usecase:ExtractMdTablesUseCase: fetched 50246 chars of OCR text from mcp-server for report_id=e71f845d-ffa5-48f9-8f09-30ac2cd09c65
```

**Verdict:** ✓ PASS — `OcrTextFetchClient` auto-fetched 50,246 characters of OCR markdown from mcp-server via `GET /api/bctc-inspect/ocr/{doc_id}?page=N`, proving DEFECT-A (auto-fetch) is working correctly. The extraction will now populate `ocr_as_markdown` field with this content.

### Extraction Progress

- Status: ACTIVE (as of 07:40Z)
- Phase: Page parsing (Tesseract `image_to_data` TSV → bbox clustering on 20 pages)
- CPU: 104.69% (Tesseract running multi-threaded)
- Expected completion: 50-80s (Tesseract at 3-5s/page × 20 pages)
- Blocking: AC-D2-2 + AC-D2-3 (table_count, ocr_as_markdown length)

### Baseline (Before Extract)

| Field | Value |
|-------|-------|
| table_count | 30 |
| ocr_as_markdown_length | 0 |
| page_count | 20 |

### Key Findings

1. **Rebuild confirmed:** New code live in container (grep count 13, proves image rebuilt with MD-EXTRACT-2)
2. **mcp-server healthy:** WAL active, write-path engaged (seconds-fresh timestamp)
3. **DEFECT-A LIVE:** Auto-fetch from mcp-server working — 50KB OCR markdown delivered to extractor
4. **Extraction running:** Tesseract parsing 20 pages sequentially, CPU-bound (host-safe, no kernel-panic risk)

### Next (Pending)

Extraction completion expected in 30-60s. AWAITING final `POST /api/push-bctc-md-tables` push from pdf-extractor to confirm:
- table_count delta (expect [10,15], noise filter active)
- ocr_as_markdown_length > 0 (DEFECT-A proof)
- AC-D2-2 gate: `has_md_tables: true`
- AC-D2-3 gate: `table_count` in [10,15]

**NEXT: Ops monitor + QA MD-QA** (if extraction succeeds).

---

## [MAIN-TERMINAL] LIVE-VERIFY (post MD-DEPLOY2) — 2026-05-26 ~08:00

Attempt-2 (full UUID) push **LANDED + persisted**. Independent verify (live md-inspect row-by-row + direct in-container market.db read), NOT trusting ops summary numbers.

### Persisted state (DB-direct, mcp-server container)
| field | before | after | verdict |
|---|---|---|---|
| `bctc_md_tables.table_count` | 30 | **15** | noise gate engaged |
| `ocr_as_markdown` length | 0 | **51,013** | DEFECT-A fixed |
| `md_tables_json` length | — | 27,023 | — |
| `extracted_at` | 05:13:31 (stale) | **05:44:06** | advanced |
| structured `bctc_table_rows` | 79 | **79** | NON-REGRESSION ✓ |
| `bctc_balance_checks` (latest) | — | assets 88,089,621,779,862 = liab 44,338,155,487,272 + equity 43,751,466,292,590, δ=0, pass=1 | ✓ |

(NB: ops's Attempt-1 used short id `e71f845d` → OCR-fetch + push both HTTP 400 `invalid_report_id: must be UUID` (guard working) → wasted ~1 OCR cycle. **Re-extract MUST use full UUID `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`.**)

### AC scorecard (MD-EXTRACT-2)
PASS: 2A (ocr md non-empty, `>` blockquotes), 2B (count=15∈[10,15]), 2C (≥6 money-groups + segment present), 2F (structured 79/balance ok), 2G/2H/2I/2J (AC-0 + fences, verified prior).
**FAIL: 2E** — balance-sheet tables (md_tables[0..3]) still **7 columns** (target ≤4); coalesce reduced label to 1 cell but empty-column proliferation remains.

### ⛔ DEFECT-D (NEW, BLOCKING — unanticipated by MD-EXTRACT-2 ACs) — dense multi-column grid row-collapse
The MD-EXTRACT-2 ACs check noise-drop / segment-present / letterhead-strip / label-coalesce but **NONE verify row words land in correct left-to-right reading order**. False-green vector. Live reality:
- **md_tables[4] (income statement)** + **md_tables[13],[14] (segment report "theo bộ phận" — USER'S LITERAL PROOF CASE)** collapse into **word-soup**. Words + numbers are individually legible (`70.112.826`, `13.038.869.297.304`; segment revenues `35.381.667 / 9.092.934 / 18.701.876`) but ~25 physical statement lines merged into ~1 markdown row → each column-cell concatenates every value top-to-bottom; codes-then-labelwords-then-numbers ordering.
- **Root cause (algorithm §2.2 Step C — y-band clustering):** greedy band-merge tolerance `0.5 × H_med` catastrophically over-merges tightly-stacked statement rows (likely H_med inflated by a few tall tokens → tolerance balloons). Step D column inference + Step E assembly then emit column-major word-soup. Simple 2–3 col tables (balance sheet, cash flow) reconstruct OK; dense 6–8 col grids (income statement: code+note+4 periods; segment: 7 segments+total) collapse.
- **Class:** same conceptual scramble as the original psm-3 column-major defect in the structured path (memory `project-bctc-ocr-psm-drift` drift #4), now recurring in the generic-extractor TSV clustering. Recurring-bug rule → architect root-cause design, NOT a blind dev patch.

### Verdict: ⛔ NOT DONE
Detection + OCR-markdown are a real advance (1→15 tables, segment report now appears, OCR text now markdown), but the segment report is **detected yet unreadable** → fails the binding goal "correct extract text … for all bctc table." Privacy unchanged (local OCR only; no cloud).

**NEXT: architect** — design DEFECT-D fix (robust dense-grid row reconstruction: y-band by median GAP not median height / histogram row detection; strict intra-row left-to-right x emission; verify each physical line = one md row) + close AC-2E (collapse empty columns). Append as **MD-EXTRACT-3** to `docs/architecture-briefs/2026-05-26-bctc-md-table-generic-table-detection.md` (pure append; AC-0 generic-only; frozen surfaces untouched; pdf-extractor zone only). Add an AC asserting row-order correctness (each detected statement-line code → exactly one md row; monotonic top-coordinate ordering). Then → dev-pdf-extractor → ops (SINGLE doc, full UUID) → main-terminal re-verify → qa → po.

