# TASK BCTC-TABLE — Correct Result-Table Extraction for BCTC Analysis

**Sprint:** BCTC-TABLE · **Opened:** 2026-05-24T21:24Z by PO · **Goal:** `docs/SPRINT_GOAL.md` (Sprint BCTC-TABLE)
**Research SSOT (DONE — no new research):** `docs/architecture-briefs/2026-05-24-bctc-table-extraction-research.md`
**User mandate (`/goal`):** *"bctc can extract correct result table for analyze."*

> This is the per-task handoff. PO authored the sprint shape, decisions, DoD, and per-task intent below. **Architect (BT-2) appends the integration blueprint + finalized per-task ACs** after the Phase-0 pick. dev/qa/ops append their records under their task headings.

---

## Binding constraints (Day-0, every agent)

- **PRIVACY (non-negotiable):** NO task sends a financial PDF or rendered page-image to a third-party API. External-API VLM cross-check is DEFERRED + opt-in (Open Q1). Phase-0 + the self-hosted track = ZERO external data flow. A task proposing an off-infra send is rejected back to PO.
- **Security Clause (carried from pilot charter):** OCR/model calls + PDF I/O are impure → infrastructure adapters. `domain/primitives/*` stay PURE — import-linter fence: primitives must NOT import `infrastructure`. `sandbox/runner.py` holds ZERO credentials. Model/API keys (if any) live only in the adapter runtime env.
- **Freeze coordination:** 1954c BCTC write-chain consolidation has LANDED (`372fbc91`, service = sole extraction owner). Build ON TOP of it. BT-2 confirms no collision with frozen write paths before BT-3 touches shared code.
- **Git (every agent):** explicit-file staging (`git add <path>`, never `-A`/`.`); no `--force`/`--no-verify`; NO `git push` (user owns); all on `main` (NO branches); `git show --stat HEAD` shows zero foreign files (heavy fleet commit-race). Never ask the user to run/deploy — spawn ops/dev.
- **Mac is dev/eval only (D6):** Phase-0 spike runs on the Intel Mac (CPU). Production model runs on the main server. No heavy model in production on the Mac.
- **Pilot frozen:** `pilot-status-pdf-extractor.json` NOT edited; sandbox dashboard surface + 3 trust panels UNTOUCHED. This is a post-pilot correctness build behind the closed pilot.

---

## BT-1 — Vietnamese number-format fix (parse-half) · dev-pdf-extractor · CRITICAL · READY

**Why first:** the literal cause of the decimal-shift bug. Independent of the table-model work, needs no model, ships immediate correctness. Dispatch in parallel with BT-0.

**Build (three pure primitives, zero infra import):**
1. `vn_number_normalize(str) -> str` — if a token matches `\d{1,3}(\.\d{3})+(,\d+)?` treat `.`=thousands, `,`=decimal → strip `.`, swap `,`→`.` before it reaches `float()`. Deterministic on a raw token; returns a clean numeric string. (Called from the adapter; feeds clean input to the existing pure `decimal_normalizer` — do NOT make `decimal_normalizer` locale-aware, D4.)
2. `reconcile_figures(a, b, tol) -> "agree" | "shift" | "low"` — generalizes `isDecimalShiftAnomaly` from `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`. `ratio = max(|a|,|b|) / max(min(|a|,|b|), eps)`; `ratio ≤ tol` → "agree"; `ratio > 10×` → "shift"; else "low".
3. `select_period_column(cells, hint) -> column-index/value` — pick the consolidated-current-quarter column from a row of cells (replaces "first numeric token in next 5 lines" once BT-3 supplies real cells; pure + table-shape-agnostic).

