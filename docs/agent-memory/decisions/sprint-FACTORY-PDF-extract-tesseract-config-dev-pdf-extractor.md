# Decision Journal — Sprint FACTORY-PDF-extract-tesseract-config · dev-pdf-extractor

**Sprint goal:** Extract the duplicated Tesseract OCR config (lang/psm/DPI + its
"DO NOT remove --psm 6" warning) into a single shared module, byte-exact.
**Agent:** dev-pdf-extractor
**Started:** 2026-07-24T09:14:31Z

---

### STEP dev-pdf-extractor-S1 · dev-pdf-extractor · 2026-07-24T09:30:36Z
**task-id:** FACTORY-PDF-extract-tesseract-config
**what-done:** Created `apps/pdf-extractor/infrastructure/tesseract_config.py`
(`TESSERACT_LANG="vie+eng"`, `TESSERACT_PSM6_CONFIG="--psm 6"`,
`OCR_RASTER_DPI=200`) and rewired all 6 real call sites behind the 5 named
files to import the constants instead of inline literals.
**what-considered:**
- Thin `ocr_image_to_string`/`ocr_image_to_data` wrapper functions (ticket's
  "optionally") vs constants-only — chose constants-only: call sites differ
  (image_to_string vs image_to_data w/ DATAFRAME vs DICT output_type, lazy
  vs injected `pytesseract` import, differing exception handling already
  covered by existing tests). Wrappers would add indirection risk for zero
  behavior gain; constants-only keeps every call byte-identical.
- `generic_md_table_extractor.py` (ticket's file #4) is itself a thin
  re-export shim (FACTORY-PDF-split-generic-md-table) — the actual literal
  call sites resolved to `generic_md_table/extractor.py` (`_stage_a_tokenize`)
  and `generic_md_table/unit_ocr.py` (`ocr_unit` call site). Verified via
  grep before editing so no file was missed.
**why-decision:** Lowest-risk path that satisfies "IDENTICAL pytesseract
invocation" — confirmed via git-HEAD grep diff + full test suite (no new
failures) + mypy (0 new errors vs 141 pre-existing baseline, unaffected).
**why-change:** No change from plan; `RASTERIZE_DPI` (BCTC_RASTERIZE_DPI env
var, PaddleOCR-fallback path in ocr_adapter.py/ocr_worker.py) intentionally
left untouched — separate constant, separate semantics, out of ticket scope.

---

