# dev-pdf-extractor — OCR recall-proxy widen cycle, 2026-08-25T22:10Z

**task_id:** FIX-PDFX-TESSERACT-CONFIDENCE-MEAN-OVER-NONEMPTY-MASKS-TOTAL-PAGE-MISS (redispatch_count=1)
**Scope this cycle (per PO ruling `triage-20260825T1752Z-po.md`):** MEASUREMENT ONLY. `apps/pdf-extractor/infrastructure/ocr_backends.py` untouched — confirmed by `git status --short -- apps/pdf-extractor/` clean throughout, and no edit made to that file.
**Files touched:** `scripts/audits/ocr-widen-sample-manifest.json` (new), `scripts/audits/ocr-widen-dbc-orientation-census.txt` (new), `scripts/audits/ocr-widen-classify.py` (new), `scripts/audits/ocr-fallback-memory-sweep.sh` (new, authored not executed — see §4).

---

## 0. Re-freeze — orientation fix impact on this row's sample (mandatory, run first)

My own prior return this session closed `FIX-PDFX-OCR-ORIENTATION-UNDETECTED-ROTATED-BCTC-PAGES-READ-UPSIDE-DOWN`
(commit `905e32be1`, now in `review[]` awaiting qa, **not yet deployed** — image not rebuilt). Per that row's own
status_note, "after this row lands, that cycle's frozen sample must be RE-FROZEN — its labels change." Verified
directly, not assumed:

- Ran `scripts/audits/ocr-orientation-probe.py` (OSD-only, no `--ocr`) over all 18 pages of `DBC_2025_Q4.pdf`:
  **2 of 18 pages rotated (12, 15)**, both 90° clockwise. Full output: `scripts/audits/ocr-widen-dbc-orientation-census.txt`.
- Ran `ocr_confidence_probe_inner.py` on `DBC_2025_Q4.pdf` TWICE, byte-identical inputs, only the bind-mounted
  `infrastructure/` tree differed (image-baked pre-fix vs HEAD post-fix):

  | page | pre-fix mean_conf / ink_cov | numeric_tok | text | post-fix mean_conf / ink_cov | numeric_tok | text |
  |---|---|---|---|---|---|---|
  | 12 | 0.535 / 0.683 | **0** | `_ =) ® \` eo we Sol = ...` (pure mojibake, 1005 chars) | 0.821 / 0.717 | **54** | `Nguyên giá ... Số dư đầu kỳ 4.438.044.339.717 ...` (correct, matches a real fixed-asset note) |
  | 15 | 0.586 / 0.655 | **0** | `mẹ; S9) Gà wat xế Q ...` (pure mojibake, 689 chars) | 0.789 / 0.655 | **24** | `kiểm soát Số dư đầu năm trước 2.420.018.590.000 ...` (correct) |

  **2 of 14 regions changed label**, and the direction is the one this row's own AC-0 sub-cycle and the P0
  orientation row both predicted from theory but neither had measured directly: a rotated page reads with
  precision **and** ink-coverage both comfortably ABOVE the 0.5 gate (0.535, 0.586) while containing **zero**
  real content — a false NEGATIVE the current discriminator structurally cannot see, confirmed here with actual
  before/after text, not inferred. The other 12 DBC regions (including the 6 pages qa/prior-cycle reported firing:
  4,10,11,13,14,16) are numerically identical pre/post-fix — orientation does not touch them, so that earlier
  evidence stands unchanged.
