# po-s92-context-bloat-notebook-fold.jq
#
# Single-task IN-PLACE fold: refresh the existing CLEAN-CONTEXT-BLOAT-NOTEBOOKS-20260614
# backlog row with the LIVE over-cap notebook set (ground-truth at triage time), instead of
# minting a duplicate task or dispatching claude-manager-helper for each per-notebook signal.
#
# Origin 2026-06-16/17 dev-team tick: context_bloat_breach signal for agent-father.md (219L>200)
# routed to po. RAW-scan found 6 notebooks over-cap (set grew from the stale "4" the task was
# minted with on 06-14) — the breach is an INSTANCE of the already-open CLEAN task, not new work.
# Dedup discipline (triage-signals zone_missing_tier3/repair_task_request pattern): existing open
# entry found -> fold, never mint a dup. Records .targets (was null) so the eventual code-janitor
# run has the live list + the signal isn't lost.
#
# Reusable pattern for "a per-item context-bloat (or similar recurring-breach) signal lands while
# an umbrella CLEAN task already tracks the class — fold the live RAW-scanned target set into the
# existing row in-place (targets + status_note + title count), idempotent, never mint a dup, never
# dispatch a maintenance agent per item".
#
# Args:
#   $now      ISO-8601 UTC timestamp
#   $targets  JSON array string of {file, lines} over-cap rows (RAW-scanned at triage)
#
# Idempotency: guarded by .fold_marker on the row — re-run overwrites the same fields with the
# same shape (delta 0 modulo $now/$targets refresh); no row is added or removed.
#
# Harness (caller): atomic temp -> [ -s ] -> jq empty -> CONSERVATION (every lane LENGTH byte-stable
# incl backlog; total unchanged) -> PLACEMENT (target row still in backlog, status still TODO)
# -> rename. Commit orch-state.json by EXPLICIT PATH. PUSH held (PO out-of-band).

($targets | fromjson) as $tg
| ($tg | length) as $n
| .task_board.backlog |= map(
    if (.id // "") == "CLEAN-CONTEXT-BLOAT-NOTEBOOKS-20260614" then
      .title = "context-bloat: trim \($n) RAW-verified over-cap agent notebooks to SSOT cap=200"
      | .targets = $tg
      | .status_note = "Live over-cap set RAW-scanned \($now): \($n) notebooks. Janitor (owner=code-janitor) trims each to SSOT cap=200 via OVERWRITE-to-≤50L per notebook-write skill, preserving Carry-over block. Folded from per-notebook context_bloat_breach signals (agent-father 219L this tick) — do NOT mint per-notebook dups, do NOT dispatch claude-manager-helper per item."
      | .fold_marker = { folded_at: $now, source_signal: "context-bloat-agent-father-md-219L", live_target_count: $n }
    else . end
  )
