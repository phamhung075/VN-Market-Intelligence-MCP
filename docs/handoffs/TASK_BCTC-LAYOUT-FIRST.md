# TASK_BCTC-LAYOUT-FIRST — Document-Structure-First BCTC Extraction + Geometric Zone Review Overlay

> **Goal SSOT:** `docs/SPRINT_GOAL.md § Sprint BCTC-LAYOUT-FIRST`. This handoff is the chain ledger — BA appends the REQ pointer, architect appends the blueprint + per-task ACs, each downstream agent appends its evidence entry.

## Chain

PO (kickoff, this) → **BA (LF-BA, REQ spec — NEXT)** → PO approval gate → architect (LF-DESIGN, root-cause rethink + 4-tier blueprint + service-boundary split) → dev-pdf-extractor (LF-EXTRACT, Tier 0-3 engine + zone-geometry JSON) + dev-mcp-server (LF-OVERLAY, zone-overlay toggle) → ops (LF-DEPLOY, sequential single-doc re-extract + rebuild/recreate) → qa (LF-QA, Tier-3 gate across multi-doc corpus via DIRECT market.db) → PO (LF-EXIT) → USER (verbal G9).

## What the user wants built (two converged deliverables)

### Deliverable 1 — LAYOUT-FIRST / DOCUMENT-STRUCTURE-FIRST extraction (replaces the column-guessing engine)

Current engine OCRs page-by-page then GUESSES columns by clustering number-token x-positions — scrambles multi-column continuation pages, loses cross-page context. Replace with 4 tiers:

- **TIER 0 — DOCUMENT MAP.** Scan ALL pages, group consecutive pages into LOGICAL UNITS (a multi-page balance sheet / cash-flow / note is ONE unit). Continuity test = GEOMETRIC column-fingerprint match (same gutter count + x-positions within tolerance + no fresh title band + matching row pitch) as the SPINE; title anchors (BẢNG CÂN ĐỐI, LƯU CHUYỂN TIỀN TỆ, "(tiếp theo)") are HINTS / tie-breakers ONLY. Tag each page `table|prose|blank`. TOLERATE page gaps (sequence is NOT contiguous). Emit a document-map JSON. KEEP CHEAP: reuse the per-page OCR text already in `pdf_extracted_text` for titles + a low-DPI projection-profile fingerprint for geometry — NO new heavy OCR here.
- **TIER 1 — PAGE LAYOUT (per page).** Projection-profile zoning → title band / value-column gutters / row bands / footer. CONTINUATION PAGES INHERIT the column schema from the unit's schema-page (the fix for the scramble).
- **TIER 2 — OCR INTO THE KNOWN GRID + CROSS-PAGE STITCH.** OCR cells inside the fixed grid; stitch all pages of a unit into ONE markdown table (header emitted ONCE; rows appended in reading order by (page, Y)). Prose units concatenated across the page break (no artificial table boundary at the page edge).
- **TIER 3 — PER-UNIT INVARIANT GATE (machine-checkable; antidote to false-greens AND overfitting).** Balance identity reconciles ACROSS the stitch (e.g. 270 = 100 + 200 even when parts are on different pages); codes monotonic across the page boundary; every data row has a label + ≥1 value. Quarantine pages that fail. "Correct" = measured pass-rate over the corpus.

### Deliverable 2 — GEOMETRIC ZONE REVIEW OVERLAY

User verbatim: *"i want 1 layer on/off on http://localhost:3000/api/bctc-inspect for represent zone detect geometric"*. An ON/OFF toggle layer on the bctc-inspect page rendering DETECTED GEOMETRIC ZONES (column gutters, row bands, header/footer bands, logical-unit boundaries) overlaid on the page image. Purpose: validate the GEOMETRY (easy) before trusting OCR text (hard) — kills the false-green cycle. SPANS TWO SERVICES: pdf-extractor EMITS zone-geometry JSON; mcp-server RENDERS the toggle overlay. Architect splits the contract at the service boundary.

## PO Decisions (binding, user co-authored)