### STEP dev-pdf-extractor-S2 · dev-pdf-extractor · 2026-07-24T09:30:36Z
**task-id:** FACTORY-PDF-extract-tesseract-config
**what-done:** Trimmed the duplicated multi-line "DO NOT remove --psm 6"
warning at each of the 6 call sites to a one-line pointer at the authoritative
source; consolidated full rationale (drift #4, BT3-FIX3-PSM root cause) into
`tesseract_config.py`'s module docstring as the single authoritative copy.
**what-considered:**
- Delete all narrative mentions everywhere vs keep short pointers — kept
  short pointers (searchable phrase "DO NOT remove --psm 6" retained as a
  1-line breadcrumb) so `grep` still finds every call site from the warning,
  while the actual multi-paragraph rationale text exists in exactly one file.
**why-decision:** Ticket's EQUIVALENCE check requires "the warning now lives
in exactly one place" — verified via `grep -rn "DO NOT remove"
infrastructure/`: 1 full-rationale copy (tesseract_config.py) + 6 one-line
pointers, 0 remaining multi-line duplicates.
**why-change:** No change from plan.

---

### STEP dev-pdf-extractor-S3 · dev-pdf-extractor · 2026-07-24T09:30:36Z
**task-id:** FACTORY-PDF-extract-tesseract-config
**what-done:** Updated `docs/architecture/microservice/pdf-extractor/
infrastructure.md` (new "Tesseract OCR Configuration (shared)" section +
2 snippet updates) per doc-review flow (infrastructure/ layer touched).
Skipped `/graphify` — incremental doc addition, no new architectural
concept, consistent with prior small pdf-extractor doc commits (git log
shows doc+code committed together without a separate graphify pass for
comparable-size deltas).
**what-considered:** only path — doc-review flow explicitly scopes to
layers touched; graphify optional/skippable for trivial doc deltas per
Implementation Record template ("skipped (no docs impacted)" precedent).
**why-decision:** Proportionate to P2/effort=M/risk=low task; avoids scope
creep into an unrelated heavy tool invocation.
**why-change:** No change from plan.

---

### STEP dev-pdf-extractor-S4 · dev-pdf-extractor · 2026-07-24T09:30:36Z
**task-id:** FACTORY-PDF-extract-tesseract-config
**what-done:** SCOPE BOUND observed — CODE-ONLY, no rebuild, no container
touch (user already rebuilt; live rebuild-verify explicitly deferred per
task instructions). `sandbox_runner.py` (G12 DoD gate referenced in
`docs/agents/dev-pdf-extractor/flow/main.md`) does not exist anywhere in
this repo (confirmed via repo-wide find) — pre-existing doc/flow drift, not
introduced by this task. G12 sandbox gate is therefore not executable;
relied on the agent's actual `test_command` (`python -m pytest`, defined in
`docs/agents/dev-pdf-extractor/init.md`) as the real, executable DoD gate.
**what-considered:** only path — cannot fabricate a sandbox pass for a
script that does not exist; flagging honestly instead.
**why-decision:** NO-FABRICATION constraint — verify actual tool existence
at source before claiming a gate result.
**why-change:** Deviates from main.md's G12 instruction only because the
referenced script is absent from the repo; not a task-scope decision.

---

## Equivalence evidence (unit-level — live rebuild-verify deferred, user-gated)

**Pre-refactor literals (git HEAD, `git show HEAD:<path> | grep`):** all 6
call sites confirmed `lang="vie+eng"`, `config="--psm 6"`,
`dpi=200`/`resolution=200` — byte-identical across every site.

**Post-refactor:** `tesseract_config.py` constants assert-equal the above
(`TESSERACT_LANG=='vie+eng'`, `TESSERACT_PSM6_CONFIG=='--psm 6'`,
`OCR_RASTER_DPI==200`) — verified via standalone `python3 -c` import+assert.
`grep -n 'lang="vie+eng"\|config="--psm 6"\|dpi=200\|resolution=200'` across
the 6 call-site files returns ZERO matches (all literals replaced by named
constants); `grep -n 'TESSERACT_LANG\|TESSERACT_PSM6_CONFIG\|OCR_RASTER_DPI'`
confirms every call site now sources from the shared import.

**Test evidence:**
- `test_ocr_adapter_psm6_guard.py` (3/3 pass) — existing regression guard,
  asserts `pytesseract.image_to_string` is called with `config="--psm 6"` at
  runtime; unaffected by literal→constant substitution since the effective
  value passed to pytesseract is identical.
- Per-file incremental switch: ran the file's test(s) green before moving to
  the next file (ocr_adapter → 24/24, ocr_worker → 21/21 via
  test_low_text_density_ocr_rasterize.py, ocr_backends → 26/26, generic_md_table
  extractor+unit_ocr → 172/172, extraction_engine → 2/2).
- Full suite `python3 -m pytest -q -m "not slow"`: baseline (pre-change)
  1022 pass / 8 fail; post-change 1022-1023 pass / 7-8 fail (the swing is one
  known-flaky pre-existing timeout test, `test_pek_engine_adapter.py::
  test_extract_layout_and_tables_raises_on_timeout` — unrelated file, 0 diff,
  confirmed via `git diff --stat infrastructure/pek_engine_adapter.py`
  returning empty). The other 7 pre-existing failures (PIL.Image
  test-pollution ×2, `test_page_rasterizer.py` ×4, `test_ocr_unit_tesseract_
  retry.py` order-dependent ×2 when run alongside `test_ocr_backends.py`)
  are identical before/after — confirmed via `git stash` + re-run producing
  the exact same failing-test set.
- mypy: `python -m mypy . --ignore-missing-imports` fails repo-wide
  pre-existing ("pdf-extractor is not a valid Python package name" — hyphen
  in dir name, reproduces identically on an untouched file). Workaround
  `--explicit-package-bases`: 141 errors both before AND after my change
  (`git stash`/`stash pop` A/B compared) — 0 new errors introduced;
  `tesseract_config.py` alone reports "Success: no issues found in 1 source
  file".
- Picklability sanity (ocr_worker.py runs via ProcessPoolExecutor):
  `pickle.dumps(ocr_pages_worker)` succeeds post-change.

## Files touched
- NEW: `apps/pdf-extractor/infrastructure/tesseract_config.py`
- `apps/pdf-extractor/infrastructure/ocr_adapter.py`
- `apps/pdf-extractor/infrastructure/ocr_worker.py`
- `apps/pdf-extractor/infrastructure/ocr_backends.py`
- `apps/pdf-extractor/infrastructure/extraction_engine.py`
- `apps/pdf-extractor/infrastructure/generic_md_table/extractor.py`
- `apps/pdf-extractor/infrastructure/generic_md_table/unit_ocr.py`
- `docs/architecture/microservice/pdf-extractor/infrastructure.md` (doc-review)

## Rebuild status
`rebuild_required: true` per task board — **DEFERRED, user-gated** per
explicit task instruction (user already rebuilt once this session; do not
touch the running container). Live "OCR output unchanged" verification in
the running pdf-extractor container batches onto a future rebuild.
