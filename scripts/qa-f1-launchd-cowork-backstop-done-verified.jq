# Board flip: F1-LAUNCHD-COWORK-BACKSTOP REVIEW -> DONE_VERIFIED
# Independent QA re-verification (not trusting the PO review-lane sweep's
# relayed numbers): re-ran scripts/agents-flow/cowork-guaranteed-slot-firer.test.sh
# myself -> 25/25 pass (matches PO's figure). Read firer.sh + plist source in
# full: matcher-driven (calls cowork-match-slots.js, unmodified), filters
# slots[] to guaranteed===true (jq select), trigger_prompt read verbatim off
# the matched slot object (never hardcoded — confirmed both in source AND via
# test T3's RECORD_FILE check against the real fake-claude invocation args),
# FIRE_TIMEOUT_SECONDS default 1800 via _bounded_exec (verified-empirically
# bash fallback, T10 regression proves early-kill), a brand-new guaranteed
# slot fires with zero script edits (T3b). plutil -lint on the new plist:
# OK; StartInterval=900/RunAtLoad=false/KeepAlive=false confirmed by direct
# read. Confirmed scripts/cowork-fb-daily-firer.sh + launchd/com.vn-market.
# fb-daily-firer.plist are absent from the whole repo (find, excl. logs/
# reports) and absent from `launchctl list` (no orphaned label; new label
# also not yet loaded — install is ops' separate gated task, out of this
# task's scope per its own board description). mock-guard.sh --files: no
# production TS source to scan (bash/plist), PASS by design. No secrets
# grep hit (only prose mentions of "token" = cost/Telegram token, no values).
#
# GUARD: refuse unless F1-LAUNCHD-COWORK-BACKSTOP is in review[] with status
# REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note /path/to/review_note_append.txt \
#          -f scripts/qa-f1-launchd-cowork-backstop-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="F1-LAUNCHD-COWORK-BACKSTOP")][0]) as $t
| if $t == null then error("F1-LAUNCHD-COWORK-BACKSTOP not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("F1-LAUNCHD-COWORK-BACKSTOP status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "F1-LAUNCHD-COWORK-BACKSTOP") then
    error("head.active_task_id drifted away from F1-LAUNCHD-COWORK-BACKSTOP (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    review_note: ($t.review_note + $note),
    updated_at: $now,
    updated_by: "qa",
    status_note: "qa independent re-verification PASS (\($now)): re-ran cowork-guaranteed-slot-firer.test.sh myself = 25/25; source-read confirms matcher-driven + guaranteed===true filter + trigger_prompt read verbatim off slot object + 1800s _bounded_exec + zero-script-edit for new slots (T3b); plist plutil-lint OK, StartInterval=900/RunAtLoad=false/KeepAlive=false confirmed; fb-daily-firer script+plist confirmed absent repo-wide and from launchctl list (no orphaned label). done_verified."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "F1-LAUNCHD-COWORK-BACKSTOP")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = "F1-LAUNCHD-COWORK-BACKSTOP DONE_VERIFIED (qa independent re-verification \($now) — 25/25 test re-run, source-read confirms all acceptance criteria, fb-daily-firer retirement confirmed repo-wide + launchctl. Remaining follow-on work is separate/out-of-scope: ops install (launchctl load new plist — gated local swap, per feedback_user_gates_delegate_to_ops), FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED (separate REVIEW row, same brief), agent-father doc-fix on cowork-master-cron-runbook.md layer_a_deletion_locked (separate owner)."
| .head.updated_at = $now
| .head.updated_by = "qa"
