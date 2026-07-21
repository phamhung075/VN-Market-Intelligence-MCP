# PO Notebook

_Last: 2026-07-21T23:23Z (FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD — Q1 closure-sequencing ruling; focused supervised decision cycle, not triage)_

## Tick 2026-07-21T23:23Z — Q1 ruled Option B: split the (b) residual into a gated successor, not one open-forever P0

**★ "Don't silently drop the residual" does NOT mean "keep the parent open."** BA §3 warned fix_spec(b)/AC2 must not vanish after (a)+(c) ship. The reflexive answer is Option A (parent stays IN_PROGRESS pending wave 2). But an un-decomposed second wave held under one row is a **false-IN_PROGRESS** — nothing is actually in progress on (b) — and it parks a P0 in the WIP lane the board is already lane-blocked on. The correct anti-silent-drop mechanism is a **first-class tracked successor row**, not an open parent that itself risks the epic-wrapper closeout gap.

**★ Option B only dominates once closure is gated on successor EXISTENCE.** B's sole real downside (successor never minted → residual lost) is fully neutralized by a HARD precondition: this P0 may NOT flip DONE until the fix_spec(b)/AC2 successor row exists on the board. Recorded that on the row's `po_ruling.closure_gate`. B-with-gate > A on every axis; A only wins if you can't guarantee the successor — and I can, by making it a closure precondition.

**★ The two halves are independently shippable and SHOULD decouple.** (a)+(c) = clearable reaper orphans + adoption board-guard — container-rebuild-gated, and the stop-gap for the MATERIALIZED incident (unauthorized hot-path exec, recurrence 3). (b) = stop false-orphaning live agents — prophylactic flow-doc/TTL with its own deps (dev-team-loop-I10, INV-GATEWAY-1 dead-lock deletion in developer/qa flow). Coupling them under one open row holds the urgent materialized-incident fix hostage to the prophylactic's separate decomposition + QA cycle.

**★ Stayed in my lane — this was the ONE governance call, nothing else.** Q1 is closure-criteria/priority (mine). FR-5 bundle, backlog+BLOCKED classification, I10 batching = engineering scope → left to architect. Did NOT triage the FYI signal_queue row (sys-...1585, known-benign A-30 mem FP) — that's next head-idle's converge, not this focused cycle's.

## Carry-over
- **NEXT HOP: architect** (head.next_agent=architect). Review BA spec + this Q1 ruling, then rule the architect-decidable calls (FR-5 board-flip bundle, backlog+BLOCKED → active-vs-terminal, I10 batching) before pm decomposition. supervised+plan_only PRESERVED on row — do not clear.
- **CLOSURE GATE (defend at sign-off):** FIX-ORPHAN may NOT flip DONE until the fix_spec(b)/AC2 successor row EXISTS. When QA signals (a)+(c) done, verify successor-row presence BEFORE approving.
- **Successor row spec (for pm):** inherit supervised:true + P0; cross-ref predecessor=FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD; carry §3 absorbed P2 impl-notes verbatim (execute-tier.md:42-64 TTL+heartbeat placement, developer/qa INV-GATEWAY-1 dead-lock deletion, I10) + audit_ref lineage.
- **NEXT head-idle triage (NOT this tick):** converge signal_queue sys-20260721T231131-1585 (A-30 mcp-server mem 95.30%, RAW-verified benign) → FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE. Do NOT open a new task.
