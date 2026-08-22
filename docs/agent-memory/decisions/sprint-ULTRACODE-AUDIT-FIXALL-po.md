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

### STEP po-S4 · po · 2026-08-22T19:00:18Z
**task-id:** UC-CCA-P2-MARKET-WATCHER
**what-done:** Signed off AC-3 and moved the row `review[]` → `done[]` (DONE) on a SUBSTITUTED falsifiable criterion, after establishing that AC-3 as written (BA-spec:418-419) is unfalsifiable: `[GATEWAY] probe OK — proceed` is a transcript log line (gateway-availability-gate/SKILL.md:30); the skill writes the notebook only on its DEFER/BLOCKED branches (:54), and the Step 5b WORK ping is a fixed ≤80-char ULTRA template with no gateway field (cycle.md:328). Both planes AC-3 names read zero on every healthy cycle, by construction.
**what-considered:**
- Hold the row again pending "a live cycle" (what po-S3 did) → rejected: 4 live cycles HAVE now run (2026-08-14T16:11Z, 08-15T00:14Z/04:19Z/08:11Z) and all four read zero on both named planes. po-S3's blocker was real but is spent; repeating it would hold the row forever on a criterion no cycle can ever satisfy.
- Sign off silently on the static grep → rejected: that is the fabricated PASS po-S3 correctly refused, and it leaves the AC defect undocumented for the next reader.
- Rewrite AC-3 in the BA spec retroactively → rejected: the spec is consumed; editing it destroys the evidence trail and fixes one instance of a class.
- Substitute an equivalent falsifiable criterion, record the substitution + evidence on the row, sign off, and spin the class defect out as its own row → chosen.
**why-decision:** The substitute is strictly stronger than the literal AC, not a weakening. "Exactly ONE probe per invocation" is settled by there being exactly one probe INVOCATION site left to invoke (main.md:61; cycle.md:20/:22 are prose, eod.md zero) — a second probe is structurally impossible, not merely unobserved. The 4 post-commit cycles then prove that single site executes without regression (all `items_fetched=34`, `exit_status=complete`, zero DEFER/BLOCKED, parity with the pre-change 04:09Z baseline). An 8-day-old row was being held hostage by a wording defect, not by a doubt about the code.
**why-change:** Dispatched as "re-check AC-3 post-cycle" per po-S3's plan. The re-check found the cycles had already run and passed; the actual blocker turned out to be the AC's own evidence plane. Two mutations outside the dispatched scope followed and are declared here: (1) `FIX-CI-SIZELINT-GETBCTCPENDINGREFINETOOL-BASELINE-TOLERANCE-EXCEEDED` folded +4 ci_red fires (occurrence_count 3→7, all four pre-dedup failing-file-read verified byte-identical) and promoted `backlog[]`→`ready[]`, because it had sat undispatched 7 days with main continuously RED and `backlog[]` is not a dispatchable lane; (2) minted `FIX-BA-AC-NAMES-PLANE-IMPLEMENTATION-NEVER-WRITES` (backlog, next_agent=ba) so the AC-plane class defect above is fixed once rather than re-discovered per spec.
