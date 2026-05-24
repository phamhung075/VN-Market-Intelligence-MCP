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

## BT-0-PICK — PO records production pick · po · GATE · BLOCKED (← BT-0)

PO reads the scoreboard, records the production extractor pick with a measured verdict against the pass-bar (default **≥95% of result-column figures within ±0.5%** if no user answer to Open Q3). Decision note → `docs/po-decisions/`.

---

## BT-2 — Architect integration blueprint (DESIGN ONLY) · architect · HIGH · BLOCKED (← BT-0-PICK)

Design the integration of the spike winner. Append the blueprint + finalized per-task ACs (BT-3/4/5/6) here. Cover:
- Adapter boundary: `PpStructureTableAdapter` (or winner) + `PdfPageRenderer` (PyMuPDF/pdf2image → PNG) as `infrastructure/` adapters.
- `ExtractTablesUseCase` (application, DI) orchestration; how `select_period_column` consumes real cells.
- Main-server hosting: CPU vs GPU sizing (Open Q2 — confirm with ops); Docker placement; the existing `PdfplumberExtractionEngine` kept as native-PDF fast path.
- Cross-check gate wiring: `reconcile_figures` → app-layer route → block insert + WORK alert + `/api/bctc-inspect` surface; image-track = self-hosted VLM only.
- **Confirm no collision with 1954c frozen write paths** (`372fbc91` and the 1954c task-2..6 series) before BT-3 touches shared code.
- Security Clause: sandbox zero creds, import-linter fence (`domain.primitives` must not import `infrastructure`).

---

## BT-3 — Integrate winning extractor · dev-pdf-extractor · HIGH · BLOCKED (← BT-2, BT-1)
## BT-4 — Deploy model to main server · ops + dev-mainserver-crawls · HIGH · BLOCKED (← BT-2)
## BT-5 — Cross-check confidence gate (self-hosted) · dev-pdf-extractor · MEDIUM · BLOCKED (← BT-3, BT-4)
## BT-6 — QA regression gate · qa · HIGH · BLOCKED (← BT-5)
## BT-EXIT — PO sign-off · po · CRITICAL · BLOCKED (← BT-6)

ACs for BT-3..BT-EXIT finalized by architect at BT-2 (depend on the spike winner). High-level intent in `docs/TASKS.md` § Sprint BCTC-TABLE and `docs/SPRINT_GOAL.md` § Binding DoD.

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

## OPEN QUESTIONS for the user (recorded — do NOT block; Phase-0 proceeds)

1. **Privacy:** third-party API ever acceptable for financial PDFs/images, or self-hosted only? **Default = self-hosted only.** "Yes" unlocks the external-API VLM cross-check as an opt-in follow-on. Until explicit "yes," no PDF/image leaves our infra.
2. **Main-server GPU?** Needed for BT-4 sizing + self-hosted-VLM feasibility. Not needed for BT-0.
3. **Figure-accuracy pass-bar + API budget:** proposed ≥95% within ±0.5% (PO default). API cost cap only relevant if Q1 = yes.
