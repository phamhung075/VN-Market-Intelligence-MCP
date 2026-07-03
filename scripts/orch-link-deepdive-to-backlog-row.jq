# orch-link-deepdive-to-backlog-row.jq
# Reusable PO helper: link a completed deep_dive_result to an EXISTING backlog row
# instead of minting a duplicate (DEDUP-first triage: augment, never duplicate).
# Appends a corroboration note to the target row's status_note and bumps top-level provenance.
# Pipe through scripts/orch-apply.sh (Zod + CAS + atomic rename).
#
# Args:
#   --arg row_id  <backlog row .id to enrich>
#   --arg note    <corroboration note text — no session UUID, use "(po router-dispatched)">
#   --arg now     <ISO-8601 UTC timestamp>
#   --arg by      <writer, e.g. "po">
#
# Only mutates EXISTING fields (status_note + top-level _updated_*) to stay schema-safe.
.task_board.backlog |= map(
  if .id == $row_id
  then .status_note = ((.status_note // "") + " || " + $note)
  else . end
)
| ._updated_at = $now
| ._updated_by = $by
