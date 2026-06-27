# Decision Journal — BCTC-REFINE-STALL-RETRIGGER

**Task ID:** BCTC-REFINE-STALL-RETRIGGER
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
