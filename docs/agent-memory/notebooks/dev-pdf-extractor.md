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

---

## Cycle 2026-08-23 — FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE

**Sprint:** COWORK-GUARANTEED-SLOT-CATCHUP (BOUNDED-1 auto-pickup) | **Zone:** apps/pdf-extractor/ | **Size:** M | P0

### Defect
`_extraction_semaphore.acquire(blocking=False)` raised `SemaphoreContendedError`
the instant the single extraction slot was held. `bctcExtractReconcileJob.ts`
re-fires its whole `pek_triggered` batch (DEFAULT_BATCH_SIZE=20) per 30-min tick
with no pacing, and `/pek-extract` returns 202 before the BackgroundTask starts —
so one tick raced up to 20 detached threads for one slot. The 19 losers raised
inside the detached task, were swallowed by `pek_run_helper.py`'s bare
`except Exception`, and were still counted `refired`, burning one of
MAX_RECONCILE_ATTEMPTS=8 for a run that never happened.

### Fix
Bounded-blocking acquire — `acquire(blocking=True, timeout=wait)` — reusing the
shape already shipped at `ocr_gateway.py` `_OCR_SLOTS`/`_acquire_slot_blocking`.
New `PEK_SEMAPHORE_WAIT_SECONDS` env knob (default 30min = same order as
`PEK_EXTRACTION_TIMEOUT_SECONDS`) + `wait_s` per-call override for tests.
Exception class and `try/finally` release unchanged; only the message and the
trigger condition change, so pathological queue depth still fails loud.
Also corrected the "contention → HTTP 429" claim in 4 docstrings/comments — it
was never reachable on the 202/BackgroundTask path and is what sent the first
investigation down the wrong branch.

### Verify
Honest-RED first: with the old acquire restored, AC-5/AC-6/AC-7 all fail and
AC-7 reports *"contended batch LOST 2 of 3 members"* — the defect itself,
reproduced in a test. After fix: 1062 passed / 0 failed (full non-slow suite,
also green under 3 randomized orderings). Sandbox G12 gate: 30 scenarios green,
0 red, 6 negative fixtures correctly red. import-linter 3/3 contracts KEPT.
mypy strict: 41 errors before AND after (git-show A/B) — zero new.

**AC-8/AC-9 NOT-RUN — structural, not skipped.** Container is 8d old and still
runs `blocking=False` at :657 with no `PEK_SEMAPHORE_WAIT_SECONDS` in env, and
`bctc_vps_queue` now holds ZERO `pek_triggered` rows (all 56 `enrich_failed` are
at reconcile_attempts>=8), so no reconcile batch can fire even after rebuild.

### Learned
1. **A quiet log is not a fixed system.** The 08-23 window has zero
   `SemaphoreContendedError` — because the queue drained to zero eligible rows on
   08-22, not because anything improved. Always check the *traffic* denominator
   before reading an error count as an improvement. (PO hit this exact false-read
   on 2026-08-15.)
2. **PO's AC-8 caveat was half wrong, in the useful direction.** It assumed the 3
   named ids would never be re-selected. The live log refutes that for 2 of 3 —
   HUT `dab264ae` was re-fired 2026-08-22T14:38:19Z and BSR `d332bf35` at
   13:14:03Z, and *both lost to `SemaphoreContendedError` again*. The real blocker
   is that the queue has since drained completely.
3. **Direct proof the PDFs are innocent:** KDC 2023-Q4 (`5b94f8c5`) lost the race
   at 13:34:51Z, then won at 13:39:55Z and produced 50 layout units. Same file,
   same engine — only the race differed.
4. **Order-dependent `sys.modules` leak, 2nd occurrence in this zone.** Found and
   fixed a pre-existing flake (`test_extract_layout_and_tables_raises_on_timeout`,
   ~40% of seeds): `test_extraction_timeout_reads_from_env` restored `sys.modules`
   but not the *parent-package attribute*, so afterwards
   `import infrastructure.pek_engine_adapter as m` (getattr path) and
   `from ... import X` (sys.modules path) returned **different module objects** —
   every later monkeypatch via `m` silently mutated a module the adapter never
   reads. Same defect class as FIX-PDF-EXTRACTOR-TEST-SYS-MODULES-LEAK, different
   file. Restore BOTH, always.

### Commit
`3db7a8dc8` fix(pdf-extractor): bound the PEK extraction semaphore wait

Zone health: pytest 1062 pass / 0 fail (was 1062 pass with ~40%-of-seeds flake, now deterministic); sandbox G12 30/30 green; import-linter 3/3 KEPT; mypy strict 41 pre-existing errors in pek_engine_adapter.py (bare `Dict` type-args + unused-ignores) — untouched debt, flagged not fixed. `python -m mypy . --ignore-missing-imports` (the agent-def documented command) is BROKEN repo-wide: fails "pdf-extractor is not a valid Python package name" — pre-existing tooling drift. Flow doc's `sandbox_runner.py --scenario=all` also does not exist (real path `sandbox/runner.py`, one scenario file per invocation). | HEALTHY

### Status
REVIEW → next_agent=qa (REBUILD_REQUIRED — AC-8/AC-9 blocked on deploy + a live pek_triggered cohort)
