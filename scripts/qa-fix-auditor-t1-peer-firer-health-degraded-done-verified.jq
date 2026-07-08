# Board flip: FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED REVIEW -> DONE_VERIFIED
#
# Independent QA re-verification (not trusting PO's relayed 79/79 figure):
# re-ran scripts/agents-flow/auditor-tier1-probe.test.sh myself -> 79 passed /
# 0 failed, exact match, incl. the mandatory injected-fault pair (T25 FAILURE-
# on-missing / T26 ALL_GREEN-on-restore per feedback_fence_false_green) plus
# T27-T30 (multi-label precision, missing/empty launchd dir, CLI-subprocess-
# level injected fault). Read _check_launchd_agents() in full: label read via
# awk directly off each tracked launchd/*.plist's own <key>Label</key>/
# <string> pair (grep confirms zero hardcoded "com.vn-market" literals in the
# script) -> genuinely SSOT-driven off the repo's own launchd/ dir, matches
# the guaranteed-slot-firer's matcher-driven no-hardcode pattern. MUTATION
# TEST: injected an early `return 0` into _check_launchd_agents (simulating
# a future regression that silently no-ops the check) -> re-ran the suite ->
# 10 assertions flipped to FAIL (incl. both T25/T30 injected-fault checks),
# confirming the suite is a genuine regression detector, not a tautology;
# reverted the mutation (clean git diff after revert), re-ran -> back to
# 79/79. Also ran the live (unmocked) probe against real `launchctl list` on
# this host: correctly reports FAILURE naming 2 currently-unloaded labels
# (com.vn-market.cowork-guaranteed-slot-firer — expected, its ops install is
# a separate gated task per F1-LAUNCHD-COWORK-BACKSTOP's own scope note;
# com.vn-market.socat-bridge — a real pre-existing local gap, out of this
# task's fix-the-detector scope) -> positive confirmatory evidence the check
# works against real production state, not just fixtures.
#
# GUARD: refuse unless FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED is in
# review[] with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note /path/to/review_note_append.txt \
#          -f scripts/qa-fix-auditor-t1-peer-firer-health-degraded-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED")][0]) as $t
| if $t == null then error("FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED") then
    error("head.active_task_id drifted away from FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    review_note: ($t.review_note + $note),
    updated_at: $now,
    updated_by: "qa",
    status_note: "qa independent re-verification PASS (\($now)): re-ran auditor-tier1-probe.test.sh myself = 79/79 incl injected-fault pair (T25/T26) + T27-T30; source-read confirms SSOT-driven label parsing (zero hardcoded labels); mutation test (forced early-return in _check_launchd_agents) flipped 10 assertions to FAIL then reverted clean, proving the suite is a real regression detector; live unmocked probe run against real launchctl confirms the check correctly detects 2 currently-unloaded labels on this host. done_verified."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = "FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED DONE_VERIFIED (qa independent re-verification \($now) — 79/79 test re-run incl injected-fault pair, mutation test proves suite is a real regression detector, SSOT-driven label parsing confirmed, live unmocked probe run confirms real-world detection of 2 currently-unloaded local launchd labels — cowork-guaranteed-slot-firer install remains a separate ops-gated task per F1-LAUNCHD-COWORK-BACKSTOP scope; socat-bridge gap is pre-existing and out of this fix's scope). Sibling brief rows (ops plist install, agent-father runbook doc-fix) remain separately owned."
| .head.updated_at = $now
| .head.updated_by = "qa"
