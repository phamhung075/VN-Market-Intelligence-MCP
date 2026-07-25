# BCTC refine backlog is 100% stalled — every pending row has `page_count=0` → skipped as "cover-letter" → daily refine crons no-op silently

**Filed:** 2026-07-17T11:07Z (cowork dispatcher, tick 11:00Z WORK, slot `refine-bctc-slot-3` guaranteed=false). **To:** po. **No competing board row / handoff exists** (prior-art grep of docs/handoffs, signal_queue, docs/signals — clean).

## What happened (observed on TWO refine ticks, same signature)
The daily refine crons fire, pick the OLDEST pending row via `get_bctc_pending_refine (limit:1)`, and **skip it as a cover-letter** (`TICKER_YEAR_Qn.pdf` with `page_count<=4`), reporting a clean skip to WORK and exiting. Looks healthy per the completion report. It is not — the entire refine backlog is stuck.
- **09:00Z** (slot `refine-bctc-slot-1`): picked `MBB_2026_Q1.pdf` (page_count=0) → skipped.
- **11:00Z** (slot `refine-bctc-slot-3`): picked `MBB_2026_Q1.pdf` (page_count=0, id `1d94c902-a6b6-460b-a995-0f9cdb42e445`) → skipped **again** — the same row is still `result[0]`, never dequeued.

## RAW ground truth — the whole queue is `page_count=0`, not one poison-pill
`get_bctc_pending_refine (limit:25)` @ 11:07Z returned **25/25 rows with `page_count: 0` and `windows: []`** — and these are real multi-page quarterly filings, NOT cover letters:

```
MBB_2026_Q1  POW_2026_Q1  DPM_2025_Q4  REE_2025_Q4  DPM_2026_Q1  VPB_2026_Q1
VRE_2026_Q1  TCH_2025_Q4  KBC_2026_Q1  HSG_2026_Q1  VHM_2026_Q1  MWG_2026_Q1
NKG_2026_Q1  VIC_2026_Q1  HCM_2026_Q1  VCI_2026_Q1  SSI_2026_Q1  KBC_2025_Q4
MWG_2025_Q4  PPC_2025_Q4  REE_2026_Q1  NVL_2025_Q4  NVL_2026_Q1  TCH_2026_Q1
+ fallback-KDC-2026-Q1 (empty filename)
```
Every row: `refine_status: PENDING`, `text_status: COMPLETE`, `confirm_status: PENDING`, `page_count: 0`, `windows: []`.

A VIC / VHM / MWG quarterly BCTC is never ≤4 pages — `page_count=0` for these is definitionally wrong. **Cross-plane corroboration:** `text_status=COMPLETE` (OCR ran, documents have real content) coexisting with `page_count=0` + `windows=[]` is an internal contradiction — the text-extraction plane says "content present," the page/window plane says "0 pages." They disagree, so the page/window data is broken; the filings are not genuinely empty. (If they were empty, OCR would not be COMPLETE with content.)

## Two compounding defects (both for po → dev triage)
1. **Upstream data (root cause):** at the moment the refine worker evaluates a row, `page_count` and `windows[]` are unpopulated (0 / `[]`) across the ENTIRE backlog despite `text_status=COMPLETE`. Either the page-raster/window-generation stage never ran / its writes never landed, OR the fields are populated later in the refine flow and the skip heuristic reads them too early. Dev to confirm which. Likely owner: **dev-pdf-extractor** (raster/window stage) and/or the refine flow author.
2. **Masking heuristic (why the stall is silent):** the cover-letter skip rule `page_count<=4` treats `page_count=0` (missing/unrasterized data) identically to `page_count=1..4` (a genuine short cover letter). Result: every real filing is silently skipped as a cover-letter, every daily refine cron reports a clean skip, and the backlog never drains. Passive health masking dead data (cf. `feedback_passive_health_masks_dead_data`, `feedback_composite_score_masks_dead_detector_pruned_table`). **Fix should distinguish `0 = missing → fail loud / route to raster` from `1..4 = genuine cover letter → skip`.** A `page_count==0` row must NOT be classified as a cover letter.

## Why RECURRING / escalate now
- Same signature on 2 consecutive refine ticks (09:00Z, 11:00Z) — `feedback_recurring_bug_escalation` (2+ → prioritise/block, not `priority:low`).
- Systemic, not a single row: 25/25 backlog rows affected, incl. 20+ major tickers (banks VPB/MBB, VIC/VHM/VRE, MWG, SSI/HCM/VCI, DPM/REE/POW/PPC, NKG/HSG/TCH/KBC/NVL) for Q4-2025 + Q1-2026.
- Silent: the refine pipeline's own completion reports say "clean skip / exit cleanly" every fire — nothing surfaces the stall except this cross-tick observation.

## Blast radius (why BLOCK the fix, not a same-second P0)
- Refine feeds downstream BCTC enrichment (refined markdown → analysis-briefs / bctc-analyst). 20+ tickers' quarterly financials are not being refined → downstream briefs run on unrefined/degraded inputs for those names.
- It's an off-market background enrichment pipeline (refine crons are off-market), so no live market/user-facing outage this instant — but it has been silently draining zero for at least ~2h (09:00Z→11:00Z) and, given the masking, plausibly longer. Prioritise, don't firefight.
- Self-heal: **none** — the poison-pill (`page_count=0`) is stable; every future refine tick will re-skip the same head row until the raster/heuristic is fixed. This does NOT self-heal on a date rollover.

## Dispatcher actions taken / NOT taken
- **Taken:** full dispatcher flow completed clean for the 11:00Z tick (slot token claimed+released `released:1`, last_fired advanced 07-16T11:07:51.428Z→07-17T11:05:10.275Z, pressure emitted `cycle_snapshot_promoted:false`, FIRE telemetry `docs/signals/cowork-team-2026-07-17T11:05:37.294Z.json`, fire-election lock released `released:1`). This durable handoff + one `to:po` signal_queue row (status NEW, via `scripts/orch-apply.sh` write-gate).
- **NOT taken (out of lane / Team Boundary):** did NOT spawn any dev-team agent (dev-pdf-extractor / po / developer) — cross-team escalation only. Did NOT mutate any refine DB row / dequeue the poison-pill (refine pipeline's lane). Did NOT re-run the refine slot (would re-skip the same head row). Did NOT mark any existing `to:po` signal row READ (standing rule) — this is a NEW row I minted.
