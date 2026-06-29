# Decision Journal — Sprint HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING · po

**Sprint goal:** Durable root-fix for recurring agent-notebook 200L breaches (write-time self-cap)
**Agent:** po
**Started:** 2026-06-29T19:03:19Z

---

### STEP po-S1 · po · 2026-06-29T19:03:19Z
**task-id:** HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING
**what-done:** Promoted existing dedup-anchor backlog→ready (P2→P1, next_agent=architect), extended scope to 4-part sweep, head→in_progress(architect).
**what-considered:**
- Mint a NEW notebook-append-class-systemic-sweep task (router's suggested shape)
- Dedup into existing HARDEN-NOTEBOOK-WRITE-GATE-AC5-BLOCKING anchor + extend its scope
**why-decision:** Existing task's `dedup_anchor_for` is EXACTLY this recurrence; a parallel task = SSOT dup + 2 anchors. RAW-verified router's membership-gap AND the task's enforcement-gap are complementary halves → folded both into one anchor.
**why-change:** Router suggested a new task; chose dedup+extend instead (no-treadmill memory). Routed through architect first (policy owner of file-size-caps.json) per recurring-bug→DESIGN rule.
