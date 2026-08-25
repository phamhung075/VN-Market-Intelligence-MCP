# dev-pdf-extractor — FIX-PDFX-OCR-ORIENTATION cycle record, 2026-08-25T20:30Z

**task_id:** FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN
**commits:** `905e32be1` (fix + tests + harnesses + runbook), `2e692935b` (out-of-zone signal)
**Written here, not in `docs/agent-memory/notebooks/dev-pdf-extractor.md`,** because a live
PostToolUse hook destructively prunes that notebook (it ate 108 already-committed lines).
Same reason as `dev-pdf-extractor-ac0-findings-20260825T1830Z.md`.

---

## What the previous run left, and what I did with it

An untracked `apps/pdf-extractor/infrastructure/ocr_orientation.py` (written 19:03Z) was on
disk. I did NOT trust its narration. Re-derived every claim it made:

- "needs 90 deg clockwise, not 180" — **CONFIRMED** by running OSD myself on all 71 pages.
- "osd traineddata already in the image" — **CONFIRMED**, `tesseract --list-langs` -> eng/osd/vie.
- "OCR_TEXT_BACKEND unset so paddle_table is inert for table TEXT" — **CONFIRMED**,
  `_DEFAULT_BACKEND = "tesseract-vie"` and no compose/env override anywhere in the repo.
- "verified empirically at production DPI 200" — **UNVERIFIABLE as written**; I re-measured
  from scratch and persisted the harness so the claim is re-runnable instead of narrated.

Then I rewrote the module (gateway routing, `rotate_image()` split out, corrected page counts:
it said 20 rotated pages, the real number is 19; it said 51 upright, the real number is 52).

---

## The two findings that changed the shape of the fix

### 1. A constructor-only fix would have been INERT on the read that produces page text

`ocr_pages()` (and `ocr_pages_worker()`) each have TWO sub-paths: a primary Tesseract read,
and a PaddleOCR rasterize fallback that only fires below `LOW_TESSERACT_PAGE_CHARS=30`.
A 90-deg-rotated page returns **672-3008 chars** of mojibake — two orders of magnitude above
the floor. The PaddleOCR fallback therefore NEVER fires on a rotated page, so touching only
the three `PaddleOCR(...)` constructors named in AC-2 would have shipped a fix that changes
nothing on the failing path. Both sub-paths at both text sites are corrected.

### 2. There is a FOURTH OCR construction site, and it is out of zone

`get_bctc_page_text` serves `pdf_extracted_text` (market.db). That table is written by
`apps/mcp-server/src/infrastructure/fetchers/pdfOcrWorker.ts::ocrOnePage()` —
`pdftoppm -r 200 | tesseract stdin stdout -l vie+eng`, no `--psm`, no orientation detection.
Live: `composition-root.ts` section 4b runs it for every PDF on every mcp-server start.
`bctc_layout_units` has **zero** rows for report 1f53ef33, so 100% of the refiner's input for
the acceptance report came from that mcp-server read, not from pdf-extractor at all.
Escalated to PO as `docs/signals/pdfx-orientation-fourth-ocr-site-mcpserver-2026-08-25T203747Z.json`.

---

## Design decisions

| Decision | Why |
|---|---|
| Tesseract OSD, not `use_angle_cls=True` | angle_cls is a per-text-LINE CNN pass, O(n) on a dense BCTC table — the OOM shape. OSD is one probe per page, O(1). And angle_cls would be inert on the default tesseract-vie backend anyway. |
| Correct the PIXELS upstream of backend dispatch | one mechanism fixes tesseract-vie + paddleocr + auto + the page PNG. |
| Route OSD through `ocr_gateway` (`mode="osd"`) | an OSD probe forks a tesseract child exactly like a page read; it must sit inside THE single process-global concurrency bound + deadline + orphan reaper. Caught by `TestOcrCallSiteFence` — my first version bypassed it and the fence turned red. That fence did its job. |
| PEK: one probe per PAGE, applied to N crops | per-crop probing costs N probes AND fails far more often ("Too few characters" on sparse numeric cells). Crop from the UNROTATED page first, so layout bboxes stay valid. |
| `page_rasterizer` included though not in the row's `files` | it is the in-zone producer of the PNG `get_bctc_page_image` serves the refine agent, and the only in-zone lever that changes what the refiner sees for a report where PEK produced nothing. AC-6 says "if the path is in this zone, wire it". |
| `rotate=0` returns the SAME OBJECT | makes AC-4 structural, not a claim. |

