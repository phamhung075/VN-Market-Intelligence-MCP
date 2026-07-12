# SPIKE-BCTC-TABLEROWS-FROZEN-HOLLOW-DONE — findings

- **Question:** Where should `bctc_layout_units` → `bctc_table_rows` (and/or `bctc_md_tables` → `bctc_table_rows`) derivation happen — is it wired post-D3C (`bctcExtractReconcileJob`, commit `43f4c8a22`)? Why does the reconcile job mark a queue row `done` when it produced `bctc_layout_units` but zero `bctc_table_rows`? Is the derivation step missing, broken, or silently failing?
- **Time-box:** 120 min (mode=spike, read-only — no code changed, no branch merged)
- **Zone:** multi (`apps/mcp-server/` — investigated; `apps/pdf-extractor/` — investigated)

## Approach tried

Read-only investigation only, per SPIKE-mode contract:
1. Read the D3B/D3C commits (`850ced6ee`, `43f4c8a22`) and the architect design doc that spec'd them (`docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md`).
2. Read `bctcExtractReconcileJob.ts` in full (the code that marks queue rows `done`).
3. Traced every write path into `bctc_table_rows`, `bctc_layout_units`, `bctc_md_tables`, `bctc_refined_units` across both `apps/mcp-server/` and `apps/pdf-extractor/` (grep + read).
4. Read the original `BCTC-LAYOUT-FIRST` architecture brief (2026-05-26) that created `bctc_layout_units` in the first place, to establish its intended purpose.
5. RAW-verified live named-volume `market.db` via `docker compose exec mcp-server bun -e '...'` (direct SQLite queries — not the endpoint, not a badge).
6. Cross-referenced `docs/data/orch/orch-state.json` board history for prior tasks/sprints touching the same pipeline (`REFINE-CRON-ARM`, `BCTC-REFINE-STALL-RETRIGGER`).

## RAW-verified live state (2026-07-12, docker exec on named volume, not the endpoint)

```
bctc_layout_units   MAX(extracted_at)=2026-07-12 06:02:13   count=1829   (actively growing)
bctc_table_rows      MAX(extracted_at)=2026-07-08 12:35:10   count=4091   (frozen 4d — matches PO triage exactly)
bctc_md_tables        MAX(extracted_at)=2026-05-26 17:21:28   count=1      (dead — matches PO triage exactly)
bctc_refined_units   MAX(refined_at)=2026-07-04 14:08:34      count=506    (frozen 8d — OLDER than table_rows freeze)
financial_reports.refine_status breakdown: DONE=8, PARTIAL=7, PENDING=151, REJECTED_SANITY=2
bctc_vps_queue status since 2026-07-10: done=42, enrich_failed=24, pek_triggered=43, url_not_found=3
  (matches PO triage's 42 done / 24 enrich_failed / 42 pek_triggered almost exactly — small drift = time elapsed)
```

Hollow-done sample (5 most recent `done` queue rows, all with `layout_cnt>0` and `tablerow_cnt=0`, all still `refine_status=PENDING`):

| ticker | period | layout_cnt | tablerow_cnt | refine_status |
|---|---|---|---|---|
| MSN | 2025-Q2 | 68 | 0 | PENDING |
| VIX | 2025-Q2 | 43 | 0 | PENDING |
| FRT | 2025-Q2 | 28 | 0 | PENDING |
| GEX | 2025-Q2 | 54 | 0 | PENDING |
| KDC | 2025-Q2 | 53 | 0 | PENDING |

## Findings

### F1 — `bctcExtractReconcileJob`'s "layout_units alone = done" behavior is intentional, documented, QA-approved design — not a bug in the reconcile job's code

`apps/mcp-server/src/scheduler/financial-reports/bctcExtractReconcileJob.ts:339-363` explicitly ORs across three tables: `(bctc_layout_units WHERE quarantined=0 count>0) OR (bctc_table_rows count>0) OR (bctc_md_tables count>0)`. This is not an oversight — it is a verbatim implementation of **D3, point 3** of the architect's own design doc (`docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md`), flagged there as **R-CRIT-2 ("MUST fix in this task")**: the architect found that `/pek-extract`'s push-back (`pushBctcLayoutHandler.ts`) writes ONLY `bctc_layout_units`/`bctc_page_zones`, and explicitly decided that gating success on `bctc_layout_units` alone (rather than `bctc_table_rows`/`bctc_md_tables`, which `/pek-extract` never populates) was required to avoid reproducing the original 0-row silent-failure class one layer downstream. Commit `43f4c8a22` shipped this with 14 tests, QA-APPROVED. **The reconcile job is doing exactly what it was designed and reviewed to do.**

### F2 — `bctc_layout_units` was never designed to serve `bctc_table_rows`; there is no wired (or ever-planned) derivation step

