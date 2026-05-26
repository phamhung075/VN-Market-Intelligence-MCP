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

<!-- architect appends LF-DESIGN blueprint + per-task ACs below -->
