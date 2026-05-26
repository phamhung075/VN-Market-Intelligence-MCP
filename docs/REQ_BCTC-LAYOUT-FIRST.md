# REQ_BCTC-LAYOUT-FIRST — Document-Structure-First BCTC Extraction + Geometric Zone Review Overlay

**Sprint:** BCTC-LAYOUT-FIRST | **BA Agent:** ba | **Created:** 2026-05-26T18:30Z
**Source vision:** `docs/SPRINT_GOAL.md § Sprint BCTC-LAYOUT-FIRST`
**Handoff doc:** `docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md`
**Gate:** PO must approve this spec BEFORE architect begins LF-DESIGN. Architect is BLOCKED until PO approval is received.

---

## Purpose

Decompose the two converged deliverables of Sprint BCTC-LAYOUT-FIRST into atomic, testable requirements with DDD layer mapping. No architecture proposals. No solutioning. Pure scope-pinning, acceptance-criteria anchoring, and blocker identification.

Root-cause anchor encoded as a named requirement below (REQ-LF-1 / schema inheritance). Every requirement carries its DDD layer so the architect can assign boundaries without re-deriving scope.

---

## Deliverable 1 — LAYOUT-FIRST / DOCUMENT-STRUCTURE-FIRST Extraction (4-Tier Pipeline)

### REQ-LF-0 — AC-0 Generic-by-Construction (Hard Invariant — Applies to All Tiers)

**DDD Layer:** Domain (structural detection rules)
**Priority:** CRITICAL — this is a named constraint baked into the sprint's success metric

#### Goal statement

The table-detection and zone-detection logic in `generic_md_table_extractor.py` must be provably generic: it uses GEOMETRY as the spine and carries ZERO hardcoded BCTC semantics (no hardcoded Vietnamese statement labels, no per-table magic codes, no recognition of specific BCTC section names inside the grid or zone logic). Vietnamese title anchors (BẢNG CÂN ĐỐI, LƯU CHUYỂN TIỀN TỆ, "(tiếp theo)") may only appear as tie-breaker hints fed to geometry-first grouping — they must NOT be primary classifiers or decision-makers in the zone/grid pipeline.

#### Testable acceptance criteria

- [ ] **AC-0a (grep-proof):** `grep -rn "BẢNG CÂN ĐỐI\|LƯU CHUYỂN\|NGUỒN VỐN\|Mã số\|Thuyết minh" apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` returns ZERO matches in any code path that makes a zone boundary or column-grid decision. Matches only permitted in comment blocks that explain why anchors are hints.
- [ ] **AC-0b (corpus breadth):** The Tier-3 pass-rate is measured across ALL 18 docs in the validation corpus — not on one doc. A result that passes on FPT Q4 2025 only is NOT accepted as green.
- [ ] **AC-0c (structured path untouched):** `git diff HEAD -- apps/pdf-extractor/infrastructure/text_table_extractor.py` produces zero output (0-byte-diff). The `bctc_table_rows` structured path is the SSOT for analyzable figures and MUST NOT be modified by this sprint.

---

### REQ-LF-1 — Tier 0: Document Map with Geometric-Spine Grouping (ROOT-CAUSE ANCHOR)

**DDD Layer:** Domain (document-map logic) + Infrastructure (PDF text and projection-profile read)
**Priority:** CRITICAL — directly fixes the FPT Q1 2026 page-5 scramble

#### Goal statement

This requirement IS the named root-cause fix. FPT Q1 2026 page 5 (NGUỒN VỐN / liabilities) is the ONLY balance-sheet page in that document with no OCR column header ("Mã số / Thuyết minh / Số cuối / Số đầu" appears on pages 3, 4, and 6 but NOT page 5). The current engine OCRs pages independently and guesses columns by clustering number-token x-positions — on page 5 it has no anchor and scrambles. The fix is NOT better column guessing on isolated pages. The fix is recognizing that pages 3-6 form ONE logical unit BEFORE OCR begins, so page 5 inherits the column schema established on page 3.

Tier 0 scans ALL pages of a document and groups consecutive pages into LOGICAL UNITS. The continuity test uses the GEOMETRIC column-fingerprint as the spine: same gutter count + x-positions within tolerance + no fresh title band interruption + matching row pitch. Title anchors are hints and tie-breakers only. The output is a document-map JSON.