- **A — GENERIC by construction (AC-0):** geometry is the spine, ZERO hardcoded BCTC semantics in table/zone logic, anchors hint-only, grep-proof. Acceptance = measured Tier-3 pass-rate across the corpus, not eyeball on one doc.
- **B — REPLACE the column-guessing engine** inside `generic_md_table_extractor.py` (redesign target); **AUGMENT (do NOT touch) the structured `bctc_table_rows` path** (`text_table_extractor.py`, 0-byte-diff, SSOT for analyzable figures). Architect confirms zero collision + 1954c write chain.
- **C — Tier 0 stays CHEAP** (existing `pdf_extracted_text` + low-DPI projection profile; heavy OCR = one pass/page in Tier 2).
- **D — schema inheritance is the named fix** for the missing-header continuation-page scramble.
- **E — geometry-before-text review surface:** pdf-extractor emits zone-geometry JSON, mcp-server renders the toggle; store-vs-compute = architect call (default: store alongside the doc record so the inspector is a pure read).
- **F — DONE-BAR (G9):** Tier-3 invariants PASS across the multi-doc corpus verified by DIRECT market.db query (endpoint CAN be stale, NEVER the arbiter) AND user verbal sign-off; NOT-RUN panels not green; 5 prior false-greens.

## Hard Constraints (carry into EVERY handoff)

