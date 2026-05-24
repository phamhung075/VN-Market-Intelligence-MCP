# Sprint KD-QREF-LANG Goal — 64-Quẻ Trading Reference EN/VI Language Switch

**Status:** OPEN 2026-05-24T18:51Z (PO self-initiated from explicit user feature request, routed via main terminal). **Severity:** MEDIUM (product surface — i18n on a shipped reference panel; no incident). **Owner chain:** architect (KD-QREF-LANG-1 i18n design) → dev-kinh-dich (KD-QREF-LANG-2 implement) → qa (KD-QREF-LANG-3 verify) → PO (KD-QREF-LANG-EXIT sign-off). **Zone:** `apps/kinh-dich-service/` ONLY (single zone). **WIP:** sequential within the chain (fleet WIP=2 cap still applies).

> FOLLOW-ON #2 to KD-QREF (the bilingual EN-primary panel shipped `0b401124`, data regenerated `e9608167`). POST-PILOT enhancement on the SAME `.qref-*` panel. The kinh-dich Go-reboot SCALE pilot is DONE 12/12 (verdict=scale) and STAYS DONE + frozen; this does NOT reopen, alter, or touch any pilot goal, `decisionMatrix`, or `pilot-status-kinh-dich.json`.

---

## Vision

The user (France-based, monitors the VN market) shipped the 64-Quẻ Trading Reference panel and now wants to read it in EITHER full English OR full Vietnamese, by their own choice. Today the panel is bilingual EN-primary (English prose + VN names/glyphs verbatim + bilingual trend labels). The user wants a real LANGUAGE SWITCH: a full EN view and a full VI view, toggled in the panel header, with their choice remembered across reloads. The Vietnamese view reuses the authoritative rich VN source (`que_convert/*.md`) — the original market-framed text — not a machine round-trip of the English.

## Scope

**IN:**
- An **EN | VI toggle control** in the `.qref-header`, inside the `.qref-*` namespace, trust-gate safe.
- **Both languages carried in the Go SSOT** (`hexagram_reference.go`) for every textual field — core meaning, market-state interpretation, favorable condition, warning, market-trend label, all 6 per-phase glosses — emitted to `que-reference.js` (never fetched, never hand-typed in HTML).
- **Localized static chrome:** panel title/description, section headers (Trigrams / Favorable Condition / Market State Interpretation / Six Phases), phase-table column headers, trend legend — all swap with the toggle (a real VI view, not VI prose in English chrome).
- **localStorage persistence** (`kd-qref-lang`, file:// safe, try/catch guarded → EN fallback).
- VI text reused/lightly-trimmed from `que_convert/*.md` — verbatim VN, authentic, no machine retranslation.

**OUT:**
- Whole-dashboard i18n — the 3 trust panels, sandbox runner, `sandbox-traces.js`, modal, edit-rerun handler stay FROZEN and English (panel-only scope, D3).
- Any 3rd language, runtime translation pipeline, or language fetch.
- Wiring `/hexagram/{number}/explain` to serve the localized data (future; the `{en,vi}` shape must merely not preclude it).
- Re-deriving any que line-data scoring (`queDataMap` action/outcome stay as-is).

## Decisions (PO authority — final; full rationale in the decision note)

D1 default EN · D2 localStorage persistence (file:// safe, EN fallback) · D3 `.qref-*` panel ONLY · D4 both langs in Go SSOT → emitted JS, nested `{en,vi}` recommended · D5 EN|VI control in `.qref-header`, static labels localize, no `dot-*`/`.category-chip`/"not wired"/fetch/CDN.

## Binding DoD

`node dashboard/dash-check.mjs` stays exit-0 with the toggle present (EN and VI states); 3 trust panels + 17 sandbox dots + modal + `sandbox-traces.js` + edit-rerun handler UNCHANGED; all 64 entries carry BOTH a non-empty EN and a non-empty VI for EVERY textual field (no gap, no placeholder, no "TODO translate", no English in a VI field); proper nouns (name VN + glyph) + action/outcome tokens identical in both views.

## References

- Decision: `docs/po-decisions/2026-05-24-kinh-dich-que-reference-language-switch.md`
- Spec + per-task ACs: `docs/handoffs/TASK_KD-QREF-LANG.md`
- VI source (read-only, outside repo): `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/`
- Current SSOT extended: `apps/kinh-dich-service/pkg/module/reading_composer/hexagram_reference.go`
- Render contract: `apps/kinh-dich-service/dashboard/index.html` (`renderQueReference()` @ ~2288, `.qref-*` styles @ ~787) + emit `cmd/sandbox/main.go -emit-reference`

---

## Prior Sprint Closure — PDF-INSPECT (Side-by-Side PDF / Extracted-Text Inspector) — DONE+CLOSED (RE-SIGNED) 2026-05-24T19:34Z

**Verdict: DONE on REAL data, after a premature first close + TWO real-data reopens.** Full task table + reopen trail + corrected done-condition: `docs/TASKS.md` § Sprint PDF-INSPECT. Spec + every agent record: `docs/handoffs/TASK_PDF-INSPECT.md`.

**Honest history (not erased):**
- **Premature first close (`97cd5763`, 17:47Z):** signed off against FIXTURE data on a local uvicorn (`localhost:15001`). At deploy the viewer was EMPTY on real data → REOPEN.
- **REOPEN-1:** inspector read the WRONG store (pdf-extractor `pdf_extractor.db` = 15,570 junk rows). Real BCTC data is in mcp-server's `market.db`. Inspector **MOVED to mcp-server** (impl owner dev-pdf-extractor → **dev-mcp-server**); built `/api/bctc-inspect` (`1b5799fb`). QA found all 14 `financial_reports` rows had `pdf_path=NULL` → list count:0 (`127cb347`).
- **REOPEN-2:** `backfillBctcPdfPaths` token-matches 14 rows → 17 on-disk PDFs + all-rows LIST + secondary OCR join (`69da9d01`). QA re-verify on REAL `market.db`: count=14, 12 has_pdf, 14 has_ocr, 7 decimal-shift flags; VNM real PDF rendered LEFT + Vietnamese OCR + decimal-shift banner RIGHT (`3098c69d`). PASS.

**Corrected done-condition (supersedes premature close):** "DONE" = the served viewer renders REAL rows from the deployed container's `market.db` (verified row count + non-null-rate of relied-upon columns), NOT fixtures, NOT schema-existence.

**User-facing URL (LIVE NOW):** `http://localhost:3000/api/bctc-inspect` (mcp-server rebuilt from `69da9d01`; container running). The old `localhost:15001/inspect` (and the pdf-extractor `localhost:5001/inspect`) are fixture-only/deprecated.

**Out-of-scope follow-ups (surfaced, non-blocking):** (i) pipeline defect `fetchParseAndStoreBctc.ts:645 tryNewsChainFallback` inserts `pdfPath:null` even when a PDF exists — dev-mcp-server pipeline task; (ii) `pdf_extractor.db` polluted with 15,570 test rows in the prod volume — ops/dev cleanup.

**Meta-lesson (3 straight defects, same root):** for any data-bound feature, BOTH the design AND the QA gate must be validated against a live sample of the REAL store — real row counts AND null-rates of the columns relied upon AND the ingest path that populated the current rows — not schema-existence or seeded fixtures. Same family as the file:// L9 lesson (verify under the user's REAL path). Pilot UNTOUCHED — pdf-extractor SCALE pilot stays DONE 12/12 frozen; `pilot-status-pdf-extractor.json` not edited.