---

## Evidence (all re-runnable)

`scripts/audits/ocr-orientation-probe.py` — detection + before/after OCR
`scripts/audits/ocr-orientation-cost-probe.py` — A/B wall clock + cgroup memory

| Sweep | Pages | Detected rotated | False positives |
|---|---|---|---|
| VIC_2026_Q1.pdf | 71 | 19 (10,11,31,34,35,48,57,60-71) | 0 |
| DBC_2025_Q4.pdf | 18 | 2 (12,15) | 0 |

AC-3: p11 vi-word 0->17, p34 0->15, p60 1->77, p67 1->42. p34 decodes to the
TAI SAN CO DINH note table, p60/p67 to PHU LUC 1 - CO CAU TO CHUC. Matches PO exactly.

AC-4: pages 13,14,15,16,41 (+58,59) byte-identical. **Measured, not construction-asserted** —
I first wrote the probe with `after = before if applied == 0`, noticed that made `identical`
a tautology, and changed it to always re-OCR the corrected array before recording the result.

AC-5 (cgroup, 10-page arms x3 interleaved, live container):
- all-upright arm: **+1.35 s/page** (pure overhead, worst case)
- mixed arm: **-1.76 s/page** — the probe PAYS FOR ITSELF; Tesseract is much slower on a
  sideways page than on a corrected one
- window peak `memory.current` 360 -> 363 MiB; `memory.peak` delta **0.0 MiB** every arm;
  `memory.events` max=0 oom_kill=0 throughout
- **cap is 2,684,354,560 B = 2560 MiB = 2.5 GiB**, read live from
  `/sys/fs/cgroup/memory.max`. The row's AC-5 prose says "2 GiB" — STALE, needs correcting
  in the row. Any % figure computed against 2 GiB uses a dead denominator.

AC-6 in-zone leg verified end-to-end: a hand-planted sideways PNG stays untouched without
`force`, and with `force=True` re-renders to OSD rotate=0 readable Vietnamese; the upright
control page 13 forced output is MD5-identical to the raw PyMuPDF write.

---

## Gates

| Gate | Result |
|---|---|
| pytest full suite | 5 failed / 1116 passed. Same 5-file failure SET as the pre-change baseline: 4x `test_ocr_backends` (`No module named pandas`, host venv) + 1x `test_bt3_fix3_real_ocr_fidelity` (needs container path `/app/data/pdfs/...`). |
| my new tests | 34/34 pass (`__tests__/unit/test_ocr_orientation.py`) |
| `TestOcrCallSiteFence` | RED after my first draft, GREEN after routing OSD through the gateway |
| mypy | 3 errors, identical to the HEAD baseline I reproduced in a clean `git archive` tree. 60 errors on the 3 sites before AND after. |
| import-linter | Fence-A / Fence-B / Fence-C all KEPT |
| G12 sandbox | primitive+module: 30 PASS, 6 FAIL — all 6 are the deliberate `known_bad_*` / `failure_mismatch` negative fixtures (e.g. `echo_identity` inputs 42 expected 99). None touch OCR. |
| PDF-Extract-Kit subtree | zero diff (verified) |

---

## NOT DONE — deliberate

1. **Not deployed.** `/app` is baked into the image, not bind-mounted. All container
   verification ran from an overlay at `/tmp/pdfxfix` with `PYTHONPATH`, so live `/app` was
   never mutated (I removed the previous run's stray `docker cp` of ocr_orientation.py into
   `/app/infrastructure/`). **An image rebuild is required — ops' job, not mine.**
2. **`pdf_extracted_text` not invalidated.** Structurally impossible from this zone:
   `SqliteOcrTextSource` opens market.db `mode=ro` on purpose (FU-1), and the writer is in
   mcp-server. Also pointless until `ocrOnePage` is fixed — a DELETE would re-write the
   same garble.
3. **refine_bctc_md skip-set untouched** (AC-0 scope fence).
4. **`bctc_refined_units` FAILED rows untouched** — retention, the other row.

