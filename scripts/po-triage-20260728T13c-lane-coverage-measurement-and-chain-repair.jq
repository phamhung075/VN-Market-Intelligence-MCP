# scripts/po-triage-20260728T13c-lane-coverage-measurement-and-chain-repair.jq
#
# PO triage pass 4, 2026-07-28T13Z. Converge + two acute lane repairs. No mint.
#
# WHAT THIS RECORDS: while routing the COWORK-GUARANTEED-SLOT-CATCHUP epic out
# of the NO-LANE hole, PO measured how big that hole actually is. It is not an
# epic-sized problem, it is a board-sized one: 162 of 397 backlog rows (41%)
# match NO dispatch lane at all — independent of the chain-ordering starvation
# already tracked by FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION. Ordering
# fairness cannot help a row that no consumer's select clause matches.
#
# CONVERGE, NOT MINT: the measurement lands on FIX-BOUNDED1-SUPERVISED-LANE-
# NO-SWEEPER, the row whose own 2026-07-21 fix introduced the SLS select and
# therefore the AND that creates the largest sub-class. Minting a second row
# for the residual of a still-open row is the churn the board already suffers.
#
# Usage (ALWAYS from project root, ALWAYS through the gate):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-triage-20260728T13c-lane-coverage-measurement-and-chain-repair.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $n

| .task_board.backlog = (.task_board.backlog | map(
    if ((.id // "") == "FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER")
    then . + {
      plan_only: true,
      updated_by: "po/triage-20260728T13",
      po_lane_repair_20260728: "LANE REPAIR — this row could not be picked up by the very lane its own fix created. It carried supervised:true with plan_only:false, and SLS's select requires BOTH, so it matched nothing (verified by execution). Set plan_only:true, which its own title asserts ('PLAN-ONLY: ...'). It is now SLS-shaped, deps-clear, rank 1 — i.e. it queues behind the two rank-0 rows (FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION, FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS) and ahead of the rest. Deliberately NOT raised to P0: the idle-chain row must stay first because ordering fairness is the prerequisite for any lane draining at all.",
      po_residual_measurement_20260728: "MEASURED RESIDUAL OF THIS ROW'S OWN FIX (po, 2026-07-28T13:3xZ, executed against live data via scripts/lib/devteam-eligibility.jq — not inferred). This row's fix shipped SLS to drain the class BOUNDED-1 correctly withholds. SLS's select is `effective_supervised == true AND effective_plan_only == true`. That AND is the residual: a row carrying only ONE of the two flags is withheld by BOUNDED-1 and not matched by SLS, so it matches nothing. Live census of task_board.backlog[] (397 rows, status BACKLOG/TODO):\n  - plan_only WITHOUT supervised: 48 rows — ALL 48 are deps-satisfied, i.e. every one is ready to run and none can be picked up.\n  - supervised WITHOUT plan_only: 32 rows — including THIS ROW ITSELF until the repair in this same write.\n  - both flags (the shape SLS actually matches): 21 rows.\n  - non-dev effective next_agent with NEITHER flag: 82 rows — gated out of BOUNDED-1 by is_non_dev_next_agent_unrouted, not matched by SLS (no flags), never seen by RLC (which reads ready[] only, never backlog[]). This is the class docs/agents/po/flow/zone-routing.md Step A2 already names 'not a lane, a hole'.\nTOTAL STRANDED: 48 + 32 + 82 = 162 distinct backlog rows, 41% of the lane, matched by NO consumer. The three sets are disjoint by construction of the census.\nWHY THIS IS NOT THE ALREADY-TRACKED STARVATION: FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION is an ORDERING defect — five consumers, first eligible one wins every tick, the other four starve. This is a COVERAGE defect — 162 rows are in NO consumer's candidate set, so they stay stuck under a perfectly fair scheduler. Both are real; fixing either alone leaves the other. Sequence them deliberately: coverage without fairness means the newly-matched rows still queue behind BOUNDED-1 forever; fairness without coverage means four lanes get fair turns at a candidate set that still excludes 162 rows.\nDIRECTION FOR ARCHITECT (PO has NOT pre-selected, unlike the idle-chain row — the two sub-classes may want different answers): for the 48+32, the question is whether SLS's AND should be an OR (BOUNDED-1 already excludes plan_only rows on its own, so the second conjunct may be buying nothing) or whether the two flags should collapse into one field, since 80 live rows carry exactly one of them and no documented reading of a single flag dispatches anywhere. For the 82, the question is whether RLC should also read backlog[] or whether non-dev-next_agent rows should be minted into ready[] by contract — Step A2 currently says the latter, which is a discipline no mechanism enforces; 82 rows say the discipline does not hold. DO NOT answer this by hand-moving 162 rows: PO deliberately hand-repaired only 3 this tick (this row, FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT and its blocking predecessor) because those unblock a live signal-burial defect. The other 159 are the acceptance evidence — the fix is right when that census reaches 0 without anyone touching a row."
    }
    elif ((.id // "") == "FIX-SIGNALQUEUE-RECEIVER-DELIVERY-CONTRACT")
    then . + {
      supervised: true,
      updated_by: "po/triage-20260728T13",
      po_lane_repair_20260728: "LANE REPAIR — acute, chain-motivated. Verified by execution: P1, plan_only:true, supervised absent, next_agent architect, depends_on empty and satisfied => is_bounded1_eligible false AND SLS-select false, i.e. no lane. It is ALSO the sole blocking dependency of FIX-COWORK-STEP0A-TOPO-DRAIN-STATUS-CONTRACT, which PO lane-repaired earlier in this same tick — repairing the dependent alone would have been useless, since deps_satisfied() would have held it behind a predecessor that itself could never dispatch. Set supervised:true (the missing half of the pair) so the whole two-row chain can move. This is one of the 48 plan_only-without-supervised rows censused on FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER; the other 47 are deliberately left untouched as that row's acceptance evidence."
    }
    else . end))
| .task_board._updated_at = $n
| .task_board._updated_by = "po (triage 20260728T13c — lane-coverage census converge + 2 chain repairs)"
| ._updated_at = $n
| ._updated_by = "po/triage-20260728T13"
