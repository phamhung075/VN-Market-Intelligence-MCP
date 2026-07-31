# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

---

## Cycle 2026-07-30 — FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW

**Sprint:** n/a (BOUNDED-1 auto-pickup) | **Zone:** apps/pdf-extractor/ | **Size:** S | P2

### Bug
Follow-up flagged in FIX-PDFX-TESSERACT-CONCURRENCY §10.3: `_ocr_page()`'s
`except Exception: return ""` swallowed ANY OCR failure (tesseract crash,
corrupt raster) as if extraction succeeded. Combined with the quality gate
(services.py:71 `ocr_conf<0.5 AND not tables` => reject), a doc with any
table + zero OCR text passed the gate and was persisted as a hollow
"success" — indistinguishable from a genuine blank scanned page.

### Fix
New `OcrPageFailedError(PDFProcessingError)` (domain/errors.py). `_ocr_page`'s
generic except now raises it (`from exc`) instead of `return ""`.
`_extract_text_ocr_sync`'s propagation tuple extended alongside the
pre-existing `OcrCapacityExceededError`/`OcrDeadlineExceededError` (already
propagated correctly — this closed the one remaining gap). Zero changes
needed to services.py/usecases.py/HTTP layer — process_pdf()'s existing
`except PDFProcessingError` branch already marks doc failed, never reaches
store_extraction(). Negative control (blank page: OCR succeeds returning
"") unaffected. Prior-art checked: FIX-ERRAUDIT-W3-PEK-P2 targets a
different method in the same file (`_extract_tables_sync` bare-except,
services.py `validate_or_unknown`) — zero overlap, grep-confirmed.

### Verify
New `test_extraction_engine_ocr_failure_swallow.py` (12 tests, both
directions at `_ocr_page` + `_extract_text_ocr_sync` levels) + 2 new tests
in `test_extract_pdf_service.py`. Falsification: reverting the 2 source
files makes the new test module fail COLLECTION (ImportError:
OcrPageFailedError undefined) — confirms load-bearing. Full suite: 1056
passed + 3 pre-existing env-only failures (missing pandas, missing
container-only PDF fixture) unchanged before/after. import-linter: 3/3
kept. mypy: same pre-existing baseline noise, 0 new errors.

### Commit
`200eabcf3` fix(pdf-extractor/fix-pdfx-extraction-engine-empty-string-swallow)

### Status
REVIEW → next_agent=qa

Zone health: flow/main.md's G12 sandbox gate (`sandbox_runner.py`) still
references a script absent from the repo — pilot-status shows the SCALE
pilot closed DONE 2026-05-24; stale doc-drift, not a new finding this cycle.

---

## Cycle 2026-07-30 — FIX-BCTC-LAYOUT-PUSH-FAILURE-NETWORK-DEADLOCK (diagnostic, no code)

**Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP | **Zone:** multi (co_owner) | P0

### Finding
ops's "no caller of `/extract-layout-first`" was a red herring — that
endpoint (`ExtractLayoutFirstUseCase`, LF-EXTRACT) is genuinely dead/unwired
code, never the producer of `bctc_layout_units`. The real, live PEK-layout
trigger is `POST /pek-extract`, fired by `bctcPdfPullJob.ts` (initial) and
re-fired by `bctcExtractReconcileJob.ts` (retry, `5,35 * * * *`) — both
registered in `schedulerJobTable.ts` and RAW-confirmed firing on schedule
via `cron_job_runs`. Dormancy root cause: `bctc_vps_queue` held 0 `pending`
rows (no new filings) AND 0 `pek_triggered` rows (all 128 already exhausted
`MAX_RECONCILE_ATTEMPTS=8` into terminal `enrich_failed` by 2026-07-28
21:35Z, during/just after the OCR-concurrency stall). `FIX-PDFX-TESSERACT-
CONCURRENCY` (commit `4bac2b85d`) — the actual root-cause fix for the
07-28 11:06-18:04 stall — was already deployed in the running image.

### Live end-to-end verification (no code change)
Manually re-fired `POST /pek-extract` for DPM 2025-Q4 (terminal
`enrich_failed`, valid `pdf_path`) directly against the live containers:
202 Accepted → PekEngineAdapter processed 52/52 pages (~368s, OCR gateway
semaphore/os_children matched throughout) → push succeeded → raw DB COUNT
confirms `bctc_layout_units` 1193→1245 (fresh rows, `2026-07-30 20:05:13`).
Pipe conclusively unclogged. DPM's own `bctc_vps_queue` row still reads
`enrich_failed` (my test bypassed that table — mcp-server-owned, out of
zone) — flagged, not fixed; bulk 128-row backlog recovery explicitly out
of this task's AC per handoff.

### Status
Journal: `docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-
CATCHUP-dev-pdf-extractor.md`. Flipped board row to REVIEW (no diff to
hand QA — evidence-only close). Flagged PO re: SPIKE-BCTC-EXTRACTION-
DORMANT-MASS-ENRICHFAIL-FLOOD (did not flip that row myself, per handoff).

---

## Cycle 2026-07-31 — FIX-CI-SIZELINT-PDFX-EXTRACTION-ENGINE-TOLERANCE

**Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP | **Zone:** apps/pdf-extractor/ | **Size:** S | P0

### Root cause
`extraction_engine.py` baseline-tolerance-exceeded: 208L baseline
(2026-07-29) grew to 237L (9L past 228L upper tolerance), 100% from commit
200eabcf3 (FIX-PDFX-EXTRACTION-ENGINE-EMPTY-STRING-SWALLOW, prior cycle
above), which restated the same OcrCapacityExceededError/OcrDeadline
ExceededError/OcrPageFailedError propagation rationale near-verbatim in 3
places (2 docstrings + 1 inline comment).

### Fix
No re-baseline (AC-2 landmine avoided, `size-lint-baseline.json` untouched).
Deduplicated the 3x-repeated rationale into 1 canonical paragraph on
`_extract_text_ocr_sync`'s docstring; `_ocr_page`'s docstring and the
except-clause comment now point back to it instead of restating. 237L →
226L. Zero functional/behavioral change — comments/docstrings only.

### Verify
`size-lint-justification.sh --check`: file no longer listed (1 unrelated
macro-indicators offender remains — out of this task's scope, per AC-1
file-level gate). Full `pytest -q`: 1058 passed / 1 pre-existing env-only
fail (missing `/app/data/pdfs/...` container fixture — `git stash`/pop
confirmed identical failure before/after, unrelated to this change).

### Commit
`d808a6a11` fix(pdf-extractor/fix-ci-sizelint-pdfx-extraction-engine-tolerance)

Zone health: no drift detected.

### Status
REVIEW → next_agent=qa
