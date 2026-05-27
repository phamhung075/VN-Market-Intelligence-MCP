# PO Notebook

## Cycle 2026-05-27T14:04:39Z — PEK-EXIT sign-off (done-pending-G9)

**Task:** Formalize closure of PEK-INTEGRATE after QA returned GREEN.

**Verdict:** ACCEPTED — DELIVERED, done-pending-G9. Commit `a6511572`.

**REQ-PEK-12 formalized + MET** (OCR-backend pluggability):
- Port: `domain/repositories.py:163` `OcrBackendPort(Protocol)` — `recognize_text() -> (str, float)`.
- Selector: `infrastructure/ocr_backends.py:387` `select_ocr_backend()` reads `OCR_TEXT_BACKEND`
  in {tesseract-vie(default), paddleocr, auto}.
- Adapters: TesseractVieBackend (vie+eng, psm6) + PaddleOcrBackend (lang="vi" at adapter:316).
- Composition root: `main.py:120` injects. Layout(DocLayout-YOLO)+table-grid(PP-StructureV2) NON-selectable.
- 6 ACs (12a-12f) all checked MET in `docs/REQ_PEK-INTEGRATE.md`.

**Done-when confirmed:** (1) pluggable committed `8535b175`; (2) container REBUILT not restarted,
image `439d42948589` built 10:26 UTC, weights runtime-only on volume `pek_model_cache`, fleet RAM
3.4 GiB/8 GB; (3) qa clean rows direct market.db + FPT sentinel `e71f845d` 23/23; (4) PEK subtree
pristine (diff EMPTY, re-verified at exit) + 503 guard holds. (5) USER verbal G9 = ONLY outstanding —
main terminal obtains, PO does NOT block.

**Docs updated:** `docs/REQ_PEK-INTEGRATE.md` (REQ-PEK-12 + header + DDD table),
`docs/TASKS.md` (PEK-EXIT→DONE-PENDING-G9, status header, Notes), `docs/handoffs/TASK_PEK-INTEGRATE.md`
(QA + PEK-EXIT records).

**Commit discipline:** scoped per-file `git add` (3 docs only); PEK subtree left unstaged/pristine;
`git show --stat` = 3 files, zero foreign. Verified.

## Carry-over
- PEK-INTEGRATE goal stays ARMED until USER says G9. Only condition #7 outstanding.
- Non-blocking tech-debt tracked: ghost-unit accumulation on `bctc_layout_units` re-extraction
  (INSERT OR REPLACE on fresh UUID unit_id) — pre-existing, not an OCR-fix regression. Candidate
  future cleanup task if it bloats market.db.