Tier 0 must stay CHEAP: it reuses the per-page OCR text already stored in `pdf_extracted_text` for title scanning + a low-DPI projection-profile fingerprint for geometry. NO new heavy OCR is triggered in this tier.

#### Testable acceptance criteria

- [ ] **REQ-LF-1a (document-map JSON emitted):** For any processed report, `generic_md_table_extractor.py` emits a structured document-map JSON with at minimum: `{page_number, page_type: "table|prose|blank", unit_id, is_schema_page, column_fingerprint: {gutter_count, gutter_x_positions, row_pitch}}` per page.
- [ ] **REQ-LF-1b (FPT Q1 page 5 grouped correctly):** For report_id `e8ea3df5-3f32-413d-a3eb-c71634c0438d` (FPT Q1 2026), pages 3, 4, 5, and 6 appear in the SAME logical unit in the document-map. Page 5 must be tagged `table` and assigned to the same `unit_id` as pages 3, 4, and 6. Verified via direct inspection of the document-map JSON.
- [ ] **REQ-LF-1c (page-gap tolerance):** The document-map groups pages correctly even when intermediate pages produce no OCR text (the FPT Q1 doc has gaps at pages 11-15 and 17-22). A page gap does NOT break the logical-unit grouping of surrounding table pages when their geometric fingerprints match.
- [ ] **REQ-LF-1d (anchor-as-hint verified):** For FPT Q1 2026 page 41 (a notes prose page that contains references to BẢNG CÂN ĐỐI, KẾT QUẢ, LƯU CHUYỂN, and THUYẾT MINH simultaneously), the document-map assigns page 41 to a `prose` or `blank` unit — NOT to the same unit as the balance-sheet table pages. This proves anchors are NOT the spine.
- [ ] **REQ-LF-1e (Tier-0 cheap — no new heavy OCR):** A profiling check confirms that processing a document through Tier 0 does not trigger any new Tesseract `image_to_data` or full-page OCR call. Tier 0 reads only the already-stored `pdf_extracted_text` rows plus a low-DPI projection raster. No per-page OCR is triggered until Tier 2.

---

### REQ-LF-2 — Tier 1: Per-Page Layout Zoning with Schema Inheritance

**DDD Layer:** Domain (page layout classification) + Infrastructure (projection-profile rendering)
**Priority:** HIGH — the direct mechanism of the root-cause fix

#### Goal statement

For each page in a logical unit, Tier 1 decomposes the page into zones: title band, value-column gutters, row bands, and footer. For continuation pages (any page in a logical unit that is NOT the schema-page), the column schema (gutter x-positions, column count) is INHERITED from the unit's schema-page. Continuation pages do NOT run an independent column-detection pass. This is the architectural mechanism that prevents the page-5 scramble.

#### Testable acceptance criteria

- [ ] **REQ-LF-2a (schema-page identified per unit):** For each logical unit, exactly one page is designated the schema-page. For FPT Q1 2026 balance-sheet unit (pages 3-6), page 3 (which carries the column header) must be the schema-page.
- [ ] **REQ-LF-2b (schema inheritance on continuation pages):** For FPT Q1 2026 page 5, the column-grid applied during OCR (Tier 2) matches the column-grid derived from page 3 — not a grid derived from page 5 itself. Verifiable by logging or a unit test that injects a known schema-page grid and confirms page 5 uses it.
- [ ] **REQ-LF-2c (per-page zone tags emitted):** Each page's zone output includes: `title_band_y_range`, `column_gutters: [{x_min, x_max}]`, `row_bands: [{y_min, y_max}]`, `footer_y_range`. These are used by Tier 2 for cell OCR.
- [ ] **REQ-LF-2d (page-type tagging):** Every page is tagged as `table`, `prose`, or `blank`. Prose pages receive no column-zone output (no meaningless column decomposition of running text). Blank pages are skipped in Tier 2.

---

### REQ-LF-3 — Tier 2: OCR Into the Known Grid + Cross-Page Stitch

**DDD Layer:** Application (OCR orchestration, cross-page stitch logic) + Infrastructure (Tesseract cell OCR)
**Priority:** HIGH

#### Goal statement

