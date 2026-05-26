# PO Notebook

**Cycle:** PEK-INTEGRATE REQ amendment (post-PEK-DESIGN, architect R-CRIT flags) — 2026-05-26T21:03Z.
**Last update:** 2026-05-26T21:03:47Z
**Status:** REQ AMENDED + re-stamped APPROVED. PEK-IMPL UNBLOCKED → dev-pdf-extractor. Files UNSTAGED — main terminal commits (scoped add, never -A).

---

## 2026-05-26T21:03Z — PEK-INTEGRATE REQ amended (2 PO-owned blockers resolved) → dev-pdf-extractor

Architect (PEK-DESIGN, brief `2026-05-26-pek-integrate-design.md`, commit `1fbf017f`) surfaced 3 CRITICAL flags. 2 were PO-only REQ amendments blocking PEK-IMPL; resolved this cycle.

**AC-PEK-3a REWRITTEN (R-CRIT-1):** prior literal demanded source tree ABSENT (`ls /app/PDF-Extract-Kit` = No such file) — mutually exclusive with the architect's chosen `pip install -e ./PDF-Extract-Kit` editable install (source MUST be present at runtime for `pdf_extract_kit` import). New invariant = **zero-diff, NOT absence**: (a) `.git/` excluded from image, (b) weights NEVER baked (image < 2GB via `docker image inspect`), (c) `git -C apps/pdf-extractor/PDF-Extract-Kit diff` EMPTY. User constraint "repo publish, dont touch" = zero-diff, not absent.

**REQ-PEK-11 APPENDED (AC-PEK-NEW-1 + NEW-2, verbatim brief §10):** market-hours isolation, user hard constraint "pdf service never run on market open." NEW-1 = `POST /pek-extract` HTTP 503 + no RSS rise at Mon 03:00 UTC sim-open; NEW-2 = `bctcReparseJob` cron not 02:00–08:59 UTC weekdays (`CRON_BCTC_REPARSE_JOB=0 21 * * *`). Done-Bar now SEVEN cond (#6 market-hours). Spec = 11 reqs, 37 ACs.

**R-CRIT-2 + R-CRIT-3 — no REQ change (architect resolved in-brief), NOTED for dev:** R-CRIT-2 no TableMaster in clone → PaddleOCR PP-StructureV2 table mode directly. R-CRIT-3 StructEqTable hard-asserts CUDA → import guard, NEVER `TableParsingTask`/`FormulaDetectionTask`, unit test asserts no CUDA import.

**Wrote (all UNSTAGED):** REQ header re-stamp + amendment note + AC-PEK-3a rewrite + REQ-PEK-11 + DDD-table row + Done-Bar #6; handoff [PO] append; TASKS PEK-IMPL row + amendment Note.

**Dispatch:** NEXT = dev-pdf-extractor | PEK-IMPL against amended spec.

---

## Carry-over
- PEK-IMPL ground truth for dev: editable install (source present, zero-diff), layout+ocr only via PaddleOCR PP-Struct (no TableMaster/StructEqTable), import guard, lazy-load singleton + Semaphore(1), market-hours guard 503 + cron 0 21 * * *, `.dockerignore` `.git/`+`models/`, weight cache named volume `pek_model_cache`, image < 2GB.
- Pipeline: PEK-IMPL → PEK-DEPLOY (ops REBUILD not restart, AC-10) → PEK-QA (direct market.db rows + FPT sentinel `e71f845d-...` + RSS + pristine git-diff + market-hours 503) → PEK-EXIT (po) → USER G9.
- DoD = scale-pilot bar, 5 prior false-greens; NOT-RUN ≠ green; measured corpus pass-rate not one doc.
- BCTC-LAYOUT-FIRST LF-EXTRACT chain PAUSED — do not let both sessions edit pdf-extractor concurrently. Concurrent docker rebuild = 16GB host kernel-panic risk; serialize ops hops.
- Next PO hop = PEK-EXIT after PEK-QA returns (independent LIVE re-verify, then main terminal commits in-tree work).
