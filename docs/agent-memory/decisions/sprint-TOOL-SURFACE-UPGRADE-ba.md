# Decision Journal — Sprint TOOL-SURFACE-UPGRADE · ba

**Sprint goal:** 162-tool surface auditable and honest: telemetry per-call (U1), registry generated not hand-rotted (U2), 12 weak-claim tools integrated or removed (U3), direction+delta sweep (U4), foreign-flow dead holding_ratio field fixed (U5), TSH leftover merges executed (U6).
**Agent:** ba
**Started:** 2026-06-07T08:30:00Z

---

### STEP ba-S1 · ba · 2026-06-07T08:30:00Z
**task-id:** BA-TSU-1
**what-done:** Decomposed TOOL-SURFACE-UPGRADE into 6-unit REQ spec at docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md; created ARCH-TSU task in backlog; marked BA-TSU-1 DONE.
**what-considered:**
- Route directly to dev (skip architect) — rejected: 6 heterogeneous units, each needs design decision (counter hook location, static vs runtime registry, 12-tool verdicts, prev-session data path, VPS API field availability, 4 merge/keep rulings). Architect is not optional.
- Merge U3 into U6 (all are overlap/removal work) — rejected: U3 is a 12-tool triage requiring a per-tool 5-question checklist; U6 is executing specific TSH-identified pairs. Different scopes and DDD layers.
**why-decision:** 6 architect blockers confirmed none PO-resolvable; all are technical design or data-path confirmation decisions. Zero PO blockers.
**why-change:** no change from PO plan; U6 scope expanded by PO to include get_market_summary/generate_market_summary and get_insider_signals/get_insider_transactions pairs (new pairs not in TSH).
