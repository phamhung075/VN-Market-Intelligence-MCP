# PO Notebook

_Last: 2026-07-16T17:00Z (dev-team tick 16:37Z — autolaunch_safety_hold GUARD row adjudicated; class-wide durable gate minted, maintlane gate folded in)_

## Tick 2026-07-16T16:37Z — 1 actionable signal (autolaunch_safety_hold, from dev-team)
Board pre: backlog 402, review 29, ready/inprog/qa 0, WIP 0, head idle. One atomic orch-apply (Zod Stage0+1 PASS; conservation 541→542, +1 mint). `.head` untouched, no lane-move, no WIP raise. (First apply rejected: explicit `owner:null` fails `z.string().optional()` — omitted the key.)

### GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC — 7th (un-named) BOUNDED-1 leak, churned 2 ticks (16:07Z+16:37Z)
RAW dry-run confirmed: gate picks GUARD (rank=1); detail entry ABSENT (0); supervised:true stops it. ROOT CAUSE (code-grounded, `scripts/devteam-backlog-promote-bounded1.jq`): `is_plan_only`(~L452) + `is_non_dev_next_agent_unrouted`(~L467) read ONLY `$detail_items[.id]`; `effective_owner`(~L418) was ALREADY generalized to board-OR-detail (2026-07-13) but plan_only/next_agent were NOT. A board row with inline plan_only/next_agent + NO detail entry sails every gate. `is_non_dev_next_agent_unrouted` also requires board next_agent EMPTY — exactly why next_agent="architect" slips.
- **NOT one row — CLASS of 28** leaky promotable rows (4 P1: GUARD=architect + FIX-COWORK-DISPATCH / FIX-VNINDEX-CROSS-PLANE / FIX-COWORK-SIGNAL = ba; 17 P2 + 7 P3 incl. all UC-*-UNVERIFIED-BATCH). Deadlock: leaky P1s are withheld but never leave backlog → perpetually re-rank top → would STARVE even the fix from auto-pickup. So GUARD-only stopgap (the literal recommendation) is INSUFFICIENT — proven by dry-run: next pick = FIX-COWORK-DISPATCH, same class.
- **STOPGAP (a, expanded to the near-term churn set):** supervised:true on ALL 4 P1 leaky rows. Post-write dry-run: BOUNDED-1 now picks the durable fix row itself (dev-routable). Deliberate router/ba/architect dispatch unaffected.
- **DURABLE (b):** minted `FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE` (P1/M, next_agent=developer, zone cross-service/, dev-routable ∴ BOUNDED-1-pickable). Generalize is_plan_only + is_non_dev_next_agent_unrouted to effective(board-OR-detail), mirroring effective_owner; DROP the "board next_agent empty" clause. SUBSUMES the in-flight `FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE` (folded: supervised:true + SUPERSEDED-BY note → prevents concurrent edit of the same jq). Full fix-spec + AC in the row status_note.

## Carry-over
- **RETURN: groomed (5 in-place edits + 1 mint) — no dispatch, no WIP raise.** Router next tick's BOUNDED-1 picks the dev-routable fix row → developer implements the class fix. Once shipped, the 4 supervised stamps are belt-and-suspenders.
- Convergence: SAME class as 11:37Z UC-ASL-P6 (maintlane leak) — that fix now folded into the consolidated gate. Both trace to the detail-only-read gap; the 07-13 owner fix set the correct board-OR-detail precedent the other two predicates never inherited.
- Telegram/analysis-pipeline cluster (BCTC low-conf, bctcExtractReconcile EXHAUSTED, OHLCV-backfill crash) STILL unsurfaced — ops/analysis dedicated pass, not dev-team triage. Not this tick.
