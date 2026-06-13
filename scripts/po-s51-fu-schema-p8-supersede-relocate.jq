# po-S51 slot-handover adjudication — free the serialized mcp-server code slot
# Relocate FU-SCHEMA-DRIFT-P8-IMPL from in_progress[] -> backlog[] with status=SUPERSEDED,
# formalizing the ALREADY-MADE PO path-B parked/best-effort-exhausted/superseded decision.
# NOT done_verified: it did not pass; 629 is a documented FLOOR, superseded by FU-CI-PROFILE-629 (DONE).
# Disposition precedent: FU-CTG-REFINE-PICKUP (SUPERSEDED) + CI-RED-8081e584-FIX (DONE-GATE-SUPERSEDED)
# both live in backlog[]. Full existing note preserved verbatim + one-line closing stamp appended.
# Scoped: in_progress[] (filter out) + backlog[] (append) + task_board._updated_*; no whole-object rewrite.

  ($now) as $stamp
| (.task_board.in_progress[] | select(.id=="FU-SCHEMA-DRIFT-P8-IMPL"))
    as $t
| .task_board._updated_at = $stamp
| .task_board._updated_by = "po-S51"
| .task_board.in_progress = (
    .task_board.in_progress | map(select(.id != "FU-SCHEMA-DRIFT-P8-IMPL"))
  )
| .task_board.backlog += [
    $t
    | .status = "SUPERSEDED"
    | .closed_at = $stamp
    | .closed_by = "po-S51"
    | .disposition = "PARKED-BEST-EFFORT-EXHAUSTED / SUPERSEDED-BY-FU-CI-PROFILE-629"
    | .note = (.note + " || [po-S51 " + $stamp + "] CLOSING STAMP: formalizing exit from in_progress[] -> backlog[] status=SUPERSEDED. Hypothesis empirically disproven 4 consecutive touches (P5/P6/P7/P8); 629 is the documented schema-drift FLOOR; apps/ already reverted byte-identical to 629 baseline (880ffca6 / 2a6044b1). No 7th touch. Superseded by FU-CI-PROFILE-629 (now DONE). Frees the single serialized apps/mcp-server/ code slot for TSU-DEV-U3.")
  ]