`pushBctcLayoutHandler.ts:1-20` (doc comment, verbatim): *"Zero writes to `bctc_table_rows`, `bctc_balance_checks`, or `bctc_md_tables`."* Confirmed by the originating architecture brief, `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md`: `bctc_layout_units`/`bctc_page_zones` were built for sprint **BCTC-LAYOUT-FIRST**, whose stated purpose is a **"geometric zone review overlay"** — a QA/pass-rate diagnostic and human-inspection surface (`bctcInspectHandler.ts` overlay toggle), explicitly **not** the structured serving path. §3.1: *"Two new tables, both owned exclusively by mcp-server... Zero collision with `bctc_table_rows`."* §7 freezes `bctc_table_rows`'s read path as untouched. A repo-wide grep of `stitched_markdown` (the only column on `bctc_layout_units` that contains actual OCR'd cell text) shows it is consumed ONLY by `bctcInspectHandler.ts` (human overlay), a handful of tests, and nowhere else — **no parser, no derivation usecase, no cron anywhere in `apps/mcp-server/` or `apps/pdf-extractor/` turns `bctc_layout_units.stitched_markdown` into `bctc_table_rows` rows.** This was never built because it was never scoped — layout-first output was designed as a diagnostic overlay, not a numeric-row source.

### F3 — `bctc_table_rows` has exactly ONE live producer today, and it is a THIRD, independent pipeline that has nothing to do with PEK/layout-first

Confirmed via `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts` (`refineOneReport`, Phase 4, lines 458-506): the **BCTC-AGENTIC-REFINE** pipeline is the only code path (besides the frozen, superseded row-based `/extract-tables` handler) that writes `bctc_table_rows` — it parses AGENT-refined markdown windows (`bctc_refined_units`, produced by dispatching Claude subagents against raw `pdf_extracted_text` pages) and materializes rows via `parseRefinedMarkdown`. This pipeline reads `pdf_extracted_text`/`financial_reports.text_status`, **never `bctc_layout_units`** — it is completely orthogonal to the PEK/layout-first pipeline that D3B/D3C wired up. Gating query confirmed in `getBctcPendingRefineTool.ts:168-169`: `WHERE text_status='COMPLETE' AND refine_status IN ('PENDING','PARTIAL','FAILED')` — zero reference to `bctc_layout_units` anywhere in the eligibility logic.

### F4 — The agentic-refine pipeline's *trigger* was deliberately made non-automated ("Option-Y"), and depends on a fragile, session-scoped Claude-native cron — which has gone silent

`bctcRefineJob.ts:1-22` (module doc, verbatim): *"OPTION-Y (§0.7.2 ruling): The production spawn path (`spawn("claude",...)`) and the cron entry point `runBctcRefineJob()` have been DELETED. Orchestration now lives on the host-level fleet cron (CC Agent/Task subagent fan-out)."* — i.e. there is **no in-container/Docker scheduler job** that can produce `bctc_table_rows`; `cron-registry.json` confirms `bctcPdfPullJob`/`bctcExtractReconcileJob` are registered Bun cron entries (run inside the always-on `mcp-server` container), but nothing refine-related is. The actual trigger is `.claude/commands/crons/cron-refine-bctc.md`, a **Claude-native session-scoped `CronCreate` cron** (schedule `0 9,14,20 * * *` UTC) that must spawn the `refine_bctc_md` subagent through a live interactive CLI/gateway session.

RAW evidence this trigger is currently dormant:
- `bctc_refined_units` (written exclusively by the refine orchestrator) has produced **zero new rows since 2026-07-04** — 8 days as of this SPIKE.
- `financial_reports` has **151 rows stuck at `refine_status=PENDING`** (vs only 8 DONE / 7 PARTIAL) — a large, growing backlog.
- The hollow-done sample above shows PEK-extracted reports (`layout_cnt` 28-68) sitting at `refine_status='PENDING'` — never picked up.
- Board task `REFINE-CRON-ARM` (`docs/data/orch/orch-state.json`, sprint `BCTC-ANALYTICS-LAYER`, opened **2026-06-12**) — whose entire purpose was to durably arm+verify `cron-refine-bctc` — is **still `status:"TODO"` today, 30 days later**, with only its own note recording a single ad-hoc `CronCreate id ec99e6c1` spawned once on 2026-06-12 that was never subsequently re-verified.

### F5 — This is a RECURRING instance of an already-diagnosed defect class, not a new one

Sprint `BCTC-REFINE-STALL-RETRIGGER` (opened 2026-06-27, still `ACTIVE`) diagnosed the identical symptom two weeks earlier: *"Root causes: (a) cowork CronCreate not re-armed after session restart 2026-06-07..."* Its sub-task `BCTC-REFINE-A1` (DONE, 2026-06-27) explicitly falsified "the agent never executes" and concluded *"No bug; only slow throughput (14 units/day)"* — then `T1` (raise chunk size 7→12) and `T2` (add 2 more daily cowork-schedule slots: 09:00/11:00/14:00/16:30 UTC) shipped `DONE_VERIFIED` the same day, targeting ~48 windows/day (~36-day drain). But:
- The one thing that would have *caught* a later re-stall — `BCTC-REFINE-T3-WATCHDOG` (2-hourly staleness check + WORK-channel alert) — is still `status:"BACKLOG"`, never built ("DEFERRED until T1+T2 verified draining" — that verification never happened).
- `docs/data/cowork-schedule.json` today (2026-07-12) contains **zero** `bctc`-related slots — the 4 slots T2-SLOTS added (commit `19764c0e2`) are no longer present in the live file (23 slots total, none reference `bctc`). Not root-caused further within this time-box (worth a follow-up bisect), but the practical effect is the same: no live cowork-dispatched trigger path for `refine_bctc_md` exists today either.

