# scripts/dev-cowork-guaranteed-slot-durability-claim.jq
#
# F1-LAUNCHD-COWORK-BACKSTOP + FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED —
# ready[] -> in_progress[] task-board claim. Both tasks are worked together
# per PO brief-signoff (Task 2 self-checks Task 1's mechanism).
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-cowork-guaranteed-slot-durability-claim.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.ready | map(select(.id == "F1-LAUNCHD-COWORK-BACKSTOP" or .id == "FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED"))) as $claimed
| .task_board.in_progress += ($claimed | map(. + {status: "IN_PROGRESS", claimed_at: $now, claimed_by: "developer"}))
| .task_board.ready |= map(select(.id != "F1-LAUNCHD-COWORK-BACKSTOP" and .id != "FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED"))
| .task_board._updated_at = $now
| .task_board._updated_by = "developer (F1-LAUNCHD-COWORK-BACKSTOP + FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED claim)"
