# Decision Journal — Sprint ULTRACODE-AUDIT-FIXALL · po

**Sprint goal:** Drain CONFIRMED/RESCOPE findings from the 2026-07-12 ultracode workflow audit.
**Agent:** po
**Started:** 2026-07-21T23:23:03Z

---

### STEP po-S1 · po · 2026-07-21T23:23:27Z
**task-id:** FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD
**what-done:** Resolved BA §5 Q1 (closure sequencing across the deliberate (a)+(c)-now / (b)-residual split) → Option B; advanced head po→architect (supervised+plan_only preserved), recorded ruling on the board row.
**what-considered:**
- A: keep this P0 open/IN_PROGRESS pending a 2nd wave for fix_spec(b)/AC2 → rejected: a not-yet-decomposed wave held under one row is a false-IN_PROGRESS that blocks the WIP lane and couples two independent deploy/QA cycles.
- B: PM spins a NEW explicitly-linked supervised backlog row for (b); THIS ticket closes after (a)+(c) land + QA-verify → chosen, with a HARD closure gate.
**why-decision:** B dominates A once closure is gated on successor existence — (a)+(c) is container-rebuild-gated and stops the MATERIALIZED incident (unauthorized hot-path exec); (b) is prophylactic flow-doc/TTL with its own I10/INV-GATEWAY-1 deps. A first-class tracked successor row IS the anti-silent-drop mechanism (§3 risk) and avoids the epic-wrapper closeout gap; the parent may NOT flip DONE until that successor exists.
**why-change:** No change from dispatched scope — governance/closure-criteria call only (both options preserve supervision); FR-5 bundle, backlog+BLOCKED classification, and I10 batching left to architect as engineering-scope calls.