So the pipeline has now gone silent a **second (or third)** time via the same underlying mechanism (Claude-native/cowork session-scoped dispatch with no durable, session-independent backstop) that was already named as root cause on 2026-06-27 and partially mitigated (throughput) but never durably fixed (no watchdog, no launchd-class backstop). This matches the project's own recurring-bug-escalation policy (2+ occurrences of the same underlying class ⇒ escalate, don't re-treat symptomatically).

### F6 — The "hollow-done" symptom is a masking side-effect of F1+F4, not an independent defect

Before D3B/D3C (shipped 2026-07-10), the old synchronous 0-row gate in `bctcPdfPullJob.ts` checked `bctc_table_rows`/`bctc_md_tables` directly and would have marked these exact rows `enrich_failed` — an accurate (if noisy) signal that no serving data had landed. D3C's intentionally-broadened success check (F1) now marks a row `done` as soon as PEK's layout-first pass lands ANY `bctc_layout_units`, which happens reliably (the PEK pipeline itself is healthy — 1829 rows, growing hourly). The `bctc_vps_queue.status='done'` column therefore no longer distinguishes "PEK extraction ran" from "analysis-ready data exists" — it silently removed what used to be an (accidental) leading indicator of the F4 refine-pipeline outage. This did not cause any NEW data loss (the refine pipeline was already dormant per F5's 2026-06-27 evidence, well before D3C shipped), but it does make the outage invisible on the BCTC queue's own status column, which is presumably why the outage went unnoticed for over a week until PO's hourly triage caught it via a completely different signal (telegram conviction-skip reports #3565-3572).

## Answer to the root question

**The layout_units→table_rows derivation step does not exist, was never wired, and was never scoped to exist** — `bctc_layout_units` (LF-OVERLAY, a geometric-zone QA/review overlay) and `bctc_table_rows` (BCTC-AGENTIC-REFINE, an agent-driven markdown-refine → parse pipeline) are two independent, non-communicating serving paths that both happen to originate from the same PDF. `bctcExtractReconcileJob` is not broken; it accurately reports "PEK's layout-first extraction phase completed," which was the ONLY thing D3/D3C ever claimed to fix (the pull cron never even calling the extraction endpoint at all). The actual defect is one layer further downstream and pre-existing: **the sole pipeline capable of producing `bctc_table_rows` (BCTC-AGENTIC-REFINE) depends entirely on a session-scoped Claude-native cron trigger with no durable/session-independent backstop and no automated staleness alarm, and that trigger has gone dormant — for at least the second time in two weeks.**

## Recommended next step: real sprint (not abandon, not "needs more investigation" — root cause is conclusive)

Filing follow-on FIX board row per SPIKE contract rather than fixing inline (durable-cron-backstop work is genuinely `apps/mcp-server`+ops-adjacent infra design, not a small in-place patch, and this SPIKE's mandate is diagnosis):

1. **HIGH — `FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP`** (filed to `task_board.backlog[]`, see board): give `refine_bctc_md` dispatch a session-independent backstop, mirroring the already-proven `com.vn-market.cowork-guaranteed-slot-firer.plist` launchd pattern (confirmed live via `launchctl list` during this SPIKE) instead of relying solely on a bare Claude-native `CronCreate`. This directly unblocks the 151-report `PENDING` backlog and is the durable fix for the recurring class in F5.
2. Fold/supersede `REFINE-CRON-ARM` (stale `TODO` 30 days) into the above rather than re-attempting a bare re-arm — a 3rd bare `CronCreate` attempt would very likely just die the same way within days, per F5's evidence trail (2 prior attempts, both dead).
3. Build `BCTC-REFINE-T3-WATCHDOG` (already fully scoped, sitting in `BACKLOG` under sprint `BCTC-REFINE-STALL-RETRIGGER`) so the NEXT stall alarms automatically instead of silently accumulating for a week+.
4. Optional/cosmetic (not a "bug fix" — current reconcile-job behavior is correct per its own spec): consider a passive observability signal on `bctcExtractReconcileJob` for rows that resolve `done` via `bctc_layout_units`-only (`layout_cnt>0 AND table_row_cnt=0`), so "hollow-done" is visible on the next audit pass rather than indistinguishable from a fully-served report. Deliberately NOT bundled into item 1 — do not conflate an observability nice-to-have with the actual root-cause fix.

## Code reference

Investigation was 100% read-only (`Read`/`Bash`/`docker exec` queries only). Throwaway branch `spike/bctc-tablerows-frozen-hollow-done` created per SPIKE protocol, contains no commits, deleted at cleanup.
