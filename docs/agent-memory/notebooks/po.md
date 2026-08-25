# PO Notebook

## 2026-08-25T15:18-15:30Z — my own numbers from 13:45Z were wrong, and the "defect" I was sent to fix wasn't there

Router-direct board tick. Journal: `docs/agent-memory/decisions/triage-20260825T1524Z-po.md`.
**3 rows written · 1 retroactive mint · 1 promote+expedite · 1 debt row · 0 fixes made to the reported defect.**

### I have to retract my own measurements
The 13:45Z section below quotes PaddleOCR at "1.8x slower, 2790 MiB against a 2560 MiB cap". **Those numbers
are void** — that benchmark ran `lang="en"`. Valid re-bench (`lang="vi"`, same FPT Q4 2025 / 46p corpus, read
back through readonly `bun:sqlite` on `bctc_layout_units`): **2.4x** slower (414.5s vs 174.5s) and **2684.4 MiB
= 100% of cap, pinned at `memory.max` with 1444 hard-limit hits**. My verdict survived; my evidence did not.
Diacritics are still garbled, and the reason is worse than a config bug — `paddleocr==2.10.0` buckets `"vi"`
into a generic 30-language `"latin"` rec model. **There is no Vietnamese model.** Not reopenable by tuning.
Also: `auto` "beating" tesseract on wall time (117.2s) is cache noise. It reproduced tesseract *byte-for-byte*.

### The reported defect did not exist
I was told the confidence row had `task_zone: null` and would strand as an unspawnable head. I probed before
fixing: **`task_zone` is carried by 0 of 837 rows and appears nowhere in `scripts/` or `apps/`.** The field is
`zone`, correctly `"apps/pdf-extractor/"` since mint. Writing the "fix" would have added a decoy field no
consumer reads, on a passthrough schema that would have accepted it silently. Changed nothing; recorded why on
the row. **A probe returning null is a claim about the probe as much as about the row.**

### Priority: I used the expedite lane instead of the band
`ready[]` is 106 rows and the rank-1 band is **91, not 69** — `priority_rank` collapses `"high"` (21) into `P1`
(69). RLC's tiebreak is array index, so `+=` would have landed this **60th of 60** eligible rank-1 rows.
Rejected P0 (no live outage; 6 real P0s already there). Took `po_expedited_at` + `ready[0]`: ILC is
unconditional every tick, `INCIDENT_CAP=2`, budget independent of the shared WIP slot, and live `incident_wip=0`
with **zero** other expedited rows. Then I **dry-ran the actual claim script** rather than predicting: it
returns `ILC CLAIMS: FIX-PDFX-TESSERACT-CONFIDENCE-...` → `dev-pdf-extractor`, sole candidate, takes `.head`.

### Carry-over
- **Terminal ≠ verified.** Minted the completed OCR work into `done[]`/`DONE`, not `done_verified[]`. The latter
  needs `verification.raw_probe` and the grandfather list is frozen — but the real reason is that the container
  was never rebuilt, so no production verification exists. Composing a probe to clear a gate is the fabrication
  the gate exists to catch.
- **Prose ceiling starved the right answer again.** The deploy debt belonged as occurrence 6 on
  `FIX-DEVTEAM-REBUILD-REQUIRED-MARKER-NO-CONSUMER` — which already has a `po_occurrences[]` array built for it.
  It is **14,205B**, over the 12,000 ceiling; growth-only Stage 2.5 hard-rejects. Second tick running that I
  could not annotate the row that owns the symptom. Minted a `depends_on`-gated row instead.
- **Check the fold target's `non_goals` before folding.** `UNBLOCK-PDFX-OPS-DEPLOY-AND-BURST-MEASUREMENT` looks
  like the obvious home for "rebuild pdf-extractor" and explicitly *forbids* it — AC-7 needs 12h of cgroup
  counters that reset on recreation. Made it the blocker, not the host.
- Did **not** run the pre-check chain (TNB / channel / signal-dashboard / goahead / manual-dispatch). Scoped
  tick. 4 untracked `docs/signals/bctc_signal_*` files are undrained.
- Standing push disarm in force — committed, nothing pushed. `.head` untouched (still idle).

## 2026-08-25T13:45-14:05Z — I ruled against the standing OCR goal, then found the bigger lever behind it

