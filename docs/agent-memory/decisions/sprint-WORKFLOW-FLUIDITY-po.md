# Decision Journal — Sprint WORKFLOW-FLUIDITY · po

**Sprint goal:** No agent workflow can livelock, silently drop a signal row, or strand a task lock — remaining ranked fixes from the 2026-06-06 workflow-fluidity audit (F-4 already fixed in ORCH-TASK-CANON).
**Agent:** po
**Started:** 2026-06-06T20:09:07Z

---

### STEP po-S1 · po · 2026-06-06T20:09:07Z
**task-id:** BA-WORKFLOW-FLUIDITY
**what-done:** Kicked off sprint WORKFLOW-FLUIDITY: goal entry active, sprint container WF-1/WF-2/WF-3 (canonical schema), BA task + 2 DEFERRED backlog rows, umbrella lock task:WORKFLOW-FLUIDITY claimed (po, 3600s, gateway reachable).
**what-considered:**
- Scope all 9 non-OK findings into one sprint vs rank-by-blast-radius
- Hard depends-chain WF-1→WF-2→WF-3 vs dispatch-time ordering only
- F-10/F-11/F-13 in-sprint vs DEFERRED backlog rows
**why-decision:** Blast radius: F-12+F-2 burns a cron slot/h for ≤24h per fail-loud STOP (liveness); F-9+F-3 silently drops signal rows at :00 collisions (data loss); F-8 recurred this very sprint (F1B mutex-less). F-10/F-11/F-13 are observability/throughput niceties with zero liveness impact → DEFERRED rows so triage is durable, not prose. depends[] kept empty so one BLOCKED task can't strand the deadlock-fix sprint — sequential mandate already orders dispatch.
**why-change:** no change from audit's Rank 1/3 proposal; Rank 2 (F-4) dropped — verified already fixed (per-agent journal paths + cap telegram live in SKILL.md).
