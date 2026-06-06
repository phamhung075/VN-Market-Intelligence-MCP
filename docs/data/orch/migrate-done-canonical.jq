# ORCH-TASK-CANON F1B migration script
# Input: orch-state.json
# Output: migrated orch-state with .task_board.done[] normalized to canonical schema
# Created: 2026-06-06 by agent-father

def normalize_status:
  if test("^DONE") then "DONE"
  elif test("^RESOLVED|^SUPERSEDED|^SHIPPED") then "DONE"
  elif test("^IN_PROGRESS") then "IN_PROGRESS"
  elif test("^REVIEW|READY_FOR_REVIEW") then "REVIEW"
  elif test("^BLOCKED") then "BLOCKED"
  elif test("^CANCELLED") then "CANCELLED"
  elif test("DEFERRED|POSTPONED|FUTURE") then "DEFERRED"
  else "TODO"
  end;

def status_note_from(raw_status; closed_at):
  if (raw_status | normalize_status) != raw_status then
    raw_status + (if closed_at != null and closed_at != "" then " (\(closed_at))" else "" end)
  else
    null
  end;

def canonical_row:
  . as $r |
  {
    id: ($r.id // $r.task_id),
    title: ($r.title // $r.desc // $r.label // $r.summary // ($r.id // $r.task_id)),
    owner: ($r.owner // "unknown"),
    status: ($r.status | normalize_status),
    zone: ($r.zone // "unknown"),
    created_at: ($r.created_at // $r.closed_at // $r.done_at // $r.opened_at // "unknown")
  }
  # Optional fields — include only if present and non-null
  + (if $r.type != null then {type: $r.type} else {} end)
  + (if $r.size != null then {size: $r.size} else {} end)
  + (if $r.priority != null then {priority: $r.priority} else {} end)
  + (if ($r.closed_at // $r.done_at // $r.resolved_at // $r.completed_at) != null then
       {closed_at: ($r.closed_at // $r.done_at // $r.resolved_at // $r.completed_at)}
     else {} end)
  + (if $r.sprint != null then {sprint: $r.sprint} else {} end)
  + (if $r.depends != null and $r.depends != [] then {depends: (if ($r.depends | type) == "array" then $r.depends else [$r.depends] end)} else {} end)
  + (if $r.note != null then {note: $r.note} else {} end)
  + (if ($r.deploy_note // $r.done_note // $r.resolution) != null then
       {note: ([$r.note, ($r.deploy_note // $r.done_note // $r.resolution)] | map(select(. != null)) | join(" | "))}
     else {} end)
  + (if $r.files != null then {files: $r.files} else {} end)
  + (if ($r.commit // $r.commits) != null then {commit: ($r.commit // $r.commits)} else {} end)
  + (
      # status_note: combine existing status_note + normalized status detail
      ( [$r.status_note, (status_note_from($r.status; $r.closed_at // $r.done_at))] | map(select(. != null)) ) as $notes |
      if ($notes | length) > 0 then {status_note: ($notes | join(" | "))} else {} end
    );

# Main transform
. as $root |
(
  $root.task_board.done |
  map(
    if .id == "ORCH-DASH-DECISION-DRILLDOWN" then
      # Container row — extract children and omit container
      (.tasks // [] | map(canonical_row))
    else
      # Regular task row — normalize
      [canonical_row]
    end
  ) |
  flatten
) as $migrated_done |
$root |
.task_board.done = $migrated_done |
.task_board._updated_at = "2026-06-06T21:00:00Z" |
.task_board._updated_by = "agent-father"