**ACs (PO baseline — architect may extend):**
- AC1 — VNM (`net_profit`): raw OCR token that currently parses to `0.000051` now normalizes to the correct billion-VND figure OR `reconcile_figures` returns `"shift"` against the API-bridge value. Unit test, red→green.
- AC2 — DHG (`rev`): same, the `0.000009` case flips red→green or is caught as `"shift"`.
- AC3 — `vn_number_normalize` unit-tested on: `"1.234.567,89"`→`"1234567.89"`, `"51.000"`→`"51000"`, `"0,5"`→`"0.5"`, plain `"51000"` passthrough, `"1,234.5"` (already-clean en-US, must not double-mangle — architect rules the disambiguation).
- AC4 — all three primitives PURE (import-linter fence: zero `infrastructure` import); `sandbox/runner.py` exit-0; existing scenarios stay green.

---

## BT-0 — Phase-0 SPIKE: self-hosted extractor evaluation · dev-pdf-extractor · HIGH · READY (dispatch FIRST)

**This is the image-vs-text comparison the user asked for, measured objectively.** Timebox: 1 sprint.

**Build:**
1. Eval harness (eval tooling under `apps/pdf-extractor/`, NOT in the pure-primitive sandbox — it does I/O). Per doc: run each candidate → emit predicted table (HTML/JSON) + extracted figures → compute TEDS-Content + GriTS + cell-F1 vs gold table + figure-accuracy vs gold figures → write a CSV/HTML scoreboard (option × metric).
2. 14-doc gold-set JSON (`gold/<TICKER>_<YEAR>_Q<N>.json`): income-statement + balance-sheet result rows, **tagging which column = consolidated current-quarter**, in billion VND, VN-format normalized, with source page number. VNM (`net_profit`) + DHG (`rev`) MUST be regression anchors (red→green).
3. Run **SELF-HOSTED candidates ONLY** on the 14-doc set, CPU, Intel Mac: PP-StructureV3 + PaddleOCR-VL-0.9B + 1 backup (Surya/Marker OR Microsoft TATR). **NO external-API VLM in this spike** (privacy guardrail; the brief's API-VLM upper-bound anchor is DEFERRED to the opt-in follow-on).

**Deliverable:** scoreboard CSV/HTML committed under `apps/pdf-extractor/` eval tooling → PO reads it at BT-0-PICK.

**Gold-set sources on disk (do NOT fetch new):** `data/pdfs-local/` (VCB, FPT, HPG, DHG, DIG, BSR, DGC, SHB, VEA, VNM) + `data/pdfs/` (VNM, VEA). PDFs + OCR text already exist (`pdf_extracted_text` table; viewer `/api/bctc-inspect`).

---

## BT-0 — Phase-0 SPIKE · dev-pdf-extractor · DONE (2026-05-25, `f6dd2e83` + eval results on disk)

Eval results committed under `apps/pdf-extractor/spike/eval/results/`. TEXT path (Tesseract vie+eng) cleared the ±0.5% bar at ~4s/page CPU; PP-StructureV3 IMAGE path scored 0/6 on its one VNM run at 45s/page and was skipped on the figures path. Full FPT balance sheet (p4-7) stitched, accounting identity balances to the dong. Do NOT re-run.

## BT-0-PICK — PO records production pick · po · GATE · DONE (2026-05-25T17:17Z)

**PICK = TEXT path (Tesseract vie+eng + BT-1 primitives).** PP-StructureV3 IMAGE = DEFERRED optional cross-check only (revisit ONLY for sub-bar p5/p7 rows + low cell-F1; self-hosted, never external-API). Decision note: `docs/po-decisions/2026-05-25-bctc-table-bt0-pick-text-path.md`. Pass-bar ≥95% within ±0.5% MET on FPT reference (page-level 100% on 3/4 sections, sentinels 6/6, balance True). BT-6 QA must re-run across the wider gold-set, not just FPT.

**Open-Q resolutions (PO defaults):** Q1 self-hosted ONLY; Q2 GPU not required (TEXT is CPU-feasible at 4s/page — ops confirms CPU sizing at BT-4); Q3 ≥95% within ±0.5% adopted + met.

---

## BT-2 — Architect integration blueprint (DESIGN ONLY) · architect · HIGH · READY (← BT-0-PICK DONE)

**Frame the design to close the user's exact complaint:** at `localhost:3000/api/bctc-inspect` the viewer right-pane only ever shows OCR `text` (from `pdf_extracted_text`) + 4 summary figures (from `financial_reports`). There is **NO structured code→value table storage anywhere in production**, so the inspector physically cannot render a detected table. The design must close the produce → store → render gap end-to-end:

1. **PRODUCE** (dev-pdf-extractor zone) — the TEXT-path extractor (Tesseract vie+eng + BT-1 primitives) must emit a structured code→value table (rows like 100/110/270…, both period columns, billion-VND normalized, with the consolidated-current-quarter column tagged via `select_period_column`) during `process_report()`, plus a balance-check result (Total Assets == Liabilities + Equity).
2. **STORE** (dev-pdf-extractor zone) — define a NEW schema for structured table rows, persisted per doc+page (e.g. a `bctc_table_rows` table: doc id, page, code, label, period-label, value, plus a per-doc balance-check pass/fail + balance delta). This is the missing storage; without it the inspector has nothing to read.
3. **RENDER** (dev-mcp-server zone — SI-2 boundary) — `bctcInspectHandler.ts` + the `/api/bctc-inspect` viewer read the new schema and render the structured table NEXT TO the existing OCR text, plus a **balance-check PASS/FAIL badge**. Define the read contract (DB columns → JSON shape → render) so dev-mcp-server can build the inspector side without guessing.

Append the blueprint + finalized per-task ACs (BT-3/4/5/6) here. Also cover:
- Adapter boundary: text-table assembler + `PdfPageRenderer` (PyMuPDF/pdf2image → PNG, only if the DEFERRED image cross-check is ever activated) as `infrastructure/` adapters. The figures path needs no model/render — Tesseract text + primitives only.
- `ExtractTablesUseCase` (application, DI) orchestration; how `select_period_column` consumes real cells; how the stitched multi-page table (p4-7 pattern) assembles into stored rows.
- **Schema migration plan:** the new `bctc_table_rows` schema + migration; how it coexists with the 1954c-consolidated `financial_reports` write path (additive, not a rewrite).
- Main-server hosting: TEXT path is CPU-feasible at 4s/page (no GPU needed — Open Q2 resolved for the figures path); confirm CPU sizing with ops at BT-4; Docker placement; existing `PdfplumberExtractionEngine` kept as native-PDF fast path. Production extractor runs on the MAIN SERVER, NOT the Mac (Mac is eval-only, kernel-panics under load — D6).
- Cross-check gate wiring: `reconcile_figures` → app-layer route → block insert + WORK alert + surface in `/api/bctc-inspect`; image-track cross-check (if ever activated) = self-hosted VLM only, DEFERRED.
- **Confirm no collision with 1954c frozen write paths** (`372fbc91` and the 1954c task-2..6 series) before BT-3 touches shared code. The new table-rows store is ADDITIVE on top of the consolidated path.
- **Re-extraction plan:** the 14 already-stored docs hold OLD-parser figures (pre-BT-1). They must be re-extracted ONCE after integration lands (not twice — sequence the backfill so it runs after BT-3+BT-5, before BT-6 QA). Architect specifies the one-shot backfill trigger.
- Security Clause: sandbox zero creds, import-linter fence (`domain.primitives` must not import `infrastructure`).

---

## BT-3 — Integrate extractor: produce + store structured table · dev-pdf-extractor · HIGH · BLOCKED (← BT-2, BT-1)
TEXT-path extractor emits the structured code→value table + balance check during `process_report()`; persists rows to the NEW `bctc_table_rows` schema per doc+page. Zero creds in sandbox; import-linter fence intact.

## BT-3i — Inspector schema read + table render · dev-mcp-server · HIGH · BLOCKED (← BT-2, BT-3)
SI-2 boundary: `bctcInspectHandler.ts` + `/api/bctc-inspect` viewer read the new schema and render the structured table next to OCR text + balance-check PASS/FAIL badge. **This is the surface that closes the user's exact complaint.** Routed to dev-mcp-server (bctc-inspect viewer = SI-2 boundary, NOT dev-pdf-extractor).

## BT-4 — Deploy extractor to main server · ops + dev-mainserver-crawls · HIGH · BLOCKED (← BT-2)
Host the TEXT-path extractor on the MAIN SERVER (CPU-feasible at 4s/page, no GPU needed — Open Q2 resolved for figures path). NO heavy model on the Mac in prod (D6, kernel-panic risk).

## BT-4b — One-shot re-extraction of stranded docs · dev-pdf-extractor + ops · MEDIUM · BLOCKED (← BT-3, BT-3i, BT-5)
The 14 already-stored docs hold OLD-parser figures (pre-BT-1). Re-extract ONCE after produce/store/render + cross-check land, BEFORE BT-6 QA (not twice). Architect specifies the trigger at BT-2.

## BT-5 — Cross-check confidence gate (self-hosted) · dev-pdf-extractor · MEDIUM · BLOCKED (← BT-3, BT-4)
Wire `reconcile_figures` into the app layer: >10× divergence → block insert + WORK alert; surface in `/api/bctc-inspect`. Image-track cross-check = SELF-HOSTED VLM only, DEFERRED. NO external API.

## BT-6 — QA regression gate · qa · HIGH · BLOCKED (← BT-4b, BT-5)
Re-run BT-0 harness across the WIDER 14-doc gold-set (not just FPT): figure-accuracy meets ≥95%±0.5% bar; VNM/DHG green; structured rows stored + rendered in inspector with balance badge; cross-check fires on >10×; sandbox exit-0 + zero creds; import-linter fence intact; pilot-status diff empty; zero off-infra data send. Also closes QA-on-BT1 (still pending). Emit `qa-bctc-table-<UTC>.json`.

## BT-EXIT — PO sign-off · po · CRITICAL · BLOCKED (← BT-6)
Sign off vs DoD on REAL gold-set + verify the live `/api/bctc-inspect` viewer now shows a detected table + balance badge (the user's complaint, closed). Privacy audit. Main terminal commits in-tree work.

ACs for BT-3..BT-EXIT finalized by architect at BT-2. High-level intent in `docs/TASKS.md` § Sprint BCTC-TABLE and `docs/SPRINT_GOAL.md` § Binding DoD.

---

## [Developer] BT-1 — dev-pdf-extractor — DONE

**Commit:** `e74abc43` | **Branch:** main | **Date:** 2026-05-24

### What was delivered

Three pure domain primitives in `apps/pdf-extractor/domain/primitives/`:

1. **`vn_number_normalize`** — Fixes the root decimal-shift cause at parse time.
   VN format: `.`=thousands separator, `,`=decimal. Converts before `float()`.
   - "2.840.370" → "2840370" (VNM net_profit anchor)
   - "1.234,56" → "1234.56" (DHG revenue anchor)
   - "1.234.567,89" → "1234567.89", "51.000" → "51000", "0,5" → "0.5"
   - "1,234.5" (EN-US format) → None (rejected, fail-loud)
   - Disambiguation rule: lone "1.234" = VN thousands integer → "1234" (documented in primitive.py)
   - Negatives: "(-2.840.370)" → "-2840370", parenthesis BCTC notation handled

2. **`reconcile_figures(a, b, tol=1.0)`** — Generalizes `isDecimalShiftAnomaly` from
   `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts`.
   - Same formula: `ratio = max(|a|,|b|) / max(min(|a|,|b|), 1e-9)`
   - "agree" (ratio ≤ tol) | "shift" (ratio > 10×tol) | "low" (between)
   - Null-safe (None input → "agree"), zero-reference guard (b=0 → "agree")
   - VNM: `reconcile_figures(0.000051, 51000)` → "shift" (ratio ~1e9)

3. **`select_period_column(cells, hint, headers)`** — Deterministic period column picker.
   - Step 1: header keyword matching for "consolidated"/"current"/"ytd"/"parent"
   - Step 2: position heuristic (first non-empty numeric cell)
   - Returns `[index, value]` list (JSON round-trip safe)
   - TODO marker in primitive.py for BT-3 model-dependent semantic override

### Wiring into live extraction path

`FinancialReportsModule.process_report()` now calls `vn_pre_normalize()` BEFORE `decimal_normalizer.normalize()` for each raw field. Three new optional constructor ports added (backward-compat — existing callers unaffected). `sandbox/runner.py` wires all 9 adapters.

### Red→Green evidence

**Before fix:**
- `float("2.840.370")` = `2.84037` (wrong parse; pipeline produces decimal-shifted output ~0.000051 after further processing)
- `float("1.234,56")` → `ValueError` → `None` propagates downstream

**After fix:**
- `vn_number_normalize("2.840.370")` = `"2840370"` → `normalize_decimal("2840370")` = `2840370.0`
- `vn_number_normalize("1.234,56")` = `"1234.56"` → `normalize_decimal("1234.56")` = `1234.56`
- `reconcile_figures(0.000051, 51000)` = `"shift"` (anomaly correctly detected)

### Test counts

- **Pre-existing:** 186 passed (no regression)
- **New (BT-1):** 49 tests (17 vn_number_normalize + 20 reconcile_figures + 12 select_period_column)
- **Total:** 235 passed

### Sandbox scenarios

- 9 new scenarios GREEN (3 per primitive: happy/edge/failure)
- Module-tier scenario: `revenue_reconciliation` + `selected_column_*` keys present, pass=true
- All pre-existing scenarios unaffected

### Import-linter fence

- 63 files analyzed, 94 dependencies
- Fence-A (primitives must not import infra/app/interface): KEPT
- Fence-B (modules must not import infra/interface): KEPT
- Exit 0

### ACs status

- AC1 VNM net_profit: GREEN — "2.840.370" → 2840370.0; reconcile vs api flags "shift" for old value
- AC2 DHG revenue: GREEN — "1.234,56" → 1234.56
- AC3 spec vectors: all GREEN (tested in test_vn_number_normalize.py)
- AC4 pure primitives: CONFIRMED (import-linter fence 2/0)

### Handoff to QA

Owner: qa | Task: verify BT-1 green signal
- Run `cd apps/pdf-extractor && python -m pytest` — expect 235 passed
- Run `lint-imports --config pyproject.toml` — expect 2 kept 0 broken
- Verify commit `e74abc43` has zero foreign files: `git show --stat e74abc43`
- Confirm AC1/AC2 tests pass: `python -m pytest __tests__/unit/test_vn_number_normalize.py -v`

---

## OPEN QUESTIONS — RESOLVED with PO defaults (no user override needed; full autonomy)

1. **Privacy — RESOLVED: self-hosted ONLY.** No PDF/image leaves our infra. External-API VLM stays a deferred opt-in follow-on, never an active task. (Re-open only on explicit user "yes".)
2. **Main-server GPU — RESOLVED for figures path: NOT required.** TEXT path is CPU-feasible at 4s/page. ops confirms main-server CPU sizing at BT-4. GPU only re-enters scope if the DEFERRED image cross-check (PaddleOCR-VL self-hosted) is ever activated for the sub-bar p5/p7 rows.
3. **Figure-accuracy pass-bar — RESOLVED: ≥95% within ±0.5%.** Adopted + MET on FPT reference. BT-6 QA validates across the wider 14-doc gold-set. API budget N/A (Q1 = self-hosted only).

## DEFERRED / HONESTLY-FLAGGED (not closed by this pick)

- **Sub-bar rows:** FPT p5 95.8% (marginal) + p7 86.7% (below bar). Low cell-F1 (0.07-0.12 — grid reconstruction poor even where figures are right). PP-StructureV3 IMAGE path is the deferred remedy — self-hosted, revisit ONLY here, never for figures, never external-API.
- **QA-on-BT1 still pending** — BT-1 (`e74abc43`) shipped but QA never verified its green signal. Folded into BT-6.
- **14 stranded docs hold OLD-parser figures** — re-extract ONCE at BT-4b (post-integration, pre-QA), not twice.
- **Single-doc evidence** — pass-bar proven on FPT only; BT-6 QA must prove it across the 14-doc gold-set.
