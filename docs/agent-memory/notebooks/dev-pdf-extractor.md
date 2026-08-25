# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

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

---

## Cycle 2026-08-25 — OCR-PADDLE-VI-LANG-FIX-AND-REBENCH

**Zone:** apps/pdf-extractor/ | P0 (invalid-benchmark redo)

### Defect
`ocr_adapter.py:577`/`ocr_worker.py:215` instantiated PaddleOCR text-fallback
with `lang="en"` — no Vietnamese diacritics in that rec dict. Same class
already fixed on the table path (`pek_engine_adapter.py:410`, `lang="vi"`)
but never propagated here. The 2026-08-25 4-run benchmark that measured
"PaddleOCR regresses Vietnamese" ran under this bug and was retracted
(`project_paddleocr_vietnamese_bctc_measured_regression.md`).

### Fix
`lang="en"->"vi"` at both sites, stale "handles basic diacritics" comment
corrected. PDF-Extract-Kit/ untouched (verified zero-diff).

### Re-benchmark (FPT Q4 2025, e71f845d, 46p; rebuilt image; ephemeral
`docker compose run --rm --no-deps`; verified via readonly bun:sqlite
`bctc_layout_units`, not push echo — count held at 46 across all 3 runs)

| Backend | Table-phase wall | cgroup peak / cap | hard-limit hits |
|---|---|---|---|
| tesseract-vie | 174.5s | 1631.6 MiB (63.7%) | 0 |
| paddleocr(vi) | 414.5s | 2684.4 MiB (100%, pinned at memory.max) | 1444 |
| auto | 117.2s | 1302.4 MiB (50.9%) | 0 |

Diacritic verdict: `vi` is a REAL improvement over `en` (now emits
Vietnamese-attempted diacritics at all) but NOT parity with tesseract —
page 5 sample still garbles many words ("Tai sán cö dinh" vs tesseract's
correct "Tài sản cố định"). Root cause found in installed
`paddleocr==2.10.0` source: `"vi"` is bucketed into the generic
multi-language `"latin"` rec model (30+ languages sharing one model), NOT a
dedicated Vietnamese model — so the config fix is correct but cannot reach
tesseract's accuracy by itself. `auto` reproduced byte-identical output to
tesseract-vie on page 9 (the separately-tracked, out-of-scope
`TesseractVieBackend` mean-of-nonempty-rows confidence defect — rescue
never fires — re-confirmed, not touched). PaddleOCR(vi) DID recover page 9's
real revenue/profit numbers where tesseract loses them, but at 2.4x latency
and pinned at the memory cap with 1444 hard-limit hits (kernel reclaim, 0
OOM).

**Ruling: do NOT swap.** Fails both the quality bar and the cap-headroom
bar even with `vi` fixed — per the task's own decision rule. Default text
backend stays `tesseract-vie` (unchanged; `OCR_TEXT_BACKEND` remains unset
in compose/env, matching prod today).

### Meter conflict resolved
Empirically confirmed the ephemeral container DOES inherit `mem_limit`
(HostConfig.Memory + cgroup memory.max both read 2684354560 on a live probe
container). `ru_maxrss` is the inflated meter: `RUSAGE_SELF` alone tracked
the cgroup peak closely (e.g. paddleocr self=2615.7 MiB vs cgroup
peak=2684.4 MiB) but `RUSAGE_CHILDREN` came back numerically ~equal to
`RUSAGE_SELF` in every run (self+children ≈ 2x self) — `TesseractVieBackend`
shells out to the `tesseract` binary once per cell via pytesseract, and each
reaped child's `ru_maxrss` reflects its post-fork/pre-exec RSS snapshot off
an already ~1.5 GiB-resident Python parent (torch+paddle+doclayout-yolo
loaded unconditionally for layout+table-structure detection, regardless of
text backend) — a double-count of the same physical pages, not real extra
memory. Quote cgroup `memory.current`/`memory.peak`, never `ru_maxrss`, for
this service; same fix applies wherever else this service reports memory
(A-30 `mem_creep`, `PERF-PEK-PER-PAGE-LATENCY` — flagged, not fixed here).

### Commit
`d584d4db2` fix(pdf-extractor) lang=en->vi / `9d6ee40f6` chore(scripts) bench harness persisted (`scripts/audits/ocr_bench_inner.py` + `ocr-backend-bench.sh`)

Zone health: 48/50 relevant OCR tests pass (2 pre-existing local-venv
`pandas` import gaps, confirmed identical before/after via `git stash`,
unrelated to this change — not run in container). Live
`vn-market-intelligence-mcp-pdf-extractor-1` NOT redeployed with this fix —
Docker rebuild/redeploy of the persistent service is ops's zone per this
agent's own `not_my_job` list; image was rebuilt locally only, for the
ephemeral benchmark containers.

### Status
DONE — no swap performed, code fix committed, redeploy flagged to ops.

---

## Cycle 2026-08-25 — FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS

**Zone:** apps/pdf-extractor/ | **Size:** S | P1 (incident lane, `po_expedited_at`)

### Defect
`TesseractVieBackend.recognize_text()` reported confidence as
`mean(conf)` over `valid_rows = data[(conf > 0) & (text != '')]`. The
denominator was the rows it MANAGED to read, not the rows it should have —
recall was invisible by construction. A table region where Tesseract caught a
header band and lost every data row still self-reported 0.708, so
`AutoFallbackOcrBackend`'s 0.5 gate never fired and `auto` was byte-identical
to tesseract-vie on 30/30 FPT Q4 2025 units.

