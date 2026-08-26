# dev-pdf-extractor — Notebook

Zone: `apps/pdf-extractor/` | Stack: Python/FastAPI | DB: pdf_extractor.db (write)

**Runbook:** `docs/protocols/async-blocking-pattern.md` — asyncio.to_thread() for sync I/O, /health health-checks on overloaded services.

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

---

## Cycle 2026-08-26 — FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S

AC-2 REPRODUCE FIRST, done before any fix: 2 concurrent extractions, 1
slot, wait bound shortened to 0.15-0.2s (test-only override of
`_SEMAPHORE_WAIT_SECONDS`, not the forbidden "raise the wait" non-fix) —
`__tests__/unit/test_pek_extract_silent_drop_durable_record.py` pins the
loser's `SemaphoreContendedError` landing as a silent drop pre-fix.

AC-1 fix chose the "durable record" branch of the row's OR, not
"acquire-before-202": new `infrastructure/pek_extraction_status_
repository.py` (SQLite table in the existing isolated `pdf_extractor.db`)
records accepted/done/failed per `report_id`. `routes_pek.py` writes
"accepted" pre-202; `pek_run_helper.py`'s except-branch (previously ONLY
`logger.error()`) now also writes `mark_failed`. New `GET /pek-extract/
{report_id}` (`interface/routes_pek_status.py`) makes it queryable.
Deliberately left `pek_engine_adapter.py` untouched — already 1298L vs
1291L size-lint upper, pre-existing offender; no semaphore-timing code
moved. `__tests__/unit/test_pek_extract_status_route.py` covers the full
HTTP chain (POST accepted → background → GET reflects done/failed).

AC-5 doc-drift fixed: `routes_pek.py`/`schemas.py` docstrings no longer
restate the market-hours window (was wrongly 08:59) — now point at
`domain.primitives.market_hours.primitive.is_vn_market_open_utc()` as SSOT.

AC-3 answered, not fixed: `Semaphore(1)` was DELIBERATE (REQ-PEK-9d,
architecture-briefs/2026-05-26-pek-integrate-design.md — prevents 2
concurrent model instances doubling RSS against the 2.5GB Docker cap;
measured +845MiB/extraction). The 43-req/hr-vs-1-slot mismatch is a
CALLER problem (mcp-server's `bctcExtractReconcileJob.ts` re-fires
DEFAULT_BATCH_SIZE=20 every 30min, no pacing) — out of zone, so AC-3's
follow-up + AC-4 (client-side market-hours gate / honor `retry_after`)
both filed as one signal to po for a new dev-mcp-server row:
`docs/signals/20260826T072721Z-pek-reconcile-batch-no-pacing-vs-single-
slot.json`.

Full suite: 1131 passed, 5 pre-existing failures (missing `pandas` in
`.venv`, 1 integration test needs a real local PDF fixture) — confirmed
unrelated, none touch a file this row changed. size-lint: 0 new
offenders (`pek_run_helper.py` grew 135L→159L, header re-baselined
in-file). Row moved `ready[]`→`qa[]`, `next_agent: qa`, full status_note
on the row itself. AC-6 (no container touch) / AC-7 (no run) held
throughout — container `417febec1a03` verified healthy, untouched.
