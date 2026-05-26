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
