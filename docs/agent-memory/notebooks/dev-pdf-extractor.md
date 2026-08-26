# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

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

## Cycle 2026-08-26 — FIX-MCPSERVER-PDFOCRWORKER-OCRONEPAGE... corpus sweep follow-up — PARTIAL, HALTED on live DB corruption

Router's corpus scan found 79 files/312 pages still stored-garbled (not
1 file — see `docs/signals/20260825T235317Z-pdfocr-orientation-corpus-
scope-79-files-supersedes-qa-estimate.json`). Whole-file re-extract would
cost ~7.4h to fix 312 real pages; added `--pages <comma-list>` targeted
mode to `scripts/migrations/reextract-pdf-ocr-orientation.ts` (12x
cheaper, default whole-file behavior unchanged). Persisted the
discriminator as `scripts/audits/detect-pdf-ocr-orientation-garble.ts`
(reproduced the router's 79/312 exactly) and a runner,
`scripts/migrations/sweep-pdf-ocr-orientation-garble.sh`.

Validated on 2 real rows before the bulk sweep (DIG_2024_Q4.pdf p33,
HSG_2026_Q1.pdf p4+p25) — both recovered clean, upright Vietnamese.
Committed (`f33aa338f`).

**Bulk sweep (`--apply`, 00:03:09Z) hit `SQLITE_CORRUPT` on
`data/live/market.db` at file #3, page 46** ("database disk image is
malformed"). Confirmed NOT scoped to my write: the live `mcp-server`
container hit the identical error on an unrelated `agent_signals` insert
in the same window (docker logs, 00:07:52Z). `PRAGMA integrity_check`
(direct file, capped at SQLite's own 100-error default) showed a
`Freelist: size is 0 but should be 1` header defect plus hundreds of
rowid-out-of-order errors spanning TWO b-trees by rootpage:
`pdf_extracted_text` (96) and `intraday_foreign_flow_5m` (180) — a
double-referenced-page signature. Cross-checked agent-memory
`project_sqlite_corruption_fix.md`: this is (at least) the 6th
documented occurrence of the already-escalated recurring-bug
`FIX-SQLITE-DOCKER-VIRT-CORRUPTION` — `pdf_extracted_text` was ALSO one
of the corrupted trees in the 07-30 recurrence. Ruled out the 08-06
recurrence's specific mechanism (Go stock-price re-arming WAL):
`journal_mode` reads `delete` right now, no `-shm`/`-wal` present.

Attempted a narrow, low-risk repair — re-inserting the 28 now-missing
rows verbatim from `data/live/market.db.backup` (independent, quick_check
`ok`, ~20h stale) to at least undo the regression back to pre-sweep
(garbled-but-present). **All 28 attempts failed, same SQLITE_CORRUPT** —
100%, not intermittent like the sweep itself (which had ~3/77 succeed).
Made no further write attempts after that.

**Net result:** 5 files/12 pages fixed+verified clean (2 pre-sweep +
3 sweep survivors: `20250324-DBC-CBTT-...`, `20250326-DIG-BCTC-hop-nhat-
kiem-toan-nam-2024-cks.pdf`, `20260420-DHG-BCTC-Quy-1.2026.pdf`). 17
files/28 pages now REGRESSED — row deleted, re-insert crashed, page now
has NO row at all (worse than garbled-but-present); full list in the
incident signal. 57 files/~272 pages untouched. Sweep code itself is
correct in isolation; the corruption is an environmental hazard it
exposed, not a defect in `--pages` targeting.

Filed `docs/signals/20260826T001719Z-marketdb-corruption-during-pdfocr-
sweep-writes-now-failing.json` (priority critical, to po) with full
timeline/evidence + a pre-identified `quick_check`-clean restore
candidate (`data/live/market.db.backup`) for db-data-integrity/ops, so
their triage starts from evidence instead of zero. Added the fleet-
standard "journal_mode not set here" comment
(FIX-SCRIPTS-MIGRATIONS-MARKETDB-WAL-REARM-SAME-DEFECT convention) to
both new/touched scripts — every sibling `scripts/migrations/*.ts`
already carried it, these two didn't. Runbook updated
(`docs/protocols/bctc-extraction-runbook.md`) with the honest partial
outcome and an explicit DO-NOT-resume-sweep note. Committed `d90c45997`.

**DID NOT:** attempt any DB-wide repair (VACUUM/.recover/restore) — that
call belongs to db-data-integrity/ops, not this zone. Did not mint a
board row (per dispatch instruction, PO owns minting off the existing
corpus-scope signal). Did not touch `apps/pdf-extractor/` — this entire
cycle was scripts/migrations + scripts/audits + docs, explicitly
dispatched to this agent by the router for this exact file (see task
brief), not a self-initiated zone excursion.

### Status
Not a task-board row — signal-routed to po. No next_agent; this cycle
ends on the critical-incident signal. Sweep resumption is blocked on
external DB recovery, out of this agent's hands.

AC-0 memory sweep FAILS (rising, not flat: 42.99%→56.42%→90.11%→100.00%→100.00% of 2.5GiB cap for N=0/1/3/6/14 fires on DBC_2025_Q4). Mid-cycle PO ruling (`2826b101f`) minted an orientation P0 ahead of this row; stopped before AC-1..AC-6 (frozen sample would risk contamination + AC-0 alone is dispositive). Full methodology, raw numbers, code-change note, and a notebook-corruption incident write-up: `docs/agent-memory/decisions/dev-pdf-extractor-ac0-findings-20260825T1830Z.md`. Row untouched by me, sits in `ready[2]`, not a WIP lane.