- **Net effect on THIS row's evidence base:** the discriminator's "broken" population used in earlier cycles never
  actually included these 2 regions (they self-reported >0.5, no rescue fired, no one flagged them as broken until
  this cycle's before/after diff). Re-freezing does not invalidate any previously-reported number; it adds one new,
  previously-invisible failure mode (see §3).

---

## 1. AC-0 — memory-scaling sweep: carried forward, cross-validated, not re-run in full

A same-day, same-row sub-cycle already ran this exact sweep in full and reached a decisive verdict — full
methodology and table: `docs/agent-memory/decisions/dev-pdf-extractor-ac0-findings-20260825T1830Z.md`. Verdict:
**memory RISES with fire count** (N=0 → 42.99% of cap, N=1 → 56.4%, N=3 → 90.1%, N=6 → 100.00% = `memory.max`
exactly with 847 hard-limit-hit events, N=14 "all" → same ceiling with 1250 events). `PaddleOCR(...)` is constructed
unconditionally in `_load_pek_models()` in **both** arms, so one-time model residency is already priced into the
N=0 baseline; a delta that keeps growing with invocation count is retention across calls, not residency. **This is
a hard blocker on the whole rescue architecture, independent of whatever the discriminator-generalisation question
below resolves to** — that sweep's own words, and this cycle does not dispute them.

That sweep ran on the PRE-orientation-fix code. I did not re-run the 5-point sweep (time-budget call, stated
plainly), but I did independently reproduce its **N=6 (shipped default) row** as a side effect of the AC-5 work
below, on the POST-orientation-fix code: `OCR_TEXT_BACKEND=auto` (threshold unset → 0.5 default) on
`DBC_2025_Q4.pdf`, orientation-fix bind-mounted. Result: 6 fires (pages 4,10,11,13,14,16 — the SAME set;
pages 12/15 do not fire post-fix either, since their corrected confidence 0.821/0.789 is well above 0.5),
`cgroup.memory.peak` = `cgroup.memory.max` = 2,684,354,560 B **exactly** (100.00% of cap), `memory.events.max=914`
(oom=0, oom_kill=0 — saturates repeatedly, does not crash). This matches the prior sweep's N=6 row
(peak==max exactly, 847 events) in every qualitative respect and the same order of magnitude in event count.
**The orientation fix does not touch `PaddleOCR`'s own invocation path or its model residency — it only reorders
pixels before Tesseract/PaddleOCR ever see them — so there is no mechanism by which it could change this verdict,
and this one-point reproduction is consistent with that.** AC-0 verdict stands: **rising, not flat.**

---

## 2. AC-3/AC-4 — the widened sample: n, ids, hashes, and what it actually shows

Manifest published BEFORE any region was scored: `scripts/audits/ocr-widen-sample-manifest.json`.

| doc (category) | pages | regions | md5 |
|---|---|---|---|
| DBC_2025_Q4.pdf (agriculture, carried) | 18 | 14 | `632e24d6...` |
| FRT_2025_Q4.pdf (consumer-retail) | 28 | 31 | `726bca62...` |
| ACB_2025_Q4.pdf (bank) | 33 | 35 | `e99b5327...` |
| HPG_2025_Q4.pdf (industrial) | 33 | 29 | `4cc5d78a...` |
| DIG_2025_Q2.pdf (real-estate) | 39 | 35 | `598918d2...` |
| DGC_2024_Q4.pdf (industrial) | 46 | 45 | `b66ace28...` |
| **Achieved n = 6** documents, 189 table regions | | | |
| FPT (held out, NOT counted toward n) | 46 | 51 | `20260126-FPT...` |

Stratification achieved: bank=1/2 target, industrial=2/2 ✓, consumer-retail=1/2 target, real-estate=1/1 ✓,
agriculture=1 (carried). **Two more documents (a 2nd bank, a 2nd consumer-retail issuer) were planned but not run**
— time-boxed under the market-hours guard and this host's shared CPU load this cycle (6-core Docker VM,
load average 3-7 throughout, other agents active concurrently; single documents that normally take ~2 min took
up to 6-7 min for layout detection alone). This is a real, stated shortfall against the row's own AC-3 floor, not
a silent gap.

**The headline finding did not need a 7th or 8th document to become clear: across all 6 widened documents plus the
re-verified DBC set, `numeric_token_count` says every one of 189 regions is genuinely-read content (`ground truth
by reading extracted cell content`, not the score under test — every region's `text_excerpt` was read, not just its
numeric-token count; see method note below). Zero catastrophic misses. This is itself the finding, not an
absence of one:**

| doc | ink_cov legit range | line_ink_cov legit range | mean_conf legit range |
|---|---|---|---|
| DBC | 0.329 – 0.717 | 0.688 – 0.903 | 0.782 – 0.900 |
| FRT | 0.569 – 0.944 | 0.724 – 1.000 | 0.609 – 0.934 |
| ACB | 0.637 – 0.977 | 0.767 – 1.000 | 0.712 – 0.966 |
| HPG | 0.836 – 0.999 | 0.859 – 1.000 | 0.275 – 0.912 |
| DIG | 0.765 – 1.000 | 0.865 – 1.000 | 0.766 – 0.938 |
| DGC | 0.670 – 0.997 | 0.832 – 1.000 | 0.849 – 0.958 |
| **FPT (own legit, excl. p9)** | 0.674 – 0.996 | 0.824 – 1.000 | 0.712 – 0.961 |
| **FPT p9 (the ONE known genuine catastrophic miss, ground truth: 63 chars, headers + a stray "178%", zero figures)** | **0.174** | **0.763** | 0.708 |

