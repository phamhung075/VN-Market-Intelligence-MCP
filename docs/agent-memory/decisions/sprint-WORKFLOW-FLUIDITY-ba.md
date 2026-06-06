# Decision Journal — Sprint WORKFLOW-FLUIDITY · ba

**Sprint goal:** No agent workflow can livelock, silently drop a signal row, or strand a task lock — remaining ranked fixes from the 2026-06-06 workflow-fluidity audit.
**Agent:** ba
**Started:** 2026-06-06T20:12:31Z

---

### STEP ba-S1 · ba · 2026-06-06T20:12:31Z
**task-id:** BA-WORKFLOW-FLUIDITY
**what-done:** Wrote WORKFLOW-FLUIDITY BA spec (docs/handoffs/WORKFLOW-FLUIDITY-BA-spec.md) covering WF-1 (FAIL-LOUD-STOP-RELEASE), WF-2 (signal_queue CAS + FU-ORCH-HEAD-CAS), WF-3 (dev-* gateway binding ruling).
**what-considered:**
- Pre-decide WF-2 option (retry-read vs SQLite) vs present both to architect per PO note
- Sequence WF-3 after WF-1 (simpler) vs surface as parallel since it is a 2h SPIKE with no code impact
- Scope WF-1 to developer flow only vs all three flows (developer/qa/fixer) since audit mentions all three STOP surfaces
**why-decision:** PO note explicit — no pre-decision on WF-2 options; both presented with trade-offs. WF-3 sequenced as immediate parallel with WF-1 because 2h SPIKE has no file contention with WF-1 flow edits. WF-1 scoped to all three flows (developer+qa+fixer) because fail-loud-protocol.md Error Boundary is inherited by all — fixing the protocol doc closes the class for future flows.
**why-change:** no change from audit Rank 1/3 proposal; BLOCKER-WF2-A (TS write path location) surfaced as new blocker not in audit (audit read only flow files, not TS source).
