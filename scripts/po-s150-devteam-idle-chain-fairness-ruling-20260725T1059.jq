# PO ruling 2026-07-25T10:59Z — dev-team head-idle chain fairness / triage starvation.
#
# Two edits:
#   (1) FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION  P1 -> P0, design PRE-SELECTED,
#       acceptance extended with the durability AC folded in from (2). In-place in backlog[].
#   (2) FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD BACKLOG -> CANCELLED, folded into (1),
#       and MOVED backlog[] -> archive[].
#       CANCELLED is the canonical terminal token (StatusEnum + TERMINAL_SET,
#       apps/mcp-server/src/infrastructure/orchStateSchema.ts) so cold-evict can reap it;
#       there is no FOLDED status. BOUNDED-1's promote gate selects status in {BACKLOG,TODO},
#       so CANCELLED also removes it from auto-pickup eligibility.
#       The MOVE is mandatory, not cosmetic: orch-validate.mjs Stage 1b (lane coherence)
#       rejects CANCELLED in lane "backlog" (allowed: BACKLOG|BLOCKED). Every one of the 6
#       pre-existing CANCELLED rows lives in archive[]. Caught by dry-run against a scratch
#       copy, never against the live file.
# Conservation: backlog 391->390, archive 8->9; grand total unchanged (row moved, not created
# or destroyed).
#
# Apply: jq -f <this> docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def ruling:
  "PO RULING 2026-07-25T10:59Z (po, router-referred throughput decision). DISPOSITION: FIX + RAISE P1->P0, design PRE-SELECTED (this row previously said 'PO has NOT pre-selected'; leaving the design open is part of why it sat). NOT accepted-as-is.\n\n"
+ "WHY P0: this row is the only defect on the board that STRUCTURALLY BLOCKS ITS OWN REMEDIATION. It is supervised:true + plan_only:true, which routes it to the Supervised-Lane Sweep — and SLS is 2nd in the very chain this row describes, permanently unreachable behind BOUNDED-1. A defect that prevents its own fix from ever being dispatched outranks each individual row it starves. It also gates the drain rate of three whole lanes at once (ready 44 incl. 18 P0, review 105, Step-1 triage), so its priority must dominate theirs.\n\n"
+ "SELECTED DESIGN (supersedes options a/b/c in .deliverable — architect may refine the mechanism, NOT re-open the choice): AGED ROUND-ROBIN over the five idle-path consumers, plus DURABLE signal handoff. Two parts, both required; part 2 is NOT optional and NOT separable.\n\n"
+ "PART 1 — replace the fixed-priority chain with aged round-robin. Today BOUNDED-1 -> SLS -> RLC -> QA-Drain -> Step 1 is a FIXED-PRIORITY chain in which every lane JUMPs to a terminal on dispatch, so the first eligible lane wins every idle tick and the other four are unreachable whenever backlog[] is non-empty (it is: 391). Fix: stamp each of the five consumers with last_served_tick; on each idle tick serve the ELIGIBLE consumer with the OLDEST last_served_tick. Rationale for preferring this over the row's own option (a) 'force Step 1 every Nth idle tick': option (a) special-cases ONE victim and leaves ready[]/review[] starved by the same mechanism. Live evidence says all four non-winners starve, not just Step 1 — so the fix must be lane-generic. One mechanism, four victims.\n\n"
+ "PART 2 — make the drain->triage handoff DURABLE (folds FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD, now CANCELLED). Rotation alone bounds triage LATENCY but does not stop signal LOSS. Step 0a is DESTRUCTIVE-BEFORE-DELIVERY: it moves docs/signals/*.json to processed/, writes the fingerprint into signals_processed (so the next drain dedups it to skipped-duplicate and never re-routes it), and marks signal_queue rows NEW->READ — then hands the result to Step 1 via pendingSignals[], which is an IN-MEMORY per-tick variable, never persisted (grep-confirmed: pendingSignals appears only in dev-team/flow/main.md + drain-signals.md, in no script and in no orch-state key). Step 1 is its ONLY consumer. Therefore every tick that short-circuits before Step 1 CONSUMES its drained signals and DISCARDS them; recovery is possible only by hand-reading processed/ and only until the 7-day prune. Required: Step 0a persists the drained batch to a durable inbox, Step 1 consumes-and-clears it, so a short-circuited tick loses nothing and the next tick that reaches Step 1 drains the accumulation. Under rotation, triage loses 4 of every 5 idle ticks, so WITHOUT part 2 rotation would still drop ~80% of drained signals — that is why these ship together.\n\n"
+ "EXPLICIT NON-CHANGE — BOUNDED-1 cap stays 1. The selected design needs no cap change: BOUNDED-1 keeps its WIP<1 gate and its 1-task-in-flight lane, it simply stops winning every idle tick. The cap is user-gated (2026-07-04) and is NOT touched. If architect's refinement turns out to require raising it, STOP and escalate to the user — do not raise it.\n\n"
+ "EVIDENCE (verified live this session, not inferred): (i) Fixed-priority starvation is provable by control-flow inspection of docs/agents/dev-team/flow/main.md alone — BOUNDED-1 :514 JUMP TO execute, SLS :575 JUMP TO end, RLC :628 JUMP TO end, QA-Drain :679 JUMP TO end, Step 1 at :695 reachable only if all four decline. (ii) Measured 7/7 wins to BOUNDED-1, 0/7 to the other four, 02:17Z-05:18Z 2026-07-25 (per this row's own po_evidence_20260725T0948). (iii) Lane consequence live: qa[]=0 against review[]=105 with 73 rows carrying next_agent=qa — QA-Drain has effectively never fired. (iv) Signal-plane consequence: signals.db signals_processed holds 363 rows in the 7d window, ALL result='routed-to-po' (2026-07-18..25), across 141 drain commits — against exactly ONE dev-team Step-1 PO triage record in that same window (docs/agent-memory/decisions/triage-20260725T0948Z-po.md, and that one was spawned OUT-OF-BAND by the router as the acknowledged workaround; the prior triage-* journal is triage-20260711T0053Z-po.md, 14 days earlier). PO itself ran 62 cycles in the window, so PO is NOT idle — what is starved is specifically the dev-team Step-1 path, the only consumer of pendingSignals[]. The persistent planes (signal_queue rows, Telegram) are covered by those out-of-band router-driven PO runs; the docs/signals/ FILE plane is not, because the drain already moved and fingerprinted it. Net: the system is currently running on a live-router workaround for a broken unattended path — precisely the path the 7,37 * * * * cron exists to cover.\n\n"
+ "PREMISE NOTE for architect (do not re-litigate, recorded for accuracy): the 4-day non-dispatch of P0 FIX-BCTC-PENDING-REFINE-HEAD-OF-LINE-FAILED-ROW had TWO independent causes, not one. It sat in ready[] where no lane could reach it (this row's chronic defect); PO re-routed it ready->backlog at ~09:51Z as an acute workaround, which made it BOUNDED-1-eligible; separately the tick plane was dead 05:18Z-10:37Z and was re-armed ~10:10Z. BOUNDED-1 then claimed it at priority_rank=0 on the first tick after re-arm (10:37Z, head.updated_at 2026-07-25T10:45:02Z). The tick-plane fault is REAL and is CLOSED. It does not explain the preceding ~4 days, during which the row was in a lane with no reachable consumer — that remains this row's defect and is the reason ready[] must be covered by PART 1."
;