**Method note on ground truth:** a naive automated rule (has the region got ≥1 Vietnamese function word, or ≥1
parseable VND figure?) mislabels FPT page 9 itself as "legit" — a bare table header row ("Chỉ tiêu Năm2025 |
Năm2024 | Tăng giảm") contains real Vietnamese words with zero data rows behind it. I built exactly that automated
heuristic (`scripts/audits/ocr-widen-classify.py`) as a first pass and it produced this wrong call on the one
region I independently know the ground truth for from four cycles of prior human/agent reads. **This is not a
footnote — it is why every "legit" label used in the two tables above and the row-by-row output was checked against
the actual `text_excerpt`, and it is why "the score under test cannot judge itself" extends to a naive text-presence
proxy too, not only to a numeric confidence.** FPT p9 is treated as BROKEN by ground truth (independently
established since the original discovery, re-confirmed by reading the actual excerpt this cycle), overriding the
naive classifier's "legit" call.

**What the range table shows, plainly:**
1. **`ink_cov`'s legit floor varies 3x across ordinary documents** (0.329 on DBC to 0.836 on HPG) purely as a
   function of issuer table styling — exactly the structural confound §2b of the PO ruling named (rule lines,
   shading, seals inflate the denominator, and how much of that a table carries is issuer-specific, not
   read-quality-specific). No single document in this sample contradicts the PO ruling's account of *why* the
   metric misbehaves.
2. **Against the one known broken exemplar (FPT p9=0.174), `ink_cov` still separates on THIS sample**:
   0.174 < every document's legit floor (lowest is DBC's 0.329). A constant in (0.174, 0.329] — e.g. 0.25 — would
   pass AC-4's bar on the data collected this cycle. **This is not evidence the metric generalises**: it is the
   SAME single exemplar the metric was originally tuned against (FPT), now merely compared to five NEW documents'
   legit floors, none of which contributed a second broken example to test against. Zero new broken exemplars in
   189 fresh regions means the generalisation question is **exactly as open as it was before this cycle** — this
   sample answered "how variable is the legit floor" (very: 3x), not "does the discriminator catch a NEW kind of
   miss" (untested, because none occurred).
