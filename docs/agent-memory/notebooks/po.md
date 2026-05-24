# PO Notebook

**Cycle:** PDF-INSPECT REOPEN-2 FINAL RE-SIGN — DONE on REAL data after a premature first close + 2 real-data reopens.
**Last update:** 2026-05-24T19:36:04Z
**Status:** RATIFIED. User-facing URL `http://localhost:3000/api/bctc-inspect` LIVE NOW. Meta-lesson recorded. PIPELINE complete.

---

## 2026-05-24T19:34Z — PDF-INSPECT: final re-sign on REAL data (3rd close, the honest one)

QA REOPEN-2 PASS (`3098c69d`) on the REAL deployed container (mcp-server rebuilt from `69da9d01`, port 3000): `/api/bctc-inspect/docs` count=14 real BCTC docs (NOT 0, NOT 15,552 junk), 12 has_pdf, 14 has_ocr, 7 decimal-shift flags. Playwright: select VNM Q4 2025 → LEFT real 4.1MB VNM PDF rendered (signed cover), RIGHT decimal-shift banner (OCR 0.0001 vs API 2,840,370 M VND) + real Vietnamese OCR. Safety/regression/write-safety PASS, 64 tests, tsc 0. PO independent spot-check (disk+git): `69da9d01`/`0245ff4c`/`3098c69d` all zero-foreign; deliverable files on disk.

USER ACCEPTANCE GENUINELY MET: the VNM decimal-shift bug is visible BY EYE beside the rendered real PDF — the literal user intent ("select a PDF → original LEFT, extracted RIGHT, side-by-side, to compare").

HONEST TRAIL (not erased in TASKS.md/SPRINT_GOAL.md): premature first close `97cd5763` (17:47Z) proven on FIXTURES (uvicorn localhost:15001) → empty on deploy → REOPEN-1 (inspector read wrong DB `pdf_extractor.db` 15,570 junk rows; MOVED pdf-extractor→mcp-server, owner dev-pdf-extractor→dev-mcp-server, built `/api/bctc-inspect` `1b5799fb`; QA found all 14 rows pdf_path=NULL, count:0 `127cb347`) → REOPEN-2 (backfill `pdf_path` 14→17 PDFs + all-rows LIST + secondary OCR join `69da9d01`; QA PASS `3098c69d`).

OUTPUTS this cycle: TASKS.md PDF-INSPECT block (corrected done-condition + reopen trail + 11-row task table); SPRINT_GOAL.md "Prior Sprint Closure — PDF-INSPECT" section (KD-QREF-LANG vision kept); handoff `[QA] REOPEN-2 PASS` already on record; sign-off signal `po-pdf-inspect-reopen2-signoff-20260524T193604Z.json` (supersedes `po-20260524T174710Z.json`); this notebook. NO pilot-status edit. NO send_telegram (not PO surface).

## Carry-over
- LESSON (META — the important one, 3 straight defects same root): for any DATA-BOUND feature, BOTH the DESIGN and the QA gate MUST be validated against a live sample of the REAL store — real row counts AND null-rates of the relied-upon columns AND the ingest path that populated current rows — not schema-existence or seeded fixtures. Premature sign-off happened because acceptance was proven on FIXTURES, not the deployed real-data path. Same FAMILY as file:// L9 (verify under the user's REAL path). Bake into every architect design that reads an existing table: before specifying a `WHERE col IS NOT NULL` filter, `docker exec` the null-rate on REAL data first; if >0, design the degrade path first.
- PDF-INSPECT out-of-scope follow-ups (surfaced, do NOT block): (i) `fetchParseAndStoreBctc.ts:645 tryNewsChainFallback` inserts pdfPath:null even when a PDF exists → dev-mcp-server pipeline task (findExistingPdf at insert time); (ii) `pdf_extractor.db` 15,570 junk test rows in prod volume → ops/dev cleanup. Both recorded in signal + TASKS.md.
- PDF-INSPECT live NOW at `http://localhost:3000/api/bctc-inspect` (no further deploy needed; QA already rebuilt mcp-server). Old `localhost:15001`/`5001/inspect` are fixture-only/deprecated.
- COMMIT: dev agents can't acquire commit-mutex (gateway absent + task_claim enum lacks kind). My docs staged-clean in-tree; MAIN TERMINAL serializes the commit (heavy fleet race — many foreign M/?? in tree). Explicit-file staging only.
- KD-QREF-LANG: still BLOCKED behind architect KD-QREF-LANG-1 (i18n design). NF-LD-4 OPEN behind architect; stock-price Phase-0 READY; TA Phase-2 in flight; pdf-extractor Phase-1 OPEN.
- PATTERN: pdf-extractor SCALE pilot stays DONE 12/12 frozen — this inspector is a POST-PILOT dev tool on mcp-server, NOT a pilot task; pilot-status never touched.
