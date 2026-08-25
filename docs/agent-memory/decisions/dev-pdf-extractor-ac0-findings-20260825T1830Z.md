# dev-pdf-extractor — AC-0 memory-scaling sweep findings, 2026-08-25T18:30Z

**task_id:** FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS (dispatch #2)
**Written here, not in the notebook,** because `docs/agent-memory/notebooks/dev-pdf-extractor.md`
is subject to a live PostToolUse hook that destructively pruned 108 lines of already-committed
content (and dropped this cycle's entire new section) after two consecutive edit attempts this
cycle — see "Notebook incident" at the bottom. This file is the durable record until that is
fixed; point the notebook at it when it is safe to append again.

---

## Cycle 2026-08-25 (2) — STOPPED AT AC-0

**Result: AC-0 FAILS — memory RISES with fire count. Did not run AC-1..AC-6.**

Two independent, each-sufficient reasons to stop here:
1. AC-0 is itself dispositive per this row's own rule: rising memory ⇒ stop and report
   immediately rather than completing AC-1..AC-6. My own sweep (below) shows a clear,
   monotonic rise, not flat.
2. Mid-cycle PO ruling (commit `2826b101f`, 18:22Z) minted
   `FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN` P0 ahead of this
   row, and the router relayed that a 180°-rotated page reads with HIGH precision AND HIGH
   ink-coverage — unseparable by any recall proxy — so running the recall-proxy iteration now
   on a sample that might contain an undetected rotated page risks a false "no proxy separates"
   for the wrong reason. Verified independently before acting on it: `ready[0]` is the new P0,
   `ready[2]` is this row, both `dispatch_lane`/`next_agent` still `dev-pdf-extractor`
   (non-null) — confirmed by direct `jq` read of the committed board, not taken on narration.

No board write was made this cycle (router asked me not to touch `orch-state.json` — a
concurrent po write + system-auditor claimed in-flight; not independently confirmed via `ps`,
but the commit and board-order claims WERE independently verified, so treated as credible). The
row does not need a terminal-shape fix from me: it sits in `ready[]` (not a WIP lane), already
correctly parked by PO's own concurrent write, with both routing fields intact.

---

## AC-0 — memory-scaling sweep (full methodology + raw numbers)

**Vehicle:** `DBC_2025_Q4.pdf` (18pp, 13 table pages, 14 total table regions — page 4 alone has
2 distinct DocLayout-YOLO table-class bboxes). Fresh, isolated report_id
`272bfb4e-d871-41fc-9f96-e3353877b0c6` (not a real production report; chosen so any push side
effect from `ocr_bench_inner.py` cannot touch real BCTC data).

**Threshold breakpoints derived from real data, not guessed.** Ran
`scripts/audits/ocr-confidence-probe.sh` (tesseract-vie only, no push, no rescue) once first to
get every region's exact `min(mean_conf, ink_cov)` — the same formula
`_recall_adjusted_confidence` uses in production. Sorted ascending:

```
page14=0.3285  page16=0.3504  page13=0.3564  page11=0.3868  page10=0.4318
page4-r1=0.4431  page4-r0=0.5218  page7=0.5255  page12=0.5348  page15=0.5859
page6=0.5981  page17=0.6696  page5=0.6729  page3=0.6948
```

This reproduces qa's earlier 6-fire set at the shipped default (threshold 0.5) almost exactly
(qa: 0.443/0.432/0.387/0.356/0.329/0.350 vs mine: 0.4431/0.4318/0.3868/0.3564/0.3285/0.3504 —
same six pages, same order, rounding-level agreement). Confirms parity with the prior cycle's
measurement.

Chose 5 `OCR_FALLBACK_THRESHOLD` values landing exactly on N = 0, 1, 3, 6 (the already-established
baseline), and 14 (all regions fire). `OCR_TEXT_BACKEND=auto`, no code change, no rebuild — per
`scripts/audits/ocr_bench_inner.py` via `docker compose run --rm --no-deps -e ... pdf-extractor`.
cgroup `memory.peak`/`memory.events` read **in-process, from `/sys/fs/cgroup/`** — never
`ru_maxrss` (it double-counts copy-on-write pages from the per-cell `tesseract` forks, per this
row's own standing instruction and a prior cycle's invalidated benchmark). Cap =
`deploy.resources.limits.memory: 2.5g` in `docker-compose.yml` = 2,684,354,560 B, confirmed
against the same file this cycle (not re-derived from a stale note).

| N target | threshold | actual fires (pages) | `memory.peak` (B) | % of 2,684,354,560 cap | `memory.events.max` | table_phase_s | wall_time_s |
|---|---|---|---|---|---|---|---|
| 0 | 0.01 | 0 | 1,154,088,960 | 42.99% | 0 | 72.83 | 158.89 |
| 1 | 0.33 | 1 (p14) | 1,514,389,504 | 56.42% | 0 | 77.05 | 160.47 |
| 3 | 0.36 | 3 (p13,14,16) | 2,418,950,144 | 90.11% | 0 | 89.82 | 169.65 |
| 6 | 0.5 (shipped default) | 6 (p4,10,11,13,14,16) | 2,684,354,560 | **100.00% = memory.max exactly** | 847 | 121.99 | 207.81 |
| 14 ("all") | 1.1 | 14 (every region) | 2,684,354,560 | 100.00% | 1250 | 209.54 | 299.21 |

**Verdict: RISING, not flat — monotonic.** N=1 alone costs +13.4 percentage points (~343 MiB)
over N=0. By N=3 (only 3 fires on an 18-page document) the container is already at 90% of cap.
N=6 pins exactly at `memory.max` with 847 hard-limit-hit events; N=14 pins at the same ceiling
but with MORE events (1250) — it is not saturating once and holding, it keeps getting reclaimed
under memory pressure as more fires accumulate. `PaddleOCR(...)` is constructed unconditionally
in `_load_pek_models()` in BOTH arms (tesseract-vie and auto), so one-time model residency is
already fully present in the N=0 baseline and cancels out of the comparison — a delta that keeps
growing with invocation count is retention across calls, not residency. This directly confirms
the hypothesis PO's ruling (`docs/agent-memory/decisions/triage-20260825T1752Z-po.md` §2e) asked
this sweep to test: **no fire rate is safe for `auto` as currently built**, independent of
whatever the discriminator-generalisation question (AC-1..AC-4) resolves to. This is a hard
blocker on the whole rescue architecture, not a calibration issue, and it would remain a blocker
even if AC-1..AC-4 later produced a perfect discriminator.

**Reconciliation, not blind adoption, of the router's cited external number.** The mid-flight
message cited an independent tier-2 probe reading `ocr-ac0-sweep-N6-39496` at 99.19% of cap. My
own in-process cgroup read for that exact run is 100.00% (`memory.peak == memory.max`,
byte-for-byte: 2,684,354,560 == 2,684,354,560). Both readings point to the same conclusion (N6
is pinned at/against the hard ceiling); I report my own number as measured and do not adjust it
toward theirs. The ~0.8pp gap is most plausibly a sampling-instant difference (an external poll
mid-run vs. an in-process peak-at-process-exit read) rather than a contradiction, but I did not
independently verify the tier-2 probe's own methodology and am not asserting a specific cause.

---

## AC-1..AC-6 — NOT RUN. Frozen sample published but never scored.

Per AC-3 discipline (publish before measuring), I had already generated and hashed a stratified
n=8 sample before starting AC-0 — this itself is NOT a violation of "sample must be re-frozen
after orientation lands," since it was never scored:

```
bank            ACB_2025_Q4.pdf  md5=e99b5327239f2ea52198e42f697a0bd4  report_id=7aaa835d-2389-4a7c-b05a-4f023cd74807
bank            SHB_2025_Q4.pdf  md5=57f748e60d9e74bf6bfc882a0accb996  report_id=13c503e6-89f1-463b-98cc-ce0a86a53dd9
industrial      HPG_2025_Q4.pdf  md5=4cc5d78aab2527e1de1fac981b282f6c  report_id=becd59b1-e08d-4bc3-b330-52802c6fc255
industrial      BSR_2025_Q3.pdf  md5=f9278a72280f9d5181c4a1ccddd5d548  report_id=82be7a1e-0577-43de-b02b-7731083f8bfa
consumer-retail FRT_2025_Q4.pdf  md5=726bca6228cd6c0edb2e73d439ad6eba  report_id=0963d31c-065b-48e1-a53a-c20080fe1de7
consumer-retail SAB_2025_Q4.pdf  md5=8b33aa71a8bf523ea169f448d51de384  report_id=e523fa8b-1367-4829-9680-1582b2490ca9
real-estate     KDH_2025_Q3.pdf  md5=7023af832fe50d2a43dc8b2a90afc9b4  report_id=c7c31316-57a2-48b5-a768-e7b713d9a5cf
real-estate     DXG_2025_Q4.pdf  md5=0dd6879893cccc0c81eaa1c0865fa35a  report_id=0334155f-635c-41f5-8c35-ede01eb2b9fc
```
FPT (md5 `c738870721e98e73b2cd447c8649a97c`) held out per AC-3. **Per PO's ruling, this exact
sample must be DISCARDED and re-drawn only after the orientation fix lands** — I did not run any
measurement against it, so nothing here is contaminated, but reusing these same 8 files without
re-checking each for undetected rotation would defeat the point of the new P0 row.

**One incidental, non-scored finding** from the single exploratory probe run on DBC (run only to
derive the AC-0 threshold breakpoints, tesseract-vie only, NOT part of any frozen/scored sample):
2 of its 14 regions (page 12, page 15) are genuinely-broken garbled OCR
(`text_excerpt` is unreadable noise, not Vietnamese) that the SHIPPED discriminator does **not**
catch — confidence 0.5348 / 0.5859, both **above** the 0.5 threshold, so no rescue fires. This is
a false-negative direction nobody had reported yet (prior work found only false positives). On
this one document, two signals separated these two genuinely-broken regions from the 12
legitimate ones cleanly: `n_lvl5_conf_le0` (39, 20 vs. legit max 13) and the newly-instrumented
`numeric_token_count` / `numeric_token_density_per_100chars` (0, 0 vs. legit min 4 / 1.06 per 100
chars). **Not claimed as a validated discriminator** — n=1 document, not the frozen/scored
sample, and these 2 regions were never checked for rotation, so the same contamination risk PO
flagged applies here too. Recorded for whoever re-runs AC-1..AC-4 after the sample is re-frozen,
so the numeric-token-density lead is not lost.

---

## Code change this cycle (in scope per the row's `files` list)

`scripts/audits/ocr_confidence_probe_inner.py` — behavior-neutral to production (still hardcodes
`TesseractVieBackend`, never pushes):
- `numeric_token_count` / `numeric_token_density_per_100chars` per region — AC-1's previously
  uninstrumented candidate. VND-figure regex (`\b\d{1,3}(?:\.\d{3}){2,}(?:,\d+)?\b`) over the
  FULL recognised text, never the truncated excerpt.
- `sha256` per unit in `unit_rows` (AC-5) — lets a future tesseract-vie probe run be diffed
  against an `auto` `ocr_bench_inner.py` run on the same report_id/pdf without a DB round-trip.
- `table_phase_s` timing wrapper, same method as `ocr_bench_inner.py`'s — gives a 0-fire baseline
  for AC-5's marginal-cost-per-fire.
- `text_excerpt` bumped 200→300 chars for ground-truthing.

Verified by running it twice against `DBC_2025_Q4.pdf` (syntax check + live run); output parsed
and cross-checked against qa's prior numbers above.

---

## Notebook incident (process finding, not this task's fix)

Two consecutive attempts to append this cycle's summary to
`docs/agent-memory/notebooks/dev-pdf-extractor.md` (first via a `cat >>` heredoc, then via a
targeted `Edit` typo-fix on the just-appended text) resulted in the working-tree file losing 108
lines relative to `HEAD` — not just my new section, but pre-existing, already-committed content —
while a tool-harness notice attributed it to a PostToolUse hook ("likely a formatter"). Net diff
observed: `2 insertions(+), 108 deletions(-)` against `HEAD` (275 lines), leaving 169 lines with
no trace of my new section at all. This matches the class of bug already named in this session's
own recent commit history (`chore(signals): ... preserve unparseable prune-dropped-newest
emission`) — a notebook-pruning mechanism that can drop the NEWEST section instead of the oldest.
I restored the file to `HEAD` (`git checkout HEAD -- <path>`, single-file, non-broad) rather than
commit the mangled version, and moved this cycle's findings to this standalone file instead of
risking a third collision. Not investigated further or fixed here — out of this row's zone and
scope — flagging for whichever agent owns notebook-compose/prune tooling.