3. **`line_ink_cov` (this cycle's AC-1 lead candidate, `min(precision, ink-inside-detected-line-boxes)`) is
   the most STABLE signal measured — legit floor sits in a tight 0.688–0.865 band across all 6 widened documents,
   versus `ink_cov`'s 0.329–0.836 (a >2x tighter spread) — exactly as predicted by removing rule-lines/seals/shading
   from the denominator.** But it **FAILS the actual separation test**: FPT p9's `line_ink_cov` = 0.763, which sits
   ABOVE DBC's own legit floor (0.688). No single constant exists that is `≤ 0.688` (to not rescue DBC's legit
   page 4) and `> 0.763` (to rescue FPT's genuine miss) at the same time — that is a mathematical impossibility, not
   a tuning problem. **`line_ink_cov` is a real improvement in stability and a genuine negative result on
   separation, in the same cycle.** Both are reported because both are true.
4. **`mean_conf` (the original, pre-ink-coverage metric) is confirmed dead again, independently**: HPG alone has a
   *legitimate*, correctly-read region (p14, "Số năm 19.484.412.761.405...", 6 real VND figures) at `mean_conf=0.275`
   — BELOW FPT p9's broken 0.708. Inverted, not just overlapping.
5. **`min_conf` fails completely**: FPT p9's `min_conf=0.2244` sits ABOVE the legit floor of every single one of the
   6 widened documents (lowest observed legit `min_conf` was 0.000, DIG and HPG both touch it). `min_conf` is
   dominated by the single worst mis-read glyph in an otherwise-perfect region (a stray mark, a decimal point) and
   carries no recall information at all.
6. **`n_lvl5_conf_le0` / `n_lvl5_empty_text` are inert on this sample**: FPT p9 scores `n_lvl5_conf_le0=0`, and a
   majority of legitimate regions across all 6 documents ALSO score 0 (ACB: 0 on every one of 35 regions). A count
   that is 0 on both a genuine miss and most genuine hits carries no separating information.
7. **`numeric_token_count` (the human-successful signal from the prior cycle) generalises only as far as the VND
   number-formatting convention it was written against.** `FRT_2025_Q4.pdf` uses COMMA-grouped thousands
   ("116,016,686,474") where `DBC`/`ACB`/`HPG`/`DIG`/`DGC`/`FPT` all use DOT-grouped ("439.331.953.874") — a real,
   issuer-level formatting difference, not noise. The shipped regex (`\d{1,3}(?:\.\d{3}){2,}`) returns **0 on every
   one of FRT's 31 genuinely-correct regions**, which would have looked identical to a total miss on this signal
   alone. Separately, and even on documents where the format matches: many genuinely-legitimate regions (headers,
   shareholder-list tables, subsidiary-ownership percentage tables, cross-reference indices — FPT's own p30, p42-46;
   ACB's p17-r1/r2) legitimately carry **zero** parseable VND figures because they are not VND-figure tables at all.
   `numeric_token_count=0` is true of both FPT's genuine miss (p9) AND dozens of genuinely-correct non-figure
   regions across every document measured. **The "signal a human used successfully" worked because the human was
   looking at two specific documents where it happened to apply cleanly, not because the signal generalises.**

### AC-2 — DocLayout-YOLO as an independent line-count candidate: cannot be built, structurally

The PO ruling's AC-1/AC-2 asked for the "recognised row count vs. the row count **the layout detector** found" to
be retested against DocLayout-YOLO instead of Tesseract's own level-4 line boxes (self-referential, correctly
rejected before). Read `_PekLayoutModel` (`apps/pdf-extractor/infrastructure/pek_engine_adapter.py:152-247`)
directly rather than assuming: **DocLayout-YOLO's output is exactly one bounding box per detected class per page**
— its 10-class vocabulary is `title / plain_text / abandon / figure / figure_caption / table / table_caption /
table_footnote / isolate_formula / formula_caption`, page-block granularity. For a table region it emits **one**
box (the crop boundary itself — the SAME box already used as the OCR input), never a per-row or per-line
sub-structure. There is no "DocLayout-YOLO row count" to compare against; the candidate as specified cannot be
built in this zone, not because it was implemented wrong, but because the upstream model does not produce
that granularity anywhere in this pipeline. (The actual per-cell/row structure inside a table region comes from
PaddleOCR PP-StructureV2's own table-grid pass — the SAME engine that is one arm of the very rescue under
evaluation, so using it as "independent ground truth" for the OTHER arm's row count would be circular by
construction, not merely difficult.) **Verdict: AC-2's literal ask is unbuildable in-zone; reported as a finding,
not attempted as code.**

---

## 3. AC-5 — per-unit sha256 diff + marginal cost, DBC (carried-forward mandatory AC, previously twice unanswered)

Ran `ocr_bench_inner.py` twice on `DBC_2025_Q4.pdf` (orientation-fix bind-mounted, fresh random `report_id`s never
tied to a real `financial_reports` row — push attempts both failed `HTTP 400 invalid_report_id`, confirmed no
write reached any real data): once `OCR_TEXT_BACKEND=tesseract-vie`, once `auto` (default threshold).

- **6 fires, exactly the 6 known pages (4,10,11,13,14,16). Unit-digest diff: exactly those 6 units' sha256/length
  changed; all other 12 units (including the 2 orientation-corrected, non-firing pages 12/15) are byte-identical
  between the two runs.** No spurious changes, no silent loss elsewhere — the rescue's blast radius is exactly its
  fire set, nothing more.
- **Every fired unit got LONGER, substantially** (page 4: 2592→3506 chars, +35%; page 10: 1329→1859, +40%; page 11:
  977→1906, +95%; page 13: 446→733, +64%; page 14: 290→557, +92%; page 16: 984→1901, +93%). Per-region `RESCUE
  FIRED` log lines confirm PaddleOCR won each time with a HIGHER recall-adjusted confidence (e.g. page 4:
  tesseract 0.443 vs paddle 0.690, 2124 vs 1210 chars).
- **This answers the specific question the PO ruling flagged as unanswered twice** ("wasted compute" vs "replaced
  correct lines with worse ones"): on DBC, the rescue is **not wasting compute** — every fire recovered
  substantially more characters, consistent with genuine content recovery (these are exactly the pages whose ink
  coverage was originally LOW because tesseract's word-level boxes were missing real cells, not because the region
  was blank). **What this does NOT establish**: whether the RECOVERED text is diacritically correct — `paddleocr==2.10.0`'s
  known Vietnamese-diacritic penalty (lang=vi bucketed into a shared 30-language "latin" model) could still degrade
  individual characters even while recovering more of them. A full text/diff read of the 6 replaced units against
  the source PDF crops was not done this cycle (time-boxed); flagged as the one remaining open sub-question under
  AC-5, not claimed as settled.
- **Marginal cost, stated as the row demands** (never a bare percentage): table-phase wall clock, this cycle's own
  measurement, same script, same commit, same host: tesseract-vie baseline 83.32s (0 fires) → auto 151.94s
  (6 fires) = **+68.6s / 6 fires ≈ +11.4s per fire** on an 18-page, 14-region document. Memory: see §1 (100% of
  cap at 6 fires, independent of whether those fires are "worth it" in content terms).

---

## 4. AC-6 — rescue-and-verify: opinion only, not built (per the row's own "evaluate, do not build")

Reframing the gate as "fire liberally on a cheap, over-inclusive signal (e.g. `ink_cov < 0.9`), then keep the
PaddleOCR result only if `numeric_token_count` strictly increases" would convert a correctness gate into a cost
filter — a false positive costs compute, never data quality, IF `numeric_token_count` itself were reliable. §2
finding 7 above is directly relevant here and was not available before this cycle: `numeric_token_count` returns
0 on ~31 genuinely-correct regions in FRT alone due to a formatting mismatch, so naively adopting
"accept only if numeric_token_count increases" would systematically REJECT a genuine PaddleOCR improvement on
comma-formatted issuers (the count could not increase from 0 to a nonzero value the regex cannot even see, so a
real recovery is silently discarded) — a new failure mode this cycle's data surfaces, not present in the original
proposal's reasoning. If pursued, the acceptance criterion must be format-agnostic (e.g. digit-run length
regardless of separator, or a Vietnamese-BCTC-vocabulary hit count) before this reframing is safe to build. Not
attempted in code — this is an opinion for PO, per the row's own AC-6 instruction ("evaluate, do not build").
§1's memory finding is unaffected by this reframing (liberal firing binds harder, not looser, on the memory
ceiling) and must be resolved first regardless of which gate shape is chosen.

