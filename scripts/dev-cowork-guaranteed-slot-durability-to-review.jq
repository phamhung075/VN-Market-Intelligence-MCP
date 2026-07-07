# scripts/dev-cowork-guaranteed-slot-durability-to-review.jq
#
# F1-LAUNCHD-COWORK-BACKSTOP + FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED —
# in_progress[] -> review[] after implementation + tests GREEN. developer
# hands off to qa (signaled separately) per docs/agents/developer/flow/main.md
# "Update docs/data/orch/orch-state.json .task_board: task status
# IN_PROGRESS → REVIEW".
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-cowork-guaranteed-slot-durability-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.in_progress | map(select(.id == "F1-LAUNCHD-COWORK-BACKSTOP" or .id == "FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    reviewed_at: $now,
    reviewed_by: "developer",
    review_note: (
      if .id == "F1-LAUNCHD-COWORK-BACKSTOP" then
        "Generalized scripts/agents-flow/cowork-guaranteed-slot-firer.sh (matcher-driven, guaranteed===true filter, trigger_prompt read verbatim off slot object, _bounded_exec 1800s timeout w/ verified-empirically bash fallback since this host has neither timeout nor gtimeout). 25/25 tests GREEN (cowork-guaranteed-slot-firer.test.sh, zero real claude/node invocations, mocked SLOT_MATCHER_CMD + fake CLAUDE_BIN). Retired scripts/cowork-fb-daily-firer.sh + launchd/com.vn-market.fb-daily-firer.plist into launchd/com.vn-market.cowork-guaranteed-slot-firer.plist. Docs updated: docs/standards/cron-jobs.md, docs/policies/dev-standards.md. Simplicity gate PASS (Q1-Q4 self-cert). graphify skipped — no LLM API key in this session env (pre-existing env gap, not this task's scope)."
      else
        "Extended scripts/agents-flow/auditor-tier1-probe.sh with check 6 (_check_launchd_agents) — SSOT = repo launchd/*.plist Label fields (never hardcoded), FAILURE verdict + missing-label detail when any required label absent from launchctl list. 79/79 tests GREEN in auditor-tier1-probe.test.sh (60 pre-existing regression untouched behaviorally + 19 new, incl. mandatory injected-fault pair T25 FAILURE-on-missing / T26 ALL_GREEN-on-restore per brief §6.7). Bug-alerting is inherited via the existing FAILURE→spawn-system-auditor pipeline (cron-detect-loop/SKILL.md Job 2), unchanged — no new alert code inside this READ-ONLY pre-gate script. Simplicity gate PASS."
      end
    )
  })
)
| .task_board.in_progress |= map(select(.id != "F1-LAUNCHD-COWORK-BACKSTOP" and .id != "FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED"))
| .task_board._updated_at = $now
| .task_board._updated_by = "developer (F1-LAUNCHD-COWORK-BACKSTOP + FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED -> REVIEW)"