### Fix
`confidence = min(precision, recall)` in BOTH backends.
`recall = _ink_coverage()` — fraction of the crop's Otsu foreground pixels
inside a box the engine emitted text for. Threshold constant untouched at 0.5.
Paddle got the same treatment because `AutoFallback` picks with
`paddle_conf >= tess_conf`, which is meaningless across two different metrics.

### Measured before choosing (all 51 real table regions, FPT Q4 2025)
Built `scripts/audits/ocr-confidence-probe.sh` first and computed every AC-1
candidate side by side rather than arguing from the armchair:

| metric | pg9 (the miss) | lowest legit | verdict |
|---|---|---|---|
| mean(conf) — today | 0.7084 | 0.7122 pg34 | 0.5% apart — dead |
| char-weighted mean | 0.7121 | 0.6876 pg34 | **INVERTED** |
| recognised-area/crop-area | 0.1183 | 0.0896 pg16 | **INVERTED** |
| recognised-lines/detected | 1.0000 | 1.0000 all | **inert** |
| **ink coverage** | **0.1740** | **0.6739 pg40** | **3.9x, no overlap** |

### Verify
AC-2 page 9: 122 → 452 chars, 9/9 figures, read by readonly bun:sqlite on
`market.db` (never push echo). AC-3: rescue fired 1x in 51 regions (page 9
only) AND 29/30 units byte-identical by sha256 to a tesseract-vie run of the
same commit. AC-4 (cgroup only): table phase 117.26s vs 112.97s same-session
(+3.8%), peak 1274.9 MiB = 49.8% of the 2560 MiB cap, 0 hard-limit hits.
pytest 1086 pass / 1 pre-existing fail; import-linter 3/3 KEPT; G12 30 green /
6 negative fixtures correctly red; PEK zero-diff.

### Learned
1. **Two of the three candidates the task itself named rank a GOOD region
   BELOW the broken one.** Had I implemented any named candidate on trust, it
   would have passed a synthetic unit test and failed the corpus. Measuring all
   four before writing production code cost one 7-minute probe run and was the
   whole cycle.
2. **`min()` over product/harmonic is a semantic choice, not a numeric one.**
   Both alternatives separated page 9 too. But under an F1 a region read
   perfectly and only 34% covered scores 0.507 and clears a 0.5 gate — high
   precision buying back collapsed recall is the exact defect being fixed, so
   the combinator must forbid it structurally, not just on today's numbers.
3. **My own instrument lied first.** The first `auto` run reported
   `rescue_fire_count = 0` while page 9 was visibly fixed — I had added the
   `RESCUE FIRED` log AFTER the image build, so the counter was measuring a
   binary that never contained it. Caught by `docker run --entrypoint sh ...
   grep -c 'RESCUE FIRED' /app/...` = 0 while `_recall_adjusted_confidence` = 4.
   **Grep the built image for the instrument before trusting the instrument.**
4. **Meter mismatch nearly produced a false AC-4 regression.** The row's 174.5s
   baseline is TABLE-PHASE; the harness reported a whole-run wall (~350s, most
   of it DocLayout-YOLO). Reported as-is it would have read as 2x slower.
   Harness now times the table phase explicitly.
5. **`python3 -m importlinter.cli lint-imports` exits 0, prints nothing and
   evaluates nothing** — a false green. Only the `lint-imports` entrypoint runs
   the contracts (3 kept, 0 broken). Same class as `feedback_fence_false_green`.
6. Ink-ratio measurement was already an idiom here — `page_zoning.py` computes
   `row_density` as a dark-pixel ratio. The new cell score is now dimensionally
   consistent with the row-bands it sits beside.

### Commit
`e9144ea75` fix(pdf-extractor): make OCR confidence recall-aware so a missed page can fail

Zone health: HEALTHY. **NOT DEPLOYED** — image rebuilt for the ephemeral
verification containers only; the live container was deliberately not recreated
(ops zone). Inert in production twice over: the container is pre-fix, and prod
runs `OCR_TEXT_BACKEND` unset = `tesseract-vie`, so the rescue does not engage
until someone sets `auto`. Debt tracked by
`OPS-PDFX-REDEPLOY-DEBT-LANG-VI-FIX-INERT-IN-PRODUCTION`.

### Status
REVIEW → next_agent=qa (head reset to idle in the same orch-apply write)

---

## Cycle 2026-08-25 (2) — FIX-PDFX-TESSERACT-CONFIDENCE (dispatch #2) — STOPPED AT AC-0

AC-0 memory sweep FAILS (rising, not flat: 42.99%→56.42%→90.11%→100.00%→100.00% of 2.5GiB cap for N=0/1/3/6/14 fires on DBC_2025_Q4). Mid-cycle PO ruling (`2826b101f`) minted an orientation P0 ahead of this row; stopped before AC-1..AC-6 (frozen sample would risk contamination + AC-0 alone is dispositive). Full methodology, raw numbers, code-change note, and a notebook-corruption incident write-up: `docs/agent-memory/decisions/dev-pdf-extractor-ac0-findings-20260825T1830Z.md`. Row untouched by me, sits in `ready[2]`, not a WIP lane.