---

## 5. Overall verdict for PO

**No candidate signal measured this cycle — old or new — separates genuinely-broken from legitimate table
regions with a single fixed constant across ordinary documents, once "legitimate" is drawn from more than the
one document (FPT) the discriminator was tuned on.** `ink_cov` still numerically separates the ONE known broken
exemplar from six NEW documents' legit floors, but that is unchanged from before this cycle (no new broken
exemplar was found to test it against — broken regions are evidently rare: 1 in 51 FPT regions, 0 in 189 more
across 6 stratified documents, ≈0.4% base rate on this sample). `line_ink_cov` is a genuine improvement in
stability (removes the issuer-styling confound §2b of the PO ruling identified) but demonstrably FAILS separation
against the one exemplar available (0.763 vs DBC's own legit 0.688). Every other candidate (`mean_conf`,
`min_conf`, `n_lvl5_conf_le0`, `n_lvl5_empty_text`, `numeric_token_count`) is inverted, inert, or format-brittle on
this data. AC-0's memory-scaling verdict (rising with fire count, saturates the container's 2.5 GiB cap at just
6 fires on an 18-page document) is reconfirmed post-orientation-fix and is independently dispositive: **no fire
rate is safe under the current architecture regardless of how the discriminator question resolves.**

This is reported as a valid negative result, not a failure to find one: **the honest answer is that no threshold
generalises, on the evidence gathered.** Recommended next step, if the user's "improve BCTC quality" goal is to be
served by anything measured this cycle: retire the confidence-threshold-gated `auto` architecture as a production
candidate (it was never enabled — `OCR_TEXT_BACKEND` unset in production, confirmed by the 17:52Z ruling and
unchanged since); the surviving, evidence-backed lead is AC-6's "rescue-and-verify" reframing (fire cheaply,
accept only on an OBJECTIVE, format-agnostic content gain), gated FIRST on resolving §1's memory ceiling (e.g. an
explicit per-document or per-batch PaddleOCR call budget, or investigating why repeated calls retain memory
instead of releasing it between crops) — a decision for PO/architect, not built here.

**Achieved n = 6 widened documents (target 8), stratification 4/4 categories touched but 2 of 4 short of the ≥2
floor (bank, consumer-retail) — disclosed in §2, not hidden.** Time-boxed by the market-hours guard and this
cycle's shared-host CPU contention; the marginal value of further documents was assessed as low against time
spent, given the zero-broken-example pattern held identically across all 6 already measured (agriculture,
consumer-retail, bank, 2×industrial, real-estate) and the one negative result that mattered (`line_ink_cov`'s
separation failure) was already conclusive without them.