- **AC-0 GENERIC:** structural detection by GEOMETRY, NO hardcoded BCTC semantics in table/zone logic; anchors hints only.
- **PRIVACY (hard):** self-hosted LOCAL ONLY (PIL/OpenCV/Tesseract). NEVER send PDFs/page-images to any third-party API. External-API VLM deferred/opt-in, explicit consent. Heavy local CV (PP-Structure/Table-Transformer/img2table) = fallback only, fully local.
- **HOST LIMITS:** 2018 Intel Mac, 16GB, no GPU, kernel-panics under swap, Docker 8GB cap. SEQUENTIAL single-doc OCR ONLY. NEVER `run_bctc_batch_sweep` / any batch backfill. Tier 0 cheap (no new heavy OCR; heavy OCR = one pass/page in Tier 2).
- **VALIDATION CORPUS** (market.db `pdf_extracted_text`, 18 docs): VCB/ACB/EIB/SHB; FPT/HPG/DGC/GAS/BSR; DHG; VNM; DIG; VEA. Only FPT Q4 2025 (row id=11) ever ran the bbox engine — generalization UNPROVEN. Re-extract STRICTLY SEQUENTIAL single-doc.
- **ROOT-CAUSE ANCHOR:** FPT Q1 2026 (`20260424-FPT-BCTC-hop-nhat-Quy-1-nam-2026.pdf`, report_id `e8ea3df5-3f32-413d-a3eb-c71634c0438d`). Page 5 (NGUỒN VỐN/liabilities) = ONLY balance-sheet page with NO column header (pages 3,4,6 have "Mã số / Thuyết minh / Số cuối / Số đầu"); page 10 (cash-flow continuation) same. Tier-0/Tier-1 SCHEMA INHERITANCE is the direct fix. Doc structure: cover p1-2; balance sheet p3-6 (assets p3-4, liabilities p5-6); income ~p7-8; cash flow p9-10; notes p16-46; page gaps p11-15, 17-22 produced no text; pages swing table↔prose↔blank. Anchors can't be the spine: notes p41 matched CÂN ĐỐI+KẾT QUẢ+LƯU CHUYỂN+THUYẾT MINH together (note prose references every statement) → geometry must be the spine.
- **DEPLOY:** pdf-extractor builds from BUILD-CONTEXT (no source mount) → ops `docker compose build pdf-extractor` then `up -d --no-deps --force-recreate` (restart relaunches stale image). mcp-server = SOLE market.db write-owner. sqlite3 NOT in containers → query via `docker compose exec -T mcp-server bun -e` + `require("bun:sqlite")`.
- **FROZEN SURFACES:** `/api/bctc-inspect` overlay is NOW explicitly user-requested → mcp-server inspect-page rendering IS in scope (supersedes prior pilot freeze for THIS feature only). Other pilot-frozen surfaces remain frozen unless architect explicitly justifies: `apps/pdf-extractor/sandbox/runner.py`, `docs/data/pilot-status-pdf-extractor.json`, dashboard trust-contract spec/png, structured `text_table_extractor.py` (0-byte-diff). Redesign target = `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py`.
- **RECURRING-BUG DISCIPLINE:** module has ≥2 fix commits (9 MD-EXTRACT + 7 BT) → architect MUST do a root-cause rethink (this redesign IS it) before any new fix. No more blind dev patches.
- **COMMIT DISCIPLINE:** explicit-file staging only (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`/`--no-gpg-sign`; no `git push` (user owns); all on `main`, no branches. Subagents leave files UNSTAGED for the main-terminal commit step; notebooks committed separately from work files; commit-mutex uncallable by subagents.

## Zone / Owners

- **Zone:** `multi` — architect MUST split at the pdf-extractor↔mcp-server boundary.
- extraction + zone-geometry JSON = `apps/pdf-extractor/` (dev-pdf-extractor, sole owner) + `docs/architecture/microservice/pdf-extractor/`.
- inspector zone-overlay render = `apps/mcp-server/` (dev-mcp-server, sole market.db write-owner) — target `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`.
- architect writes ONLY `docs/architecture-briefs/`.

---

## [PO] LF-KICKOFF — 2026-05-26T18:07Z

Sprint opened. `docs/SPRINT_GOAL.md § Sprint BCTC-LAYOUT-FIRST` written (supersedes BCTC-MD-TABLE). TASKS.md ladder LF-BA → LF-EXIT created. Sprint umbrella lock claimed. NEXT = BA writes the requirement spec (LF-BA), returns to PO approval gate before architect LF-DESIGN dispatches.

<!-- BA appends LF-BA REQ pointer below -->

## [BA] LF-BA — 2026-05-26T18:30Z

Requirement spec written. NEXT = PO approval gate (architect LF-DESIGN is BLOCKED until PO approves).

**REQ file:** `docs/REQ_BCTC-LAYOUT-FIRST.md`

**Summary of what was specced:**
- 8 requirements across both deliverables and all 4 tiers
- REQ-LF-0: AC-0 generic-by-construction hard invariant (grep-proof, applies to all tiers)
- REQ-LF-1: Tier 0 document map with geometric-spine grouping — encodes the FPT Q1 2026 page-5 root cause fix as named requirement + testable ACs
- REQ-LF-2: Tier 1 per-page layout zoning with schema inheritance for continuation pages
- REQ-LF-3: Tier 2 OCR into the known grid + cross-page stitch into one markdown table per unit
- REQ-LF-4: Tier 3 per-unit invariant gate (balance identity, codes monotonic, no orphan rows) — anti-false-green mechanism; DIRECT market.db query is the only arbiter
- REQ-LF-5: Structured path non-regression (text_table_extractor.py 0-byte-diff, Decision B)
- REQ-LF-6: Privacy + host constraints (local tools only, sequential OCR, no batch sweep)
- REQ-LF-7: pdf-extractor zone — zone-geometry JSON emission (Deliverable 2, pdf-extractor side)
- REQ-LF-8: mcp-server zone — zone-overlay toggle on /api/bctc-inspect (Deliverable 2, mcp-server side); service boundary enforced
- DDD layer mapping table in REQ file
- Done-bar (Decision F) encoded verbatim as 7-point gate
- No PO blockers. 3 architect-open questions (schema, JSON contract, quarantine storage) flagged for LF-DESIGN resolution.

## [PO] LF-BA APPROVAL GATE — 2026-05-26T18:20Z — APPROVED

Spec `docs/REQ_BCTC-LAYOUT-FIRST.md` reviewed against binding Decisions A–F + the two hard-constraint blocks. **VERDICT: APPROVED.** Architect LF-DESIGN is now UNBLOCKED.

**Faithfulness check (each Decision → its requirement, all PASS):**
- **A — GENERIC / grep-proof (hard invariant):** REQ-LF-0 — AC-0a grep-proof (zero `BẢNG CÂN ĐỐI`/`LƯU CHUYỂN`/`NGUỒN VỐN`/`Mã số`/`Thuyết minh` matches in any zone-boundary or column-grid decision path; anchors permitted only in hint comment blocks), AC-0b corpus-breadth (FPT-Q4-only ≠ green), AC-0c structured-path untouched. Inherited into the overlay JSON by REQ-LF-7c (positional `col_0`/`col_1` descriptors, no semantic labels). FAITHFUL.
- **B — REPLACE column-guessing engine, AUGMENT structured path:** REQ-LF-5a names `text_table_extractor.py` 0-byte-diff (`git diff HEAD` = zero output at LF-QA); REQ-LF-0/redesign target = `generic_md_table_extractor.py`; REQ-LF-5c forbids any new write path to `bctc_table_rows` (separate table/column — architect decides). FAITHFUL.
- **D — schema inheritance is the named fix:** REQ-LF-1 explicitly tagged ROOT-CAUSE ANCHOR — REQ-LF-1b (FPT Q1 pages 3-6 = one unit, page 5 same `unit_id`), REQ-LF-1d (page 41 anchors-collide → assigned prose/blank, proving geometry-is-spine), REQ-LF-2b (page 5 OCRs with page-3's inherited grid). FAITHFUL.
- **E — pdf-extractor emits JSON, mcp-server renders toggle, split at boundary:** REQ-LF-7 (pdf-extractor zone-geometry JSON), REQ-LF-8 (mcp-server ON/OFF overlay on `/api/bctc-inspect`), REQ-LF-8f enforces the boundary (no pdf-extractor Python import — DB read only). FAITHFUL.
- **F — done-bar, no false-greens:** REQ-LF-4e DIRECT market.db arbitration (`bun:sqlite`, endpoint NEVER the arbiter); 7-point Done-Bar pt-1 = direct DB corpus pass-rate, pt-7 = USER verbal G9; NOT-RUN/fixture-green forbidden. FAITHFUL.
- **PRIVACY + HOST (hard):** REQ-LF-6a no external endpoint, REQ-LF-6b sequential single-doc + never `run_bctc_batch_sweep`, REQ-LF-3e cloud-SDK grep, NFR-1 batch-sweep ban, NFR-2 build-context deploy. FAITHFUL.

**3 architect-open questions — CORRECTLY DEFERRED (recorded, NOT answered by PO):** the REQ "Architect-open questions" block records (1) market.db schema for zone-geometry + new md output with zero `bctc_table_rows` collision, (2) exact JSON contract at the pdf-extractor↔mcp-server boundary, (3) quarantined-unit storage for QA's direct-DB count — all tagged "technical design questions, NOT PO-level blockers; architect resolves in LF-DESIGN." Confirmed recorded for the architect; PO does NOT pre-answer.

**Recurring-bug guard:** this redesign IS the root-cause rethink the guard requires (`generic_md_table_extractor.py` = 9 MD-EXTRACT + `text_table_extractor.py` = 7 BT fix commits). Guard cleared — architect proceeds to LF-DESIGN.

**NEXT = architect (LF-DESIGN).** Formalize the 4-tier blueprint; split the work at the pdf-extractor↔mcp-server service boundary (zone=`multi`); resolve the 3 open questions; write per-task ACs for LF-EXTRACT + LF-OVERLAY; brief → `docs/architecture-briefs/`. Design-only — no code.

<!-- architect appends LF-DESIGN blueprint + per-task ACs below -->

## [Architect] LF-DESIGN — 2026-05-26T19:30Z

**Brief:** `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md`
**Build standard:** lean (existing service zones; redesign target = `generic_md_table_extractor.py`)

### Brownfield summary

- **Redesign target confirmed:** `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` (MD-EXTRACT-9, ~2445 lines). The per-page algorithm (Steps A–G) has no cross-page unit grouping. This IS the structural root cause.
- **0-byte-diff boundary confirmed:** `text_table_extractor.py` owns `bctc_table_rows` via the 1954c write chain. The two use cases (`ExtractMdTablesUseCase` / `ExtractTablesUseCase`) are fully separated — different triggers, different ports, different DB tables. Zero collision risk.
- **Existing infrastructure reused:** `bctc_md_tables` DDL (extended, not replaced), `pushBctcMdTablesHandler.ts` (unchanged — old endpoint stays), `MdTablePushClient` (new `LayoutFirstPushClient` added alongside), `bctcInspectHandler.ts` (extended with overlay route + toggle).
- **Scan clean:** true. No hidden shared state found between the two extraction paths.

### 3 Architect-Open Questions — Resolved

1. **market.db schema (Q1):** Two NEW tables: `bctc_layout_units` (one row per logical unit per report, with `quarantined` flag) and `bctc_page_zones` (one row per page per report, with full `zones_json`). Both owned by mcp-server via new `POST /api/push-bctc-layout` handler. DDL in brief §3.1. Zero overlap with `bctc_table_rows`, `bctc_balance_checks`, or `bctc_md_tables`.

2. **JSON contract at the service boundary (Q2):** Full contract specified in brief §3.2. Coordinate system: top-left origin, px unit, 200 DPI. Column IDs are positional (`col_0`, `col_1`). Continuation pages emit IDENTICAL column gutters as the schema-page (this is the visual inheritance proof). Zone type vocabulary bound to overlay color assignments.

3. **Quarantined unit storage (Q3):** Quarantined units are stored in `bctc_layout_units` with `quarantined=1`. QA counts them via direct bun:sqlite query (exact command in brief §3.3). Pass-rate = `COUNT(*) WHERE quarantined=0` / `COUNT(*)` total.

### Per-Task ACs

Full machine-checkable ACs in brief:
- **LF-EXTRACT:** AC-LFE-0 through AC-LFE-11 (§4.1)
- **LF-OVERLAY:** AC-LFO-0 through AC-LFO-7 (§4.2)

Key done-bar ACs:
- AC-LFE-0: grep-proof (zero BCTC semantic labels in zone/grid decision paths)
- AC-LFE-2: schema inheritance (page 5 `schema_inherited_from_page=3`)
- AC-LFE-3: page 41 is prose (geometry-is-spine proof)
- AC-LFE-5: corpus breadth (18 docs, measured pass-rate, not assumed)
- AC-LFO-3: structured path non-regression (balance_pass=1 for FPT Q4 after overlay added)

### Parallelism

LF-EXTRACT and LF-OVERLAY CAN run in parallel — the JSON contract (§3.2), DDL (§3.1), and endpoint name are fully specified. Both dev agents implement against the contract independently. LF-DEPLOY is gated on BOTH being done.

### Zone

- LF-EXTRACT: `apps/pdf-extractor/` (dev-pdf-extractor, sole owner)
- LF-OVERLAY: `apps/mcp-server/` (dev-mcp-server, sole market.db write-owner)
- architect writes only: `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md` + this handoff entry + TASKS.md + notebook

**NEXT = PM dispatches dev-pdf-extractor (LF-EXTRACT) + dev-mcp-server (LF-OVERLAY) in parallel.**

## [PM] LF-PM — Task Decomposition & Dispatch Recommendation — 2026-05-26T19:45Z

**DECOMPOSITION MANDATE:** architect blueprint (LF-DESIGN, 593 lines, 2026-05-26-bctc-layout-first-pipeline.md) specifies:
- **Tiers 0–3 pipeline** → `apps/pdf-extractor/infrastructure/generic_md_table_extractor.py` redesign + new `extract_layout_first_usecase.py` + new `layout_first_push_client.py` + domain primitives
- **Zone geometry JSON push + schema** → `apps/mcp-server/` new `POST /api/push-bctc-layout` handler + `bctc_layout_units` + `bctc_page_zones` DDL + overlay toggle in `bctcInspectHandler.ts`
- **Service boundary:** fully specified JSON contract in brief §3.2; both dev agents implement against contract independently

**ATOMIC TASK SPLIT (PARALLEL-READY):**

### LF-EXTRACT — dev-pdf-extractor (~2h baseline, one use case + three tier functions + three unit test files)
**ZONE:** `apps/pdf-extractor/` (sole owner)
**WHAT:** Implement Tiers 0–3 layout-first pipeline per brief §2 + §4.1
- **Tier 0:** `build_document_map()` (geometric fingerprint grouping, page tagging, 50-DPI projection raster)
- **Tier 1:** `zone_page()` (per-page layout zoning, schema inheritance for continuation pages)
- **Tier 2:** `ocr_unit()` (OCR into fixed grid, cross-page stitch to one markdown table per unit)
- **Tier 3:** `gate_unit()` (balance identity, codes monotonic, orphan-row check; quarantine on fail)
- **New files:** `application/extract_layout_first_usecase.py` (orchestrator) + `infrastructure/layout_first_push_client.py` (HTTP client) + `domain/primitives/layout_invariants/primitive.py` (pure gate functions)
- **Extend:** `domain/modules/financial_reports/ports.py` (add port interfaces) + `main.py` (wire composition root, add `POST /extract-layout-first` route)
- **Tests:** `test_document_map.py` + `test_schema_inheritance.py` + `test_layout_invariants.py` (injected fakes, zero Tesseract)
- **FROZEN (0-byte-diff):** `text_table_extractor.py`, `sandbox/runner.py`, `docs/data/pilot-status-pdf-extractor.json`

**ACCEPTANCE CRITERIA (ACs AC-LFE-0 through AC-LFE-11 from brief §4.1):**
- AC-LFE-0: grep-proof (zero BCTC semantics in zone/grid logic)
- AC-LFE-1: document-map JSON emitted + stored in `bctc_page_zones`
- AC-LFE-2: schema inheritance (page 5 inherits from page 3)
- AC-LFE-3: page 41 tagged prose (geometry is the spine)
- AC-LFE-4: FPT Q1 NGUỒN VỐN present in stitched output
- AC-LFE-5: corpus breadth (18 docs, measured pass-rate)
- AC-LFE-6: one Tesseract pass per page (Tier 0 uses stored OCR + PIL only)
- AC-LFE-7: `text_table_extractor.py` zero-diff
- AC-LFE-8: local tools only (no external API)
- AC-LFE-9: sequential re-extract (no batch sweep)
- AC-LFE-10: sandbox green
- AC-LFE-11: quarantine path exercised

### LF-OVERLAY — dev-mcp-server (~2h baseline, schema + handler + overlay rendering)
**ZONE:** `apps/mcp-server/` (sole market.db write-owner)
**WHAT:** Consume zone-geometry JSON per contract (brief §3.2); add DB schema + push handler + overlay toggle
- **Schema:** `bctc_layout_units` (per-unit stitched markdown + quarantine flag) + `bctc_page_zones` (per-page zone geometry)
- **Handler:** `POST /api/push-bctc-layout` in new `pushBctcLayoutHandler.ts` (validates UUID, writes to both tables, idempotent)
- **Overlay:** extend `bctcInspectHandler.ts` with zone-toggle rendering (column gutters, row bands, header/footer bands, unit boundaries)
- **New files:** `pushBctcLayoutHandler.ts` (handler logic)
- **Extend:** `schema-financial-reports.ts` (DDL) + `server.ts` (register route) + `bctcInspectHandler.ts` (overlay route + rendering)
- **Tests:** `1272-push-bctc-layout.test.ts` (handler validity + idempotency + isolation) + `1273-bctc-inspect-overlay.test.ts` (zone rendering + non-regression)
- **FROZEN:** structured `bctc_table_rows` read path, balance badge, existing md-tables endpoints

**ACCEPTANCE CRITERIA (ACs AC-LFO-0 through AC-LFO-7 from brief §4.2):**
- AC-LFO-0: toggle present in HTML
- AC-LFO-1: zones endpoint returns positional col_id data
- AC-LFO-2: zero pdf-extractor import (DB-read only)
- AC-LFO-3: structured path non-regression (balance_pass=true for FPT Q4)
- AC-LFO-4: new tables exist, zero cross-write to `bctc_table_rows`
- AC-LFO-5: idempotent push (same report_id + unit_id = one row after duplicate)
- AC-LFO-6: zone types visually distinct (≥2 colors/styles)
- AC-LFO-7: corpus breadth (18 docs have zone data)

**DISPATCH RECOMMENDATION:**

**✓ DISPATCH BOTH IN PARALLEL IMMEDIATELY** (recommended)

**RATIONALE:**
1. **Contract fully specified:** brief §3.2 defines exact JSON schema, DDL (§3.1), and endpoint name (`POST /api/push-bctc-layout`). Both dev agents can implement independently against this SSOT without waiting for the other's code.
2. **Zero inter-agent code dependency:** pdf-extractor uses HTTP to push; mcp-server reads from DB only. No Python import, no TypeScript dependency.
3. **Independent test verification:** mcp-server tests use injected in-memory SQLite DB — do NOT require pdf-extractor to be running. Both can pass their own test suites before either is deployed.
4. **WIP gate:** max 2 In Progress. Assigning both now keeps WIP at exactly 2 (one per zone specialist).
5. **Serial deployment gate:** LF-DEPLOY is gated on BOTH being done (developer submits pull, code merged, image rebuilt for each). But implementation can proceed in parallel.

**HOST RISK ASSESSMENT (16GB Mac, 8GB Docker cap, known kernel-panic on swap):**
- **Recommendation: PARALLEL DISPATCH is HOST-SAFE** because:
  - Dev-pdf-extractor works on source files in the repo (no runtime container impact yet)
  - Dev-mcp-server works on schema + TypeScript compilation (zero OCR, zero Tesseract during dev)
  - Both write NO runtime state until LF-DEPLOY (rebuild + re-extract) — that step is serialized by ops
  - Peak resource contention is at LF-DEPLOY single-doc re-extract: one container running, one Tesseract pass/page (per design), no batch → fits 8GB cap

**HOST-RISK ALTERNATIVE (if conservative):** serialize LF-EXTRACT → LF-OVERLAY (adds ~2h latency, no functional benefit, developer lane idle during the second task)

**FINAL DISPATCH DIRECTIVE TO MAIN TERMINAL:**
```
DISPATCH LF-EXTRACT (dev-pdf-extractor) + LF-OVERLAY (dev-mcp-server) PARALLEL NOW

GATE (sequential after both DONE):
  LF-DEPLOY (ops rebuild both, sequential single-doc re-extract, gated on both code merged)
  LF-QA (qa, direct market.db verification, parallel with QA flow)
  LF-FIX (fixer, if QA routes fixes)
  LF-EXIT (po final verification)

WATCHLIST (pm):
  - WIP count = 2 (LF-EXTRACT + LF-OVERLAY). Any blocker surfaces → escalate immediately.
  - Dev-pdf-extractor dependency: brief §2 is the SSOT. No deviations. AC-LFE-0 grep-proof is non-negotiable.
  - Dev-mcp-server dependency: brief §3.1 + §3.2 are the SSOT. No deviations. Schema immutable until LF-DEPLOY.
  - Host kernel-panic: LF-DEPLOY single-doc only, NEVER batch sweep. Sequential on ops lane.
  - Blockers escalate to architect for routing.
```

## [dev-mcp-server] LF-OVERLAY — 2026-05-26T18:50Z

**Status: DONE — files UNSTAGED — main terminal commits**

### What was implemented

**Schema (schema-financial-reports.ts):**
- Added `bctc_layout_units` table exactly per brief §3.1 DDL (unit_id, schema_page, page_numbers_json, page_type, stitched_markdown, row_count, quarantined, quarantine_reason, document_map_json)
- Added `bctc_page_zones` table exactly per brief §3.1 DDL (page_number, unit_id, page_type, is_schema_page, is_continuation_page, schema_inherited_from_page, zones_json)
- Both use `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` (additive migration pattern)
- Zero modification to bctc_table_rows, bctc_balance_checks, or bctc_md_tables

**Push handler (pushBctcLayoutHandler.ts NEW):**
- POST /api/push-bctc-layout — ingests §3.2 JSON contract
- Validates report_id as UUID; validates document_map, units[], page_zones[] arrays
- Writes bctc_layout_units (INSERT OR REPLACE per unit_id) + bctc_page_zones (INSERT OR REPLACE per page_number)
- DB-verified COUNT returned in response (write-wedge detection — never echo input length)
- Quarantined units stored with quarantined=1

**Zones endpoint (bctcInspectHandler.ts extended):**
- `handleBctcInspectZones` → GET /api/bctc-inspect/zones/{doc_id}?page=N
- Returns full zones_json from bctc_page_zones; 404 when no data
- Pure DB read — zero pdf-extractor import (grep-auditable)
- Existing bctc_table_rows read path and balance badge are untouched

**Overlay toggle (bctc-inspector.html extended):**
- Toggle control: `<input id="zone-overlay-toggle" data-zone-toggle="true" />` in controls bar
- 5-color ZONE_COLORS: headerBand (amber), footerBand (orange), gutterEven (blue), gutterOdd (green), rowBand (purple), unitBoundary (red heavy)
- Coordinate scaling: canvas_width / image_width_px per §3.2 constraint
- SVG overlay draws: header_band, footer_band, column_gutters (alternating colors), row_bands, unit_boundary_after_page line
- Zone cache per doc_id:page; clearAllOverlays on doc reset; overlay re-renders on page navigation

**Routes (server.ts extended):**
- `POST /api/push-bctc-layout` → handlePushBctcLayout
- `GET /api/bctc-inspect/zones/*` → handleBctcInspectZones

### AC audit (machine-checkable)

| AC | Status | Evidence |
|---|---|---|
| AC-LFO-0 | PASS | id="zone-overlay-toggle" + data-zone-toggle="true" present in HTML |
| AC-LFO-1 | PASS | Test 1273(a): zones endpoint returns col_id matching /^col_\d+$/ pattern |
| AC-LFO-2 | PASS | grep finds zero actual import lines of pdf-extractor in bctcInspectHandler.ts |
| AC-LFO-3 | PASS | pushBctcTableHandler.test.ts 14/14 green; bctc_table_rows read path not touched |
| AC-LFO-4 | PASS | Test 1272(f): SELECT COUNT(*) FROM bctc_table_rows = 0 after layout push |
| AC-LFO-5 | PASS | Test 1272(c): two identical pushes result in 2 rows, not 4 |
| AC-LFO-6 | PASS | ZONE_COLORS has 5 distinct entries with distinct fill/stroke colors |
| AC-LFO-7 | DEFERRED | Requires corpus re-extraction; verified at LF-QA step |

### Test results
- 1272-push-bctc-layout.test.ts: 20 tests — 20 pass / 0 fail
- 1273-bctc-inspect-overlay.test.ts: 9 tests — 9 pass / 0 fail
- pushBctcTableHandler.test.ts (non-regression): 14 pass / 0 fail
- `bun tsc --noEmit`: EXIT 0

### Files changed (UNSTAGED)
```
apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts
apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts   (NEW)
apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts
apps/mcp-server/src/interface/mcp/server.ts
apps/mcp-server/src/interface/bctc-inspector.html
apps/mcp-server/src/__tests__/1272-push-bctc-layout.test.ts         (NEW)
apps/mcp-server/src/__tests__/1273-bctc-inspect-overlay.test.ts     (NEW)
docs/handoffs/TASK_BCTC-LAYOUT-FIRST.md
docs/agent-memory/notebooks/dev-mcp-server.md
```

**NEXT = ops (LF-DEPLOY)** — gated on BOTH LF-OVERLAY (this, DONE) AND LF-EXTRACT (dev-pdf-extractor, in parallel). ops must: `docker compose build mcp-server && docker compose up -d --no-deps --force-recreate mcp-server` before running single-doc re-extraction. AC-LFO-7 (corpus breadth) verified by QA after re-extraction.
