# Decision Journal — Sprint DEFERRED-TASK-SCHEDULER-MVP · ba

**Sprint goal:** at(1) one-shot deferred-task scheduler (verify-loop MVP) — requirement spec from architect brief 2026-06-29.
**Agent:** ba
**Started:** 2026-06-29T21:00:00Z

---

### STEP ba-S1 · ba · 2026-06-29T21:00:00Z
**task-id:** BA-DEFERRED-SCHEDULER
**what-done:** Authored full requirement spec (docs/handoffs/BA-DEFERRED-SCHEDULER.md) mapping 8 STs to DDD layers, tracing all 12 ACs to blocking gates, and outlining 3 end-to-end acceptance-test scenarios (G1/G2/G3) from the locked architect brief.
**what-considered:**
- Design is fully locked (user + architect); BA scope = faithful transposition to implementable FRs, not re-design.
- `claim_due_scheduled_tasks` exposure: brief says "NOT an MCP tool" yet Step 0b.3 pseudocode calls it via `call_tool`. Flagged as Q2 implicit (non-blocking): must be reachable by cowork-team but excluded from public agent packages. Implementation detail for dev-mcp-server.
- `done` vs `fired` terminal ambiguity: both exist in the CHECK enum; sweeper sets `fired`. Q1 flagged as non-blocking: MVP treats `fired` as terminal; `done` reserved Phase-2.
**why-decision:** No PO blockers found. Spec maps architect brief §c–h verbatim onto FR/NFR/AT layers; open Q1–Q3 are advisory implementation-detail notes for dev-mcp-server, not unresolved design decisions.
**why-change:** No change from plan — design SSOT is the locked brief; spec faithfully transposes it without deviation.
