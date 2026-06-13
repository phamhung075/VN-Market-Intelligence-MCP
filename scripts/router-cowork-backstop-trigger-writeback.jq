# Router AC-2 writeback: stamp Layer-A RemoteTrigger ids onto the 5 guaranteed cowork slots.
# Sets trigger_id, trigger_status="active", last_reactivated_at=$now for each guaranteed slot.
# Pointer: docs/protocols/cowork-master-cron-runbook.md §1 (Layer-A restore) + §9 (stability gate).
# Usage: jq --arg now "$NOW" -f scripts/router-cowork-backstop-trigger-writeback.jq docs/data/cowork-schedule.json
{
  "chef-morning":  "trig_01FdUF4YWg8TqpXVnBLC7GYj",
  "chef-eod":      "trig_01NS8j25rYt4meXVqHyRsVNn",
  "chef-evening":  "trig_013zatVHSRiChMJwm5XtSBEx",
  "digest-sunday": "trig_01FjB1WhF1bpgH1oYZF4BYru",
  "tnb-audit":     "trig_01QgnBwnEyzLj5as55i53tea"
} as $tids
| ([.slots[] | select($tids[.slot_id] != null)] | length) as $matched
| if $matched != 5 then error("expected 5 guaranteed slots, matched \($matched)") else . end
| .slots |= map(
    if ($tids[.slot_id] != null) then
      .trigger_id = $tids[.slot_id]
      | .trigger_status = "active"
      | .last_reactivated_at = $now
    else . end
  )
