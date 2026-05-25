# Sprint BCTC-TABLE — Correct Result-Table Extraction for BCTC Analysis

**BUILD STATUS 2026-05-25T21:10Z — REOPENED as BCTC-TABLE-3. My BT-EXIT FINAL=DONE (20:51Z) was a FALSE-GREEN — REVOKED.** PO re-verified LIVE via curl on `GET /api/bctc-inspect/table/e71f845d-ffa5-48f9-8f09-30ac2cd09c65` (FPT Q4): of 150 stored rows only **11 well-formed**; **94 junk** (code=null+value=null — company name/address/headers dumped as table rows, row_order 0 = `"CÔNG TY CỔ PHẦN FPT"`); **44 orphans** (value_current present but BLANK label = the user's "pack of column is no sense"); code **"100" MISSING**, code **"222" DUPLICATED**, value_prior null on **118/150** rows. The balance badge (delta=0, anchors exact) is REAL — but the row table beside it is garbage. My prior sign-off checked the badge + row count, never row COMPOSITION — exactly the false-green my own carry-over LESSON warned against [[feedback_fence_false_green]]. **ROOT CAUSE: dual-path drift round 2** — production `apps/pdf-extractor/infrastructure/text_table_extractor.py` row-assembler diverged from the PROVEN spike `lines_to_rows()` line-parser. Stored OCR is already one-line-per-row (`A. TÀI SẢN NGAN HAN 100 58.102... 45.535...`); the spike built ~80 perfectly-joined rows from it (`spike/eval/results/FPT_balance_sheet_4-7.md`). Production added a fabricated `_detect_block_column_layout`→`_extract_block_columns` positional-zip state machine that hardcodes `label=""`, misaligns code↔value, and dumps non-code lines as junk rows. **FIX DIRECTION (architect rules at BT3-DESIGN): re-parse the EXISTING stored OCR text with the spike line-join parser — PREFERRED, host-safe, zero re-OCR; escalate to self-hosted zone-OCR ONLY if line-parsing cannot recover the join.** Full reopen record + AC-1..AC-7 + task ladder: `docs/handoffs/TASK_BCTC-TABLE.md § SPRINT BCTC-TABLE-3`. **Owner chain:** architect (BT3-DESIGN) → dev-pdf-extractor (BT3-FIX) → ops (BT3-DEPLOY redeploy + host-safe re-backfill) → qa (BT3-QA live curl) → PO (BT3-EXIT, this time inspecting row composition). **Privacy unchanged:** self-hosted Tesseract only, zero external API.

---

<details><summary>SUPERSEDED — BUILD STATUS 2026-05-25T20:51Z (CLOSED, BT-EXIT FINAL=DONE) — FALSE-GREEN, kept for audit</summary>

**BUILD STATUS 2026-05-25T20:51Z — CLOSED, BT-EXIT FINAL = DONE.** The user's explicit `/goal` target — the **FPT consolidated balance sheet** — extracts to a CLEAN, correct, analyzable result table live in `/api/bctc-inspect`. BT-7 (`210a0a62`) + deploy/re-backfill (`29efb93c`, HEAD) closed both PARTIAL blockers: FPT Q4 = **150 rows** (was 2170 noise), `period_current=31/12/2025` (was signature-date leak "26/01/2026"), `balanced=true` delta=0, anchors 270=88,089,621,779,862 / 300=44,338,155,487,272 / 400=43,751,466,292,590 / 440=88,089,621,779,862 ALL EXACT. HPG Q4 = 117 rows, 31/12/2025, balanced=true (second clean proof). Inspector renders Code|Label|2025|2024 + green balance badge next to OCR text. PO did NOT require a formal QA re-gate (BT-6 already APPROVED `acd0d61e` + BT-7 added 281 passing tests + independent live re-backfill numbers from the deploy agent). **HONEST residual coverage gaps (all dev-pdf-extractor zone, NOT BT-7 regressions, NOT FPT-goal blockers): (a) FPT Q1 = 0 rows (quarterly format reuses code 270 → BT-5 gate correctly blocks; needs quarterly code-map); (b) VEA/SHB period-detection bugs on non-FPT layouts; (c) ACB/DGC/DHG/EIB period EMPTY; (d) balance_pass=N/A docs + low-row VNM/EIB possible partial extraction.** NOT claiming "all 14 docs perfect" — multi-ticker/quarterly coverage is INCOMPLETE → **follow-up Sprint BCTC-TABLE-2 OPENED** (separate sprint, not a reopen) for residuals (a)-(d), routed to dev-pdf-extractor, non-blocking. Final record: `docs/handoffs/TASK_BCTC-TABLE.md § [PO] BT-EXIT FINAL` · decision: `docs/po-decisions/2026-05-25-bctc-table-bt-exit-final-fpt-done.md`.

**Status:** CLOSED 2026-05-25T20:51Z (BT-EXIT FINAL = DONE; FPT consolidated-BS goal signed off). Originally OPEN 2026-05-24T21:24Z (PO from explicit user `/goal`: *"bctc can extract correct result table for analyze"*). **Phase-0 CLOSED 2026-05-25T17:17Z:** BT-1 parse fix shipped (`e74abc43`); BT-0 spike DONE (`f6dd2e83` + eval results on disk); **BT-0-PICK DONE — PICK = TEXT path (Tesseract vie+eng + BT-1 primitives), ≥95%±0.5% MET on FPT reference, balance check passes to the dong.** IMAGE path (PP-StructureV3) DEFERRED as optional self-hosted cross-check only. **NEXT = BT-2 architect blueprint.** Decision: `docs/po-decisions/2026-05-25-bctc-table-bt0-pick-text-path.md`. **Core gap reframed by user finding 2026-05-25:** `/api/bctc-inspect` shows only OCR text + 4 summary figures because production has NO structured table storage — fix = produce table → store NEW schema → render in inspector + balance badge. **Severity:** HIGH. **Owner chain:** Phase-0 SPIKE [DONE] → architect blueprint → dev-pdf-extractor (produce+store) + dev-mcp-server (inspector render, SI-2) + ops/dev-mainserver-crawls (hosting) → qa → PO. **Zone:** `apps/pdf-extractor/` (extraction+store) + `apps/mcp-server/` (inspector, SI-2 boundary); hosting = main-server infra. **WIP:** 2 fleet cap.

**BUILD STATUS 2026-05-25T20:18Z — OPEN, BT-EXIT HELD AT PARTIAL.** BT-1..BT-5 + BT-3-D DONE (11 clean commits `e74abc43`..`6d7839be`); BT-6 QA APPROVED (`acd0d61e`). PO ran read-only live verification (did NOT rubber-stamp) and **held final sign-off**: the gap is FUNCTIONALLY closed — `/api/bctc-inspect` now renders a structured Code|Label|Current|Prior table + balance PASS/FAIL badge; FPT Q4 + VEA + HPG balance to the dong (anchors 270=88,089,621,779,862 / 300=44,338,155,487,272 / 400=43,751,466,292,590 exact); privacy PASS (self-hosted Tesseract only, zero external API/VLM). BUT NOT a CLEAN result table: the pre-supply backfill path (Path A) feeds ALL stored OCR pages to the assembler (FPT Q4 = 44 pages → 2170 rows, only 96 coded + signature/cover-page noise) and `period_current` is the wrong value (signature date 26/01/2026, not 31/12/2025). The 74→2170 jump is all-pages noise, NOT row accumulation (live counts idempotent + stable). **BT-7 opened** — clean balance-sheet section filter on the pre-supply path + period scoping + idempotent re-backfill; re-prove FPT clean (~74-80 rows, period 31/12/2025) → QA re-verify → PO final BT-EXIT. Record: `docs/handoffs/TASK_BCTC-TABLE.md § [PO] BT-EXIT`.

</details>

> Research is DONE: `docs/architecture-briefs/2026-05-24-bctc-table-extraction-research.md` (read in full by PO). This sprint converts the brief's two-track recommendation into a build, EVIDENCE-GATED by a Phase-0 spike on the 14-doc real gold-set. No new research.

---

## Vision

BCTC result tables (income statement + balance sheet) carry the figures every downstream analysis trusts — net revenue, gross/net profit, total assets, equity — across multiple columns (consolidated vs parent; current-quarter vs YTD vs prior-period; merged spanning headers). Today the pipeline reads **free text with a blind regex** that grabs the *first* numeric token after a Vietnamese label, with **no concept of which column** the number belongs to, and parses Vietnamese-formatted numbers through Python `float()` (which misreads `1.234.567,89`). The result is silently-wrong figures — proven by the decimal-shift bug (VNM `net_profit=0.000051`, DHG `rev=0.000009`).

The user wants extraction that produces the **correct result table** for analysis, and explicitly asked for an **image-flow-vs-text-flow comparison** to measure it objectively. This sprint delivers: (1) the literal parse fix that immediately stops the decimal-shift class; (2) an evidence-based pick of a **self-hosted, column-aware table-structure extractor** (the comparison the user asked for, measured on real docs); (3) integration of the winner into the pdf-extractor pipeline with a confidence gate that would have caught the decimal-shift bug at write time. All on self-hosted infrastructure — financial PDFs never leave our infra.

## Scope

**IN:**
- **Vietnamese number normalization** — a deterministic adapter-side normalizer (`.`=thousands, `,`=decimal) feeding the pure `decimal_normalizer` clean strings; plus a new pure `reconcile_figures` primitive (generalizes `isDecimalShiftAnomaly` >10× rule) and a pure `select_period_column` primitive. Regression-anchored on VNM/DHG.
- **Phase-0 SPIKE (gates everything else)** — evaluate 2–3 SELF-HOSTED table extractors (PP-StructureV3, PaddleOCR-VL-0.9B, plus one of Surya/Marker or TATR as backup) on the **14 real BCTC gold-set docs already on disk** (`data/pdfs-local/`, `data/pdfs/`). Score TEDS-Content + GriTS + cell-F1 + **figure-level accuracy** (the business metric). Build the gold-set with VNM/DHG as red→green regression anchors. PO picks the production winner from the scoreboard.
- **Architect blueprint** — technical design for integrating the spike winner as an infrastructure adapter (PURE primitives unchanged; OCR/model calls + PDF I/O = adapters; sandbox holds ZERO credentials per Security Clause). Coordinate main-server model hosting with ops; flag any overlap with the (now-landed) 1954c BCTC consolidation paths.
- **Integration** — wire the winning extractor through an `ExtractTablesUseCase`; replace blind regex column-picking with `select_period_column` over real cells; deploy the model to the main server; re-run the harness as a regression gate.
- **Cross-check confidence gate (self-hosted track)** — `reconcile_figures` wired into the application layer so >10× divergence → block insert + WORK-channel alert; surface in `/api/bctc-inspect`. Image-track cross-check uses the SELF-HOSTED VLM (PaddleOCR-VL on main server) only; external-API VLM is DEFERRED (open question, opt-in only).

**OUT (this sprint):**
- **Any task that sends financial PDFs or page-images to a third-party API.** The external-API VLM cross-check (Claude/Gemini/Mistral) is DEFERRED and requires EXPLICIT user consent — recorded as an open question / opt-in, NEVER an active task. Phase-0 and the self-hosted track need zero external data flow.
- Fine-tuning PaddleOCR on annotated BCTC (Phase 4 — defer unless Phase-0 numbers demand it).
- Re-architecting the (now-landed) 1954c write-chain consolidation — this sprint ADDS table-structure extraction on top of the consolidated path, it does not reopen it.
- New BCTC source fetching, queue/pull-job changes, OCR cache work — orthogonal to extraction correctness.

## Decisions (PO authority — final)

- **D1 — Self-hosted only for the build.** Primary extractor + cross-check both run on our infra (main server). No third-party API task is authorized in this sprint. (Privacy guardrail, non-negotiable.)
- **D2 — Evidence gate.** PO picks the production extractor from the Phase-0 scoreboard (measured figure-accuracy + TEDS), not from the brief's prior. PP-StructureV3 is the favorite, not the foregone conclusion.
- **D3 — Parse fix is independent and ships first.** `vn_number_normalize` + `reconcile_figures` need no model and immediately fix the parse-half of the decimal-shift bug. Dispatch in parallel with the spike.
- **D4 — Primitives stay pure.** Vietnamese-format normalization lives in the infrastructure adapter (feeds clean strings to the pure `decimal_normalizer`); model/OCR calls + PDF render = adapters; sandbox = zero credentials (Security Clause / import-linter fence intact).
- **D5 — Architect hop REQUIRED before any integration code.** The adapter boundary, the new-primitive contracts, and main-server hosting (CPU vs GPU sizing) must be designed once. PO → Architect → dev chain. Spike findings feed the blueprint.
- **D6 — Mac is dev/eval only.** Phase-0 spike runs on the Intel Mac (CPU, the 14-doc set). Production extractor runs on the main server. No heavy model in production on the Mac.
- **D7 — Freeze coordination.** The 1954c BCTC consolidation (recurring-bug-escalation freeze) has LANDED (`372fbc91` task-6 deprecate pdfOcrWorker at HEAD-side; service is sole extraction owner). Integration builds ON the consolidated path; architect must confirm no collision before dev touches shared write paths.

## Binding DoD

- **Parse fix (Phase 1):** pure `vn_number_normalize` + `reconcile_figures` + `select_period_column` primitives land with unit tests; VNM (`0.000051`) and DHG (`0.000009`) flip red→green (correct value OR caught by `reconcile_figures` as `"shift"`); sandbox stays exit-0; import-linter fence intact (primitives import zero infrastructure).
- **Phase-0 spike:** scoreboard (CSV/HTML) covering all 14 gold-set docs × {PP-StructureV3, PaddleOCR-VL-0.9B, + 1 backup} on TEDS-Content + GriTS + cell-F1 + figure-accuracy; gold-set JSON committed with VNM/DHG anchors; PO reads scoreboard and records the production pick with a measured pass-bar verdict.
- **Integration:** winning extractor wired as an infrastructure adapter through `ExtractTablesUseCase`; blind regex column-picking replaced by `select_period_column`; harness re-run as regression gate meets the agreed figure-accuracy bar; model deployed to main server (ops PROVES it live); zero credentials in `sandbox/`.
- **Cross-check gate:** `reconcile_figures` wired into the app layer; >10× divergence blocks insert + raises WORK alert; visible in `/api/bctc-inspect`; self-hosted VLM track only (zero external API).
- **No privacy breach:** grep/audit proves no task sends a PDF or page-image off-infra.

## References

- Research brief (SSOT for this sprint): `docs/architecture-briefs/2026-05-24-bctc-table-extraction-research.md`
- Spec + per-task ACs: `docs/handoffs/TASK_BCTC-TABLE.md` (architect appends design + ACs)
- Gold-set on disk: `data/pdfs-local/` (VCB, FPT, HPG, DHG, DIG, BSR, DGC, SHB + VEA, VNM), `data/pdfs/` (VNM, VEA)
- pdf-extractor pure primitives: `apps/pdf-extractor/domain/primitives/` (decimal_normalizer, field_extractor, validate_financial_figures, confidence_scorer, low_confidence_gate, ratio_computer)
- Adapters: `apps/pdf-extractor/infrastructure/extraction_engine.py`; composition `apps/pdf-extractor/domain/modules/financial_reports/module.py`; sandbox `apps/pdf-extractor/sandbox/runner.py` (Security Clause — zero creds)
- Existing decimal-shift seed: `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` `isDecimalShiftAnomaly()`
- Pilot charter / Security Clause: `docs/architecture-briefs/2026-05-22-refactor/scale/pdf-extractor-charter.md`
- Pilot stays DONE 12/12 FROZEN — `pilot-status-pdf-extractor.json` NOT edited (this is a post-pilot correctness build behind the closed pilot, not a pilot reopen).

---

## OPEN QUESTIONS — RESOLVED with PO defaults (full autonomy, no user override needed)

1. **Privacy — RESOLVED: self-hosted ONLY.** No financial PDF or page-image leaves our infra. The external-API VLM cross-check stays a DEFERRED opt-in follow-on, never an active task. Re-open only on explicit user "yes".
2. **Main-server GPU — RESOLVED for figures path: NOT required.** The TEXT path (Tesseract) is CPU-feasible at 4s/page; the pick does not depend on a GPU. ops confirms main-server CPU sizing at BT-4. GPU re-enters scope ONLY if the deferred self-hosted image cross-check (PaddleOCR-VL) is later activated for the sub-bar p5/p7 rows.
3. **Figure-accuracy pass-bar — RESOLVED: ≥95% within ±0.5%.** Adopted and MET on the FPT reference doc (page-level 100% on 3/4 sections, sentinels 6/6, accounting identity balanced). BT-6 QA validates across the wider 14-doc gold-set. API budget N/A (Q1 = self-hosted only).

## DEFERRED / HONESTLY-FLAGGED (not closed by the BT-0-PICK)

- **Sub-bar rows:** FPT p5 95.8% (marginal) + p7 86.7% (below bar); low cell-F1 (0.07-0.12 — grid reconstruction poor even where figures are right). PP-StructureV3 IMAGE path is the deferred remedy — self-hosted, revisit ONLY for these rows + cell-grid fidelity, never for figures, never external-API.
- **QA-on-BT1 still pending** — folded into BT-6.
- **14 stranded docs hold OLD-parser figures** — re-extract ONCE at BT-4b (post-integration, pre-QA), not twice.
- **Single-doc evidence** — pass-bar proven on FPT only; BT-6 proves it across the 14-doc gold-set.