Tier 2 OCRs each cell of each table page by rendering the cell region (as defined by Tier 1's column-grid and row-band output) and running Tesseract on that region. This is heavy OCR and runs ONCE per page per unit. For a logical unit spanning multiple pages, Tier 2 stitches all pages into ONE markdown pipe-table: the header row is emitted exactly once (from the schema-page), and data rows from all subsequent pages are appended in reading order by `(page_number, Y-band)`. For prose units, text is concatenated across page breaks without an artificial table boundary.

OCR is executed sequentially, one document at a time. No concurrent heavy extraction is permitted.

#### Testable acceptance criteria

- [ ] **REQ-LF-3a (one markdown table per logical unit):** For FPT Q1 2026 balance-sheet unit (pages 3-6), the stitch output is ONE markdown pipe-table, not four separate tables. The table header appears once. Data rows from pages 3, 4, 5, and 6 appear in reading order.
- [ ] **REQ-LF-3b (header emitted once):** The column header line ("| Mã số | Thuyết minh | Số cuối kỳ | Số đầu kỳ |" or similar) appears exactly once at the top of the stitched table — not repeated at each page boundary.
- [ ] **REQ-LF-3c (NGUỒN VỐN rows present):** After the stitch, the NGUỒN VỐN section (page 5, FPT Q1 2026) must be present in the merged table with correct column alignment — not scrambled. At minimum, the liabilities total row (code 300) must appear with a numeric value in the correct value column.
- [ ] **REQ-LF-3d (sequential OCR only):** There is no concurrent Tesseract call path. Processing multiple documents requires sequential dispatch. The batch-sweep job (`run_bctc_batch_sweep`) is NOT invoked by this pipeline. The re-extraction path dispatches one document at a time.
- [ ] **REQ-LF-3e (local tools only):** `grep -rn "openai\|anthropic\|google\|textract\|document.ai\|cloud.vision\|gemini\|gpt" apps/pdf-extractor/` returns zero matches in any OCR or extraction code path. PIL, OpenCV, and Tesseract are the only permitted processing tools. Heavy local CV models (PP-Structure, Table-Transformer, img2table) are acceptable only as fully-local fallback, not as the default path.

---

### REQ-LF-4 — Tier 3: Per-Unit Invariant Gate (Machine-Checkable)

**DDD Layer:** Domain (invariant rules) + Application (gate orchestration)
**Priority:** CRITICAL — this is the anti-false-green mechanism and the primary done-bar arbiter

#### Goal statement

After stitching, each logical unit is run through a machine-checkable invariant gate before its output is stored. Units that fail any invariant are quarantined (stored with a `quarantined: true` flag) — they do NOT block the pipeline but are excluded from the pass-rate count. The gate produces a measurable pass-rate across the 18-doc corpus. The success metric of the sprint is this pass-rate verified via DIRECT market.db query — the `/api/bctc-inspect` endpoint is explicitly NOT the arbiter because it may be stale.

Three invariants must ALL pass for a unit to be marked passing:

1. **Balance identity across the stitch:** for balance-sheet units, the accounting identity must hold using figures extracted from rows potentially spread across multiple pages. For example, if total assets (code 270) appears on page 4 and the subtotal components are on pages 3 and 4, the sum must reconcile.
2. **Codes monotonic:** numeric codes within a logical unit must appear in monotonically non-decreasing order across the page boundary. A code-order inversion (e.g. code 400 appearing before code 300 in a balance-sheet unit) flags a stitch error.
3. **Every data row has a label and at least one value:** no orphan rows (label present, all value columns empty) or junk rows (code absent, label absent) are stored as passing data.

#### Testable acceptance criteria

- [ ] **REQ-LF-4a (balance identity gate):** For FPT Q4 2025 balance-sheet unit (report_id `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`), the gate confirms: total assets (code 270) = total liabilities (code 300) + total equity (code 400). Delta must be exactly 0. This must hold in the STITCHED output even if asset rows and liability rows come from different pages.
- [ ] **REQ-LF-4b (codes monotonic check):** For any balance-sheet unit, if the extracted code sequence contains a decrease (code N+1 < code N after excluding structural subtotals), the unit is quarantined. The gate emits the first violating (code_before, code_after, page_boundary) triplet for diagnosis.
- [ ] **REQ-LF-4c (no orphan rows gate):** For every stitched unit, zero rows with `label=null OR label=""` AND `all value columns null` are stored as non-quarantined rows.
- [ ] **REQ-LF-4d (quarantine path exists):** A unit that fails any invariant is stored with `quarantined: true` in market.db and is counted separately in the pass-rate report. It does NOT block the pipeline from processing subsequent pages or documents.
- [ ] **REQ-LF-4e (DIRECT market.db arbitration):** The pass-rate is verified via `docker compose exec -T mcp-server bun -e` with `require("bun:sqlite")` — not via the `/api/bctc-inspect` endpoint. The QA agent must NOT use the endpoint as the sole truth gate.
- [ ] **REQ-LF-4f (corpus pass-rate measured):** The gate produces a report with: total units processed, units passing all three invariants, units quarantined, quarantine reasons by invariant. Minimum measurable output — a "pass-rate=N/M" summary — must be emitted per QA run.

---

### REQ-LF-5 — Structured Path Non-Regression (Decision B)

**DDD Layer:** Infrastructure (existing structured extraction path)
**Priority:** CRITICAL — regression here breaks the financial-analysis pipeline

#### Goal statement

The structured `bctc_table_rows` path produced by `text_table_extractor.py` feeds the financial-analysis pipeline (downstream consumers of extractable figures: net revenue, gross profit, total assets, equity). This path is closed, proven, and must not be touched by this sprint. Any extraction commit that touches `text_table_extractor.py` is a blocking violation.

The 1954c consolidated write chain (sole BCTC write-owner via `mcp-server`) must remain unaffected. The new Tier 0-3 pipeline is an augment: it adds a separate markdown-presentation layer alongside the structured path.

#### Testable acceptance criteria

- [ ] **REQ-LF-5a (0-byte-diff):** `git diff HEAD -- apps/pdf-extractor/infrastructure/text_table_extractor.py` produces zero output at LF-QA time.
- [ ] **REQ-LF-5b (balance check non-regression):** `balance_pass=true` for FPT Q4 2025 (report_id `e71f845d-ffa5-48f9-8f09-30ac2cd09c65`) in `bctc_table_rows` remains true after the new pipeline is deployed. Verified via direct market.db query.
- [ ] **REQ-LF-5c (write-chain non-collision):** No new write path from the Tier 0-3 pipeline writes to the `bctc_table_rows` table. The markdown output must be stored in a SEPARATE table or column (architect decides the schema). The two write paths must not overwrite each other.

---

### REQ-LF-6 — Privacy and Host Constraints (Non-Negotiable Hard Constraints)

**DDD Layer:** Infrastructure (tool selection policy) + Application (execution mode)
**Priority:** CRITICAL — non-negotiable; violation is a blocking defect

#### Goal statement

Financial PDFs and page images MUST NEVER leave the local machine. No extraction step sends any PDF, page image, OCR-derived text, or any derivative to any third-party API including cloud OCR, cloud VLM, hosted LLM, or any remote endpoint outside the local Docker network. The OCR toolchain is PIL/OpenCV/Tesseract (local). Heavy local CV models (PP-Structure, Table-Transformer, img2table) are acceptable as a fully-local fallback. No GPU is available. The host is a 2018 Intel Mac with 16GB RAM, Docker capped at 8GB, and a history of kernel panics under swap exhaustion — sequential single-doc processing is mandatory.

#### Testable acceptance criteria

- [ ] **REQ-LF-6a (no external API calls):** `grep -rn "requests.post\|httpx\|aiohttp\|urllib" apps/pdf-extractor/` reviewed for any call whose URL is not `localhost` or an in-Docker hostname. Zero external endpoint calls in the extraction path.
- [ ] **REQ-LF-6b (sequential re-extract):** The re-extraction step in LF-DEPLOY processes exactly ONE document at a time. No parallel extraction jobs. No invocation of `run_bctc_batch_sweep`.
- [ ] **REQ-LF-6c (tool inventory audit):** The architecture brief (LF-DESIGN) and QA report (LF-QA) each explicitly list every OCR/CV tool invoked in the pipeline with confirmation that each is local only.

---

## Deliverable 2 — Geometric Zone Review Overlay on /api/bctc-inspect

This deliverable SPANS TWO SERVICES. Acceptance criteria are split at the pdf-extractor↔mcp-server service boundary. Architect MUST design the JSON contract at this boundary before either dev agent starts.

### REQ-LF-7 — pdf-extractor Zone: Zone-Geometry JSON Emission

**DDD Layer:** Infrastructure (zone-geometry output, storage) + Application (zone computation trigger)
**Owner zone:** `apps/pdf-extractor/` (dev-pdf-extractor, sole owner)
**Priority:** HIGH

#### Goal statement

As a byproduct of the Tier 1 page-layout zoning pass (REQ-LF-2), the pdf-extractor emits a structured zone-geometry JSON for each processed page. This JSON describes the DETECTED GEOMETRIC ZONES: column gutter positions, row-band boundaries, header band, footer band, and logical-unit boundary markers. The JSON is stored in market.db alongside the document record so the mcp-server inspector can read it as a pure read without re-triggering extraction. The default storage approach is store-alongside-the-doc-record — whether this is a new column, a new table, or a JSON blob in an existing column is an architect decision (Decision E).

#### Testable acceptance criteria

- [ ] **REQ-LF-7a (JSON schema coverage):** The zone-geometry JSON for each page includes at minimum: `{report_id, page_number, column_gutters: [{x_min, x_max}], row_bands: [{y_min, y_max, label}], header_band: {y_min, y_max}, footer_band: {y_min, y_max}, unit_id, is_continuation_page}`.
- [ ] **REQ-LF-7b (stored in market.db):** After extraction, zone-geometry data for a processed doc is queryable from market.db without re-running extraction. Direct query via `docker compose exec -T mcp-server bun -e` returns zone-geometry rows for the processed report.
- [ ] **REQ-LF-7c (AC-0 inherited):** The zone-geometry JSON contains no hardcoded BCTC semantic labels. Column labels in the JSON (if any) are positional indices or geometric descriptors ("col_0", "col_1", etc.) — not "Mã số", "Thuyết minh". Anchors may appear only in the `unit_hints` metadata field, tagged as hints.
- [ ] **REQ-LF-7d (emitted from the SAME generic pipeline):** The zone-geometry JSON is produced by the same Tier 1 code path that produces the column-grid used for OCR. There is no separate "zone computation for the overlay only" code path. Proof: the column gutters in the overlay JSON match the column gutters used to OCR that page's cells.

---

### REQ-LF-8 — mcp-server Zone: Zone-Overlay Toggle on /api/bctc-inspect

**DDD Layer:** Interface (HTTP handler, HTML render) + Infrastructure (market.db zone-geometry read)
**Owner zone:** `apps/mcp-server/` (dev-mcp-server, sole market.db write-owner)
**Target file:** `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`
**Priority:** HIGH

#### Goal statement

The `/api/bctc-inspect` page gains an ON/OFF toggle layer that renders the detected geometric zones overlaid on the page image. The purpose is to let the user validate GEOMETRY (easy) before trusting OCR text (hard) — this is the antidote to the false-green cycle (5 prior false-greens). The mcp-server reads the zone-geometry JSON from market.db (stored by pdf-extractor per REQ-LF-7) and renders the overlay. The mcp-server does NOT re-run extraction. Toggle state is client-side only (no server-side session needed).

The overlay must visually distinguish: column gutters, row bands, header/footer bands, and logical-unit boundaries (e.g. a differently coloured overlay line between the end of one unit and the start of the next page's unit).

#### Testable acceptance criteria

- [ ] **REQ-LF-8a (toggle present and functional):** `GET http://localhost:3000/api/bctc-inspect` (or the specific doc URL) returns HTML with a visible ON/OFF toggle control. Clicking ON renders coloured overlay zones on the page image. Clicking OFF removes them. Toggle state persists across page scroll within the same inspector session.
- [ ] **REQ-LF-8b (zone types visually distinct):** The overlay distinguishes at minimum two zone types visually (e.g. different colours or border styles for column gutters vs row bands). The user can tell which zone type is which.
- [ ] **REQ-LF-8c (pure read — no extraction):** The inspector with overlay does NOT trigger any pdf-extractor call or OCR job. It reads zone-geometry from market.db only. Verified by confirming no HTTP call is made to the pdf-extractor service when the overlay is toggled.
- [ ] **REQ-LF-8d (bctcInspectHandler.ts is the target):** The overlay rendering is implemented in or wired through `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`. No new route file is created without architect justification.
- [ ] **REQ-LF-8e (structured path read path unaffected):** The `bctc_table_rows` read path in `bctcInspectHandler.ts` (balance badge, structured table display) continues to return correct data after the overlay feature is added. Balance badge and structured rows are non-regressed.
- [ ] **REQ-LF-8f (service boundary enforced):** The mcp-server does NOT import any pdf-extractor Python module or call pdf-extractor business logic directly. The ONLY coupling is reading the zone-geometry JSON from market.db. Any compute needed to transform zone coordinates for rendering is done in the mcp-server layer.

---

## Validation Corpus (Binding)

The following 18 documents are already OCR'd in `market.db`.`pdf_extracted_text` and form the mandatory validation corpus. Generalization MUST be proven across this corpus, not only on the one document ever run through the bbox engine (FPT Q4 2025, row id=11):

| Sector | Tickers |
|--------|---------|
| Banks | VCB, ACB, EIB, SHB |
| Industrials | FPT, HPG, DGC, GAS, BSR |
| Pharma | DHG |
| Consumer | VNM |
| Real-estate | DIG |
| Other | VEA |

Root-cause anchor document: FPT Q1 2026 — `20260424-FPT-BCTC-hop-nhat-Quy-1-nam-2026.pdf`, report_id `e8ea3df5-3f32-413d-a3eb-c71634c0438d`.

Re-extraction is STRICTLY SEQUENTIAL single-doc. NEVER invoke `run_bctc_batch_sweep`.

---

## DDD Layer Summary

| Requirement | Domain | Application | Infrastructure | Interface |
|-------------|--------|-------------|----------------|-----------|
| REQ-LF-0 (AC-0 generic) | Structural detection rules | — | — | — |
| REQ-LF-1 (Tier 0 doc map) | Document-map grouping rules | — | PDF text reader, projection raster | — |
| REQ-LF-2 (Tier 1 page layout) | Page-type classification, schema inheritance logic | — | Projection-profile renderer | — |
| REQ-LF-3 (Tier 2 OCR + stitch) | — | OCR orchestration, cross-page stitch | Tesseract cell OCR, PIL render | — |
| REQ-LF-4 (Tier 3 invariant gate) | Invariant rules (balance identity, code monotonic, row completeness) | Gate orchestration, quarantine write | — | — |
| REQ-LF-5 (structured path non-regression) | — | — | text_table_extractor.py (0-byte-diff) | — |
| REQ-LF-6 (privacy + host) | — | Execution mode (sequential) | Tool selection (local only) | — |
| REQ-LF-7 (zone-geometry JSON emit) | — | Zone computation trigger | Zone-geometry storage in market.db | — |
| REQ-LF-8 (overlay toggle) | — | — | market.db zone read | HTTP handler + HTML render |

---

## Done-Bar (Binding — Decision F)

The sprint is NOT done until ALL of the following hold simultaneously. No partial green is accepted.

1. **Tier-3 invariant gate PASSES** across the multi-doc corpus — balance identity reconciles across the cross-page stitch, codes monotonic across page boundaries, every data row has a label and at least one value — measured pass-rate verified by DIRECT market.db query (`docker compose exec -T mcp-server bun -e` + `require("bun:sqlite")`). The `/api/bctc-inspect` endpoint is explicitly NEVER the arbiter (it may be stale).
2. **Geometric zone overlay renders ON/OFF** on LIVE `/api/bctc-inspect` from the SAME generic pipeline — no BCTC-semantic hardcoding in zone or grid logic (AC-0 grep-clean).
3. **FPT Q1 2026 page 5 scramble is FIXED** — NGUỒN VỐN rows appear with correct column alignment in the stitched markdown table via schema inheritance.
4. **Structured `bctc_table_rows` path is unregressed** — `text_table_extractor.py` 0-byte-diff; `balance_pass=true` for FPT Q4 2025 confirmed in market.db.
5. **Zero off-machine data flow** — grep/audit proof, no financial PDF or page-image sent to any external API.
6. **Main terminal independently re-verifies LIVE** — multi-doc Tier-3 pass via direct DB + overlay ON/OFF + scramble fixed.
7. **USER gives verbal G9 sign-off** — 5 prior false-greens; verbal G9 is the final gate. NOT-RUN panels are not green. Fixture-green alone is forbidden.

---

## Non-Functional Requirements

- **NFR-1 (no batch sweep):** NEVER invoke `run_bctc_batch_sweep` or any concurrent extraction job during this sprint. Host kernel-panic risk.
- **NFR-2 (deploy discipline):** pdf-extractor builds from BUILD-CONTEXT (no source mount). Ops must run `docker compose build pdf-extractor` then `up -d --no-deps --force-recreate`. A restart without rebuild relaunches the stale image.
- **NFR-3 (market.db query tool):** sqlite3 is NOT installed in containers. Use `docker compose exec -T mcp-server bun -e 'const db = require("bun:sqlite"); ...'` for all direct DB queries.
- **NFR-4 (frozen surfaces):** Do NOT touch `apps/pdf-extractor/sandbox/runner.py`, `docs/data/pilot-status-pdf-extractor.json`, the pdf-extractor dashboard trust-contract (spec/png), or `apps/pdf-extractor/infrastructure/text_table_extractor.py`. The `/api/bctc-inspect` overlay IS in scope (user-requested, supersedes prior pilot freeze for this feature).
- **NFR-5 (recurring-bug discipline):** `generic_md_table_extractor.py` carries 9 MD-EXTRACT commits; `text_table_extractor.py` carries 7 BT commits. The LF-DESIGN architect step IS the root-cause rethink required by `feedback_recurring_bug_escalation.md`. No blind dev patches to the column-guessing logic. LF-EXTRACT implements only the architect's blueprint.
- **NFR-6 (commit discipline):** Explicit-file staging only (`git add <path>`, never `-A` or `.`). No `--force`/`--no-verify`/`--no-gpg-sign`. No `git push` (user owns push). All work on `main`, no branches. Subagents leave files UNSTAGED; main terminal commits. Commit-mutex is uncallable by subagents.

---

## Out of Scope

- Replacing or modifying the structured `bctc_table_rows` extraction path (`text_table_extractor.py`)
- Any task that sends a financial PDF or page-image to a third-party API or cloud service
- The batch backfill job (`run_bctc_batch_sweep`) for any purpose
- Heavy local CV models (PP-Structure, Table-Transformer, img2table) as the default path — local fallback only
- Sprint BCTC-TABLE (closed), Sprint BCTC-TABLE-2, Sprint MCPZONE-HARDEN-1, Sprint DEPLOY-DRIFT — these remain separate
- Touching other frozen pilot surfaces except the `/api/bctc-inspect` overlay which is explicitly user-requested and IN SCOPE
- Reopening or modifying `docs/data/pilot-status-pdf-extractor.json`

---

## Blockers for PO

None that block the architect from beginning LF-DESIGN once PO approves this spec. All decisions (A through F) are already PO-resolved and user-co-authored. The following are pre-confirmed by PO:

- **Decision A (generic):** resolved — geometry is the spine, anchors are hints only.
- **Decision B (replace + augment):** resolved — column-guessing engine replaced, structured path untouched.
- **Decision C (Tier 0 cheap):** resolved — reuse `pdf_extracted_text` + low-DPI fingerprint, no new heavy OCR.
- **Decision D (schema inheritance):** resolved — continuation pages inherit the schema-page column grid.
- **Decision E (store-vs-compute for zone JSON):** resolved by PO default — store alongside the doc record; architect confirms the schema.
- **Decision F (done-bar):** resolved — Tier-3 invariants across corpus + user verbal G9, endpoint never the arbiter.

**Architect-open questions (for LF-DESIGN only — architect resolves, not PO):**
1. What market.db schema stores the zone-geometry JSON and the new markdown-table output without colliding with `bctc_table_rows`? (Architect confirms zero-collision per Decision B.)
2. What is the exact JSON contract at the pdf-extractor↔mcp-server boundary for the overlay? (Architect specifies the schema before dev-pdf-extractor and dev-mcp-server start.)
3. How should quarantined units be stored relative to passing units in market.db? (Architect decides the schema so QA can count them accurately via direct DB query.)

These are technical design questions — NOT PO-level blockers. Architect resolves them in LF-DESIGN.
