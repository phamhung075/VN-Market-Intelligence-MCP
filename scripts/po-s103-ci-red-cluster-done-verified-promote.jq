# po-s103-ci-red-cluster-done-verified-promote.jq
#
# CI-RED CLUSTER SIGN-OFF — single-pass multi-lane relocation (NO new tasks):
# The `ci_green_on_subsequent_push` gate that froze done_verified for ~6 ticks is
# objectively satisfied (origin/main CI = success; fix commit 87995fb1 ancestor-of-origin;
# CI run 27676607447 conclusion=success on that SHA). Promote the genuinely code-done +
# QA-approved CI-RED cluster from their scattered source lanes → done_verified[].
#
# Relocates 6 ids → done_verified[] with status=DONE_VERIFIED + a verified_at/verified_by/
# verified_gate_evidence promotion stamp. Each was verified genuinely code-done before:
#   - FIX-CI-RED-2RED-084-VPS-FRESHN (done[])        fix 87995fb1, CI run 27676607447 success
#   - FIX-CI-RED-STANDING-1837A-1352A (done[])       qa APPROVED 4-DoD, fix b556afbb ancestor
#   - CI-RED-RECONCILE (active_sprints[])            closure native fail=0 @44c94fd3 run 27236671718
#   - CI-RED-b7b84d9b-FIX (backlog[])                qa cycle-244 APPROVED, run 27461707296 0-fail
#   - FIX-TA-SANDBOX-DEPGUARD (backlog[])            commit c2faac2d, go-lint run 27159569677 SUCCESS
#   - CI-RED-8081e584-FIX (backlog[])                qa APPROVED, commit b4eeaf49, run 27440565189 0-fail
#                                                     (DONE-GATE-SUPERSEDED → gate-holder b7b84d9b now green)
#
# Idempotent: relocation guarded by done_verified membership — re-run promotes 0.
# Harness adds CONSERVATION (total entries across the 5 board arrays UNCHANGED — pure relocation)
# + done_verified += 6 (or += 0 on re-run). Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s103-ci-red-cluster-done-verified-promote.jq docs/data/orch/orch-state.json
# atomic temp→`[ -s ]`→`jq empty`→conservation→rename; commit orch-state by EXPLICIT PATH.

def idof: (.id // .task_id);

# The 6 cluster ids to promote.
($now) as $now
| ["FIX-CI-RED-2RED-084-VPS-FRESHN",
   "FIX-CI-RED-STANDING-1837A-1352A",
   "CI-RED-RECONCILE",
   "CI-RED-b7b84d9b-FIX",
   "FIX-TA-SANDBOX-DEPGUARD",
   "CI-RED-8081e584-FIX"] as $cluster

# Ids already in done_verified — never re-promote.
| ([.task_board.done_verified[] | idof]) as $already

# Ids we will actually move this pass.
| ($cluster - $already) as $to_move

# Stamp helper: set DONE_VERIFIED status + promotion provenance on a task.
| def stamp:
    . + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_at: $now,
      verified_by: "po-s103",
      verified_gate: "ci_green_on_subsequent_push",
      verified_gate_evidence: "Gate satisfied: origin/main CI conclusion=success; fix 87995fb1 ancestor-of-origin; CI run 27676607447 success on that SHA (full per-file-isolation suite green). Promoted as part of CI-RED cluster sign-off after ~6 gate-frozen ticks."
    };

# Pull the moved objects (stamped) from wherever they live, in cluster order.
  ([ .task_board
     | (.done[]?, .backlog[]?, .active_sprints[]?, .ready[]?, .in_progress[]?, .review[]?)
     | select((idof) as $i | $to_move | index($i)) ] ) as $moved_raw
# Preserve cluster ordering for deterministic output.
| ([ $cluster[] as $cid | $moved_raw[] | select(idof == $cid) | stamp ]) as $moved

# Remove moved ids from every source lane, append stamped copies to done_verified.
| .task_board.done            |= map(select((idof) as $i | ($to_move | index($i)) | not))
| .task_board.backlog         |= map(select((idof) as $i | ($to_move | index($i)) | not))
| .task_board.active_sprints  |= map(select((idof) as $i | ($to_move | index($i)) | not))
| .task_board.ready           |= map(select((idof) as $i | ($to_move | index($i)) | not))
| .task_board.in_progress     |= map(select((idof) as $i | ($to_move | index($i)) | not))
| .task_board.review          |= map(select((idof) as $i | ($to_move | index($i)) | not))
| .task_board.done_verified   += $moved
| .updated_at = $now
