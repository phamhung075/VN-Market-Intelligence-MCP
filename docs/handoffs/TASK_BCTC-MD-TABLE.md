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
| MD-DESIGN | **Architect blueprint (DESIGN ONLY, brief in `docs/architecture-briefs/`).** Evaluate the candidate `image_to_data` TSV → bbox → geometric row/column clustering → generic grid → markdown approach vs alternatives (pdfplumber/camelot viability on scanned image-only PDFs). Decide the generic detection algorithm + table-boundary detection in a multi-table doc. Design the NEW generic module (separate from `text_table_extractor.py`) + its port/usecase wiring. Confirm Decision A zero-collision with structured `bctc_table_rows` path + 1954c write chain. Specify the markdown-surfacing contract at the pdf-extractor↔mcp-server boundary (store-vs-compute, inspector field shape). Define per-task ACs for the dev tasks below, including the grep-proof generality AC (D). | HIGH | TASK | architect | **READY (dispatch NEXT)** | — |
| MD-EXTRACT | **[dev-pdf-extractor] Generic table detector + markdown emitter (NEW module).** Implement the architect-chosen generic detector (bbox/TSV geometric clustering or chosen alternative) in a NEW module under `apps/pdf-extractor/` — NOT a patch to `text_table_extractor.py`. Detect ANY tabular region + table boundaries; emit a markdown pipe-table per detected table; render raw OCR text as markdown. Zero per-table hardcoded constants. Unit tests on fixture + sandbox green. Privacy: local Tesseract only. | HIGH | TASK | dev-pdf-extractor | BLOCKED | MD-DESIGN |
| MD-INSPECT | **[dev-mcp-server] Inspector markdown surfacing.** Add the inspector field/section returning markdown per detected table + OCR-as-markdown per architect's contract; HTML render in the inspector. Route 200/400 tests. Do NOT touch the structured `bctc_table_rows` read path (Decision A — augment). | HIGH | TASK | dev-mcp-server | BLOCKED | MD-DESIGN, MD-EXTRACT |
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
