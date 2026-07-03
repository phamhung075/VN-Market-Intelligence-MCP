# Router board flip: FIX-ALERT-COMMANDER-DEAD-NO-SLOT in_progress[] -> review[] on cowork-refactory-expert completion.
# cowork-refactory-expert a9b57d374 RAW-verified (router 2026-07-03T16:37Z tick):
#   - commit 6b86a47aa scoped to EXACTLY 3 files (cowork-schedule.json + system-map.json + decision journal) — no orch-state/board/code; 0 UUID leak; author report-analyzer.
#   - 2 slots added (agent=alert-commander, flow_path exists, last_fired=2026-05-25 sentinel -> fires next matching tick):
#       alert-commander-market  cron */15 2-8 * * 1-5 (VN 9:00-15:00 weekdays, market hours)
#       alert-commander-critical cron 0 */4 * * *      (24/7 4h — same proven cron as news-scout-offhours; covers off-market legal/crisis, e.g. PNJ)
#   - system-map.json:1312 sender_rules reconciled: now documents verified_chain/legal_risk/crisis_velocity CRITICAL-always override (matches alert-policy.md:46).
#   - Both JSON valid; slot shape parity with existing cron slots (cadence_minutes=null is normal for cron-driven slots). DJ-GATE-1 satisfied (journal task_id present).
# Router owns the flip (worker told NOT to touch board). qa gate next.
# QA-NOTE: verify no reactivation-flood (agent dormant 5.5wk; confirm published-marker/TTL dedup prevents a burst of stale-event alerts on first fire).
# Guards: error if not in in_progress[], error if already in review[].
# Usage: jq --arg now "$NOW" -f scripts/router-flip-alertcmd-resurrect-review-20260703T1637.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="FIX-ALERT-COMMANDER-DEAD-NO-SLOT"))[0]) as $t
| if $t == null then error("FIX-ALERT-COMMANDER-DEAD-NO-SLOT not in in_progress[] — refuse to flip")
  elif ((.task_board.review | map(select(type=="object" and .id=="FIX-ALERT-COMMANDER-DEAD-NO-SLOT")) | length) > 0) then error("already in review[] — refuse dup")
  else . end
| .task_board.review += [
    ($t + {
      status: "REVIEW",
      moved_at: $now,
      moved_by: "router",
      dev_agent: "a9b57d374cf212cfc",
      dev_commit: "6b86a47aa",
      raw_verify_note: "[router 2026-07-03T16:37Z] cowork-refactory-expert a9b57d374 RAW-verified: commit 6b86a47aa scoped to 3 files (cowork-schedule.json + system-map.json + journal), 0 UUID leak, no board/code touch. 2 alert-commander slots added (market */15 2-8 wkdays + critical 0 */4 24/7), agent+flow_path valid, last_fired sentinel, both JSON valid, shape parity OK. system-map:1312 sender_rules reconciled to CRITICAL-always. -> review[] for qa gate (qa MUST assess reactivation-flood risk: 5.5wk-dormant agent, verify dedup prevents stale-event burst)."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or .id != "FIX-ALERT-COMMANDER-DEAD-NO-SLOT"))
| .head += {
    status: "in_progress",
    active_task_id: "FIX-ALERT-COMMANDER-DEAD-NO-SLOT",
    next_agent: "qa",
    next_action: "qa verifies FIX-ALERT-COMMANDER-DEAD-NO-SLOT (commit 6b86a47aa): cowork-schedule.json + system-map.json valid; 2 alert-commander slots correctly shaped + cron patterns sane; system-map:1312 accurate vs alert-policy.md:46; AND assess reactivation-flood risk (agent dormant 5.5wk — confirm published-marker/TTL dedup prevents a stale-event alert burst on first fire). Write Task Report. On PASS: router promotes review->done_verified. qa MUST NOT touch board.",
    updated_at: $now,
    updated_by: "router",
    note: "16:37Z: cowork-refactory-expert completed FIX-ALERT-COMMANDER-DEAD-NO-SLOT (commit 6b86a47aa, RAW-verified) -> in_progress->review, dispatching qa gate."
  }