def acceptance_addendum:
  " || PO 2026-07-25T10:59Z — ACCEPTANCE EXTENDED, all four are hard gates: "
+ "(AC-1 fairness) live/fixture proof across consecutive idle ticks on a saturated board (backlog>0 AND ready>0 AND review>0) that EVERY one of the five consumers — Step-1 triage, BOUNDED-1, SLS, RLC, QA-Drain — is served within a bounded number of ticks. Asserting only that Step 1 runs is INSUFFICIENT: ready[] and review[] starve by the identical mechanism. "
+ "(AC-2 durability, folded from FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD) negative-control proof that a tick which drains signals and then short-circuits to a dispatch lane LOSES ZERO signals — i.e. the very next tick reaching Step 1 still sees them. Test must run against the real drain path in an isolated harness (pattern: scripts/agents-flow/drain-signals.test.js mkdtemp), NEVER against the live orch-state.json. "
+ "(AC-3 no cap change) diff-level proof that BOUNDED-1's WIP<1 gate and its 1-task cap are BYTE-UNCHANGED. "
+ "(AC-4 satisfiability, not just resolution) extend scripts/audits/devteam-dispatch-gate-satisfiability.sh rather than minting a new instrument — and heed its own recorded lesson: scripts/audits/bounded1-supervised-lane-report.sh shipped GREEN while the gate it was meant to guard was dead, because it tested lane RESOLUTION instead of gate FIRING. Prose describing a fair chain is not acceptance."
;

def fold_note:
  "FOLDED + CANCELLED 2026-07-25T10:59Z by po (ruling s150) into FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION, which is now P0 and carries this concern as hard acceptance AC-2. "
+ "Not dropped, and the hazard is CONFIRMED REAL — this row called it a 'latent hazard ... mitigated today by router discretion'; it is no longer latent and the mitigation is no longer discretionary. Live 2026-07-18..25: 363 signals drained result='routed-to-po' across 141 drain commits, against ONE dev-team Step-1 triage record. "
+ "Folded rather than kept because (a) its proposed remedy — guard BOUNDED-1's JUMP-TO-execute on pendingSignals non-empty — covers only ONE of the four short-circuiting lanes, so it would leave SLS/RLC/QA-Drain still dropping signals; (b) a guard defers the drop rather than preventing it (the signal is already moved + fingerprinted by the time the guard is evaluated), whereas the parent's AC-2 requires a durable inbox that actually prevents loss; (c) both rows edit docs/agents/dev-team/flow/main.md, and the parent's own .note explicitly warns against racing that file with a concurrent row. "
+ "If architect rejects the durable-inbox approach in favour of the narrower guard, RE-OPEN this row instead of silently narrowing the parent's AC-2."
;

def folded_row:
  .status = "CANCELLED"
  | .folded_into = "FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION"
  | .fold_note_20260725T1059 = fold_note
  | .updated_at = $now
  | .updated_by = "po/ruling-s150-20260725T1059"
;

# Capture the row to fold BEFORE mutating backlog[], so the move is a single atomic transform.
( [ .task_board.backlog[] | select(.id == "FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD") ]
  | map(folded_row) ) as $folded
| .task_board.backlog |= (
    map(
      if .id == "FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION" then
        .priority = "P0"
        | .acceptance = ((.acceptance // "") + acceptance_addendum)
        | .po_ruling_20260725T1059 = ruling
        | .folds = ((.folds // []) + ["FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD"] | unique)
        | .updated_at = $now
        | .updated_by = "po/ruling-s150-20260725T1059"
      else . end
    )
    | map(select(.id != "FIX-DEVTEAM-BOUNDED1-PENDINGSIGNALS-EMPTY-GUARD"))
  )
| .task_board.archive = ((.task_board.archive // []) + $folded)
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po/ruling-s150-20260725T1059"
| ._updated_at = $now
| ._updated_by = "po/ruling-s150-20260725T1059"