27-envelope triage + the PaddleOCR ruling. Journal: `docs/agent-memory/decisions/triage-20260825T1345Z-po.md`.
**9 minted · 3 folded · 1 signal_queue row to qa · 1 dispatched · 1 P0 acceptance probe RUN and FAILED ·
inbox 27→0.** (Commit `4255106db`'s subject says "10 rows" — wrong, corrected here on readback: 8 from the
mint script + 1 from the dispatch-stamp script = 9. Counted from git HEAD, not from what I meant to write.)

### The ruling
**Do not adopt `paddleocr`. Do not adopt `auto`. Keep `tesseract-vie`.** The directive said "improve quality of
extraction BCTC" and PaddleOCR *strips Vietnamese diacritics on nearly every word* — it fails the goal's own
objective. Also 1.8x slower and peaks **2790 MiB against a 2560 MiB cap** (the specialist called that
"98.5-100%"; it is *over*). Zero deploy needed: `OCR_TEXT_BACKEND` is unset in every compose/env file and on the
live container, so the default already IS `tesseract-vie`.

But the data supports a conclusion nobody drew. Paddle's one win (page 9: tesseract lost 100% of the
revenue/profit figures) is **not** an argument for the backend — it is proof that a catastrophic per-page miss
exists and *nothing detects it*. `auto` was byte-identical on 30/30 units because the rescue never fired. I read
`ocr_backends.py` myself: confidence is `mean(conf)` over the rows it **found**, so recall is invisible by
construction and 3 header words at conf 92 score 0.92 on a page that lost 40 rows. The question was never
"which backend" — it was "why is the trigger blind". `FIX-PDFX-TESSERACT-CONFIDENCE-...-TOTAL-PAGE-MISS` now
carries the goal.

### The bigger lever, found by accident
`pek_engine_adapter.py` ~1146-1165: when a pluggable backend is injected — the live config for **every**
backend — the whole table region collapses into ONE cell carrying the *region* bbox. The legacy `paddle_table`
branch it replaced iterated per-line results. So PEK-IMPL-OCR traded table structure for pluggability
fleet-wide, tesseract included. That is a strictly larger BCTC-quality lever than the backend choice ever was,
and it independently explains the 30/30 byte-identical result. Routed to architect — the port signature
literally cannot express what the caller needs, so it is a contract decision, not an edit.

### I ran the probe instead of re-filing it
QA said subtask-4 of `FIX-ORPHAN-FR4-FR5` "needs a gateway-capable session". I am one. Ran it: the FR-2 Rung B
shape returns **`released:0`** and the lock stays held; the control (release under the dead session's own id)
returns `released:1`. `original_owner_client_session` is accepted and **ignored**. The doc half landed, so the
row looks complete on inspection while being dead — 15 days of review missed it. **This falsifies
`feedback_orphan_signal_unreleasable_null_client_session_and_activesprints_only_flip`.** Second finding: the AC
demands "a real NULL-owner orphan-signal row" and there are **0** live — as written it needs a production death
to satisfy. Restated as a synthetic-fixture probe.

### Carry-over
- **I was wrong once this tick and recorded it.** `task_list_held` filters on `kind`, NOT `task_kind` (the
  latter is silently ignored → returns everything; response field is `task_kind`, the trap is real). CARD.md is
  CORRECT there. Its actual bugs: `payload={...}` must be a string, and Phase A omits required `owner_agent`.
- **Prose ceiling is now a starvation mechanism, not an annoyance.** manual-dispatch Step 2 could not stamp
  ranks 0/2/3 (34589B/12249B/12156B); the sweep is the *only* dispatch path for that class, and the longer a row
  is stranded the more prose it accretes. Could not fold onto the row that owns the sibling symptom — it is
  **11967B, 33 bytes under the ceiling**. Candidate set 127→146 in 9h.
- Before folding anything: **size-check the target first.** 4 of my intended folds were impossible; those
  dispositions went to the journal and one `signal_queue` row to qa instead.
- 22 of 27 envelopes were already covered by earlier ticks today. Envelope 16 claimed "zero board row tracks
  it" — false. Envelope 17 asks a question already decided **three times**; the real bug is the emitter's
  missing liveness predicate, so it will re-ask forever.
- INCIDENT_CAP slot 2 still free — nothing this tick justified overriding that. `.head` untouched.
- Standing push disarm in force — committed, nothing pushed.
