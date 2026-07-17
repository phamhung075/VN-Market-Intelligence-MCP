# Decision Journal — Sprint TOKEN-ECONOMY-AUDIT · po

**Sprint goal:** Recover ~800k-1.2M tok/day (honest net after overlap) via lazy-load / main-flow-subflow splits per docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md
**Agent:** po
**Started:** 2026-07-17T04:46:00Z

---

### STEP po-S1 · po · 2026-07-17T04:46:00Z
**task-id:** TOKEN-ECONOMY-AUDIT (rerank of 27 remaining TE rows)
**what-done:** Re-ranked the 27 remaining TE backlog rows in BOUNDED-1's (priority_rank, backlog-idx) pick order via scripts/orch-apply.sh; wrote NB-AUDITOR-MAIN-SPLIT supersede marker.
**what-considered:**
- Lift-ALL above ULTRACODE + 6 active high sprints (blanket max elevation)
- Interleave/stage: P1 for high-ROI sequenced waves 2+3, front-of-P2 for governance/cleanup, P0 untouched — CHOSEN
- Elevate to P0 (rejected: token hygiene must not tie/jump genuine criticals incl UC-RDL-P1)
**why-decision:** BOUNDED-1 is the idle-capacity lane (WIP-cap 1) and is INDEPENDENT of the supervised sprint lane (wip_max=2) that drains the 6 active sprints — so elevating TE here cannot starve those sprints; the only real guard needed is not jumping the 6 P0 criticals. Staged lift: Band-1 (waves 2+3, 13 rows P2->P1, idx 0-12) captures ~90% of recoverable tokens (flow splits T-02/T-03/T-05 ~200k+200k+165k, skill cards T-08/T-11/T-12 etc.) and drains right after P0; Band-2 (13 rows @ front-of-P2, idx 13-25 — governance T-24/T-25/T-20 lifted P3->P2 as regression-stoppers that lock in Band-1 savings, unwaved-P2 T-18/T-19/T-22/T-27/T-28, cleanup T-29..T-33 lifted P3->P2) drains ahead of the generic P2 backlog without jumping genuine P1 product work. Simulated sort confirms 3 eligible P0 FACTORY rows still pick first, then all 13 Band-1 rows before every other P1.
**why-change:** No change from router intent. Dep gates already live (TE-T23 depends:[TE-T12] both P1, T-12 ordered first; TE-T03 depends:[TE-T01]=done_verified). TE-T15 left UNTOUCHED — already supervised:true (held out of BOUNDED-1 drainer), stays P3 at idx 308 (last), coordinated with RC-ORCHMONO per its own note. TE-T06 supersede note already present; added defensive superseded_by:TE-T06 on NB-AUDITOR-MAIN-SPLIT (priority=low, cannot pick before P1 TE-T06).
