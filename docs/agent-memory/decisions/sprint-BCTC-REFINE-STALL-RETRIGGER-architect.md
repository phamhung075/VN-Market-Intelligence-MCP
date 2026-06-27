# Decision Journal — BCTC-REFINE-STALL-RETRIGGER

**task-id:** BCTC-REFINE-STALL-RETRIGGER
**Date:** 2026-06-27T18:48Z
**Author:** architect
**Mode:** recon-first / blueprint-only

---

## What was considered

**Track (a) — Why stall, not just "fix the cron":**
Three candidate explanations explored: (1) server-side cron deleted (confirmed — Option-Y comment in bctcRefineJob.ts), (2) cowork CronCreate lapsed on session restart (confirmed — cowork-team is CronCreate-scoped), (3) task_claim race preventing slot execution (possible secondary factor, not primary root). Decision: root cause is (1)+(2) combined — the migration from container cron to agent cron introduced a hidden dependency on session continuity with no fallback.

**Track (b) — VIC hypothesis ranking:**
Three candidate hypotheses: C-1 (late filing → 5 attempts exhausted before PDF available), C-2 (batch-size cap pushing VIC below position 20 for first N runs), C-3 (SSC title-match regex miss). All three are plausible given VHM is HOSE-same-pathway and successfully ingested. Could not confirm without RAW-probe of `bctc_vps_queue WHERE action_code='VIC'`. Decision: B1 (RAW-probe + manual reset) is the required first step before structural fix; structural fix depends on which hypothesis is confirmed.

**Track (c) — Where to wire the watchdog:**
Two options: (A) extend `freshnessSlaMonitorJob.ts` + `freshnessSlaChecker.ts` as a new signal type; (B) new dedicated `bctcRefineStalenessJob.ts`. Decision: dedicated job preferred because (1) refine-queue depth is not a signal-source freshness concept — it's a pipeline-processing depth, conceptually different from the SLA checker's domain; (2) dedicated job allows per-track cooldown (6h independent of price/news SLA); (3) fits the existing financial-reports/ scheduler subfolder pattern (`bctcOverdueCheckJob.ts` peer).

## Why this design approach

**Not a fix for the in-container spawn:** Option-Y ruling is correct — claude CLI is absent in container, and adding it would create a heavyweight dependency and rebuild surface. The cowork agent architecture is correct; the gap is observability + session-restart resilience.

**Re-arm as FIRST action:** The 47-doc backlog and VHM/VIC user impact are TODAY's problem. The full structural fix (Track c watchdog) is a dev sprint that won't ship for hours. Re-arm is a 30-second ops action that unblocks immediately.

**Cowork re-arm does NOT require a new dev task:** The /cron-cowork-team skill re-arms the existing cowork CronCreate. No new code needed for the immediate fix.

## Why no change from plan

Recon confirmed PO's raw-probe baseline exactly. No new root cause found that changes the PO's diagnosis. The architect adds structural detail (Option-Y deletion evidence, batch-size cap, observability gap design) but the PO's three-track decomposition was correct.

---

## THROUGHPUT-DRAIN Re-Scope Entry — 2026-06-27T19:38Z

**task-id:** BCTC-REFINE-STALL-RETRIGGER
**what-done:** Specced T0/T1/T2/T3 lever values; eliminated duplicate board representation; updated brief.

**T1 — REFINE_CHUNK_SIZE ceiling decision:**
- Considered: chunk=10 (safe, suboptimal), chunk=12 (chosen), chunk=15 (rejected).
- Diagnostic baseline: 7 windows / ~228s / ~62k tokens on GVR via Haiku. Per-window avg: 32.5s, 8.9k tokens.
- chunk=12: worst-case dense tables 12×15k=180k < Haiku 200k at 75% budget. TTL: 12×39s=468s << 1800s. CHOSEN — context-bound, not timeout-bound.
- chunk=15: 15×15k=225k > 200k on dense table-heavy PDFs. Context saturation risk. REJECTED.
- Throughput: T1 alone gives 2×12=24 windows/day (+71% vs 14/day current).

**T2 — Slot timing decision:**
- Evaluated 11:00 UTC + 16:30 UTC. Both verified clear of OFF-HOSE, bctc-analyst (15/18/21/00), chef-evening (19:45), tnb-audit (20:13), digest-daily (17:30). CHOSEN.
- Rejected 10:00 UTC (1h gap from slot-1 is insufficient for 400s+ max fire duration).
- Combined T1+T2: 4×12=48 windows/day. ~36-day drain for ~1,739 total windows (vs 124-day current).

**T0 — Reset-guard decision (P0 blocker):**
- RAW-confirmed clobber 2026-06-27T19:35Z: GVR 49 DONE units → 7 after ad-hoc worker pushed reset=true.
- Root: `is_first` in Phase 2 can fire when agent bypasses skip-set under non-standard prompt.
- Server-side guard option REJECTED (requires rebuild, slower to ship).
- Flow-doc guard CHOSEN: `has_done_units = units.some(u => u.window_status === 'DONE')` after Step 5; `is_first = (pushed_ids.size == 0 AND NOT has_done_units)`. Routes via agent-md-factory.
- Why T0 first: T1 raises damage/clobber from 7 to 12 units lost. T2 adds more clobber opportunities. Amplifiers must not ship before the guard.

**Board duplicate elimination:**
- Sprint was in both ready[] and active_sprints[] — conflicting SSOT.
- Chose: update active_sprints[], drop ready[] dup, set head.active_task_id=T0.
- Both validators exit 0; 73 SHG coherence warnings = pre-existing baseline (unchanged).
