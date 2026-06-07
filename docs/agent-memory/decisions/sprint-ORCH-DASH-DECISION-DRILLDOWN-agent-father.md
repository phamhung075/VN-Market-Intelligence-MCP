# Decision Journal — Sprint ORCH-DASH-DECISION-DRILLDOWN · agent-father

**Sprint goal:** Decision Drilldown — browsable per-task decision audit surface on orchestration dashboard
**Agent:** agent-father
**Started:** 2026-06-08T00:25:00Z

---

### STEP agent-father-S1 · agent-father · 2026-06-08T00:25:00Z
**task-id:** FIX-AUDITOR-SQL-MODIFIERS
**what-done:** Replaced 11 short-form SQLite datetime modifiers ('-Nh'/'-Nd') with long-form ('-N hours'/'-N days') in docs/agents/system-auditor/flow/main.md; added NULL-guard block before C-check table; updated size-justification comment.
**what-considered:**
- only: long-form is the only valid SQLite datetime modifier syntax; short-form always returns NULL per SQLite spec
**why-decision:** Proven defect causing C-06/C-07 false CRITICAL tonight and C-08/C-10/C-16/B-13 silent false-PASS since inception; sensor integrity = top priority (blind auditor poisons entire anomaly bridge)
**why-change:** no change from task spec — direct fix as specified
