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

### STEP po-S2 · po · 2026-08-08T15:10:20Z
**task-id:** UC-CCA-P3
**what-done:** Ruled B1 (the PO-only blocker BA raised and architect deliberately left open) → Path A single-wave, FR-5 in scope, plus a hard sequencing dependency; minted the 9th child UC-CCA-P3-FR5-CODE-GATE and stamped po_goahead after ratifying the brief at source.
**what-considered:**
- Path B (defer FR-5 to a sibling row) → rejected: the only HARD control for the post-publish-release direction would sit unscheduled in a 353-row backlog; that direction is the one that published a false ~29% VN-Index move (MARKET 932+933).
- Path A as literally written (both tracks concurrent) → rejected as-is: FR-5's target coordinationStore.ts is 1388L vs size-lint upper 1365L and is the SOLE live CI-RED offender, so landing the guard first deepens the exact failure that makes ci_green_on_subsequent_push unsatisfiable for 6 sibling rows and for UC-CCA-P3's own gate item 4.
- Path A + dependency on FIX-CI-SIZELINT-COORDINATIONSTORE-BASELINE-1388L → chosen.
**why-decision:** The risk axis and the sequencing axis are independent, so I did not have to trade them. Keeping FR-5 in scope preserves the hard guarantee; ordering it behind the size-lint row costs ~zero wall-clock because the 8 flow-doc children have no dependency on that file, and it avoids guaranteed rework — the size-lint fix needs -23L and will split the file, invalidating every line anchor brief §6 depends on.
**why-change:** Adds a constraint neither BA nor architect could have known: I verified the size-lint failure by RUNNING the checker, not by reading the stale CI telegram.

### STEP po-S3 · po · 2026-08-14T12:48:31Z
**task-id:** UC-CCA-P2-MARKET-WATCHER
**what-done:** Withheld AC-3 sign-off; row held in `review[]` with a po_note recording the static PASS, the missing live-cycle evidence, and the cowork-dispatcher outage that blocks it.
**what-considered:**
- Sign off on the static grep (exactly one Step 0-GW probe at `main.md:61`) — rejected: AC-3 is worded as a LIVE-cycle criterion, static proof is the half agent-father already did and is why the row was routed to po not qa.
- Hand-spawn market-watcher to force a ping — rejected: not in PO's flow, a forced spawn is not the "next live cycle" AC-3 names, and it races the cowork-slot mutex.
- Wait for the 16:00Z firing then close — rejected as a plan: the master dispatcher is down, so 16:00Z will not fire either.
**why-decision:** Every evidence source (notebook 04:09Z, `last_fired` 04:08:29Z, work-log id 1975) predates commit `3cfabaa28` (12:35:04Z). Zero post-commit cycles exist, so a PASS would be fabricated.
**why-change:** Plan assumed a natural cycle would fire; discovered the cowork master dispatcher has been silent since tick 06:45Z, so the 08:00Z/12:00Z ticks were missed and closure now depends on a `/cron-cowork-team` re-arm outside this task.
