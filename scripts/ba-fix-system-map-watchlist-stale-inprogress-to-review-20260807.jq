# ba tick — FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58: spec complete, lane-move
# in_progress[] -> review[], next_agent=architect. supervised/plan_only preserved
# unchanged (spread from $row). Idle-resets .head only if it still points at this
# task_id (guards against a peer having already advanced it).
# Usage: jq --arg now "$NOW" -f scripts/ba-fix-system-map-watchlist-stale-inprogress-to-review-20260807.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def taskid: "FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58";

([.task_board.in_progress[] | select(.id == taskid)]) as $rows
| if ($rows | length) != 1 then
    error("expected exactly 1 row in in_progress[] for " + taskid + ", found " + ($rows | length | tostring))
  else
    ($rows[0]) as $row
    | .task_board.in_progress |= map(select(.id != taskid))
    | .task_board.review += [
        ($row + {
          status: "REVIEW",
          next_agent: "architect",
          ba_spec_complete: true,
          ba_handoff: "docs/handoffs/FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58-BA-spec.md",
          ba_completed_at: $ARGS.named.now,
          ba_note: "BA spec complete (FR-1..FR-8, NFR-1..5, edge cases, remedy trade-off table, file-by-file plan) — zero PO blockers, HOW stays architect's per the row's own instruction. CRITICAL FINDING reframing root cause: live-verified (docker exec against the exact DB_PATH the running mcp-server container uses) the watchlist table = 34 rows, byte-identical to system-map.json, right NOW — not the 58 this row's prior note claims. All 34 rows share one identical added_at (2026-07-31 18:25:37), proving a single bulk reseed-from-empty event. docs/incidents/2026-08-06-sqlite-db-corruption-wai-rearm-vector.md (5th documented SQLITE_CORRUPT since 04-25) explains why: its own recovery notes wrongly certify watchlist as fully regenerated — true only for system-map.json-seeded rows, false for add_to_watchlist-only rows (verified: plain INSERT, zero file write-back), which are permanently lost on every corruption-recovery reseed. coverage-state.json (07-25 snapshot, 57 tickers) corroborates a fuller roster existed pre-corruption. BA lacks mcp__gateway__call_tool grant (confirmed via a live failed call) so could not place the decisive get_watchlist RPC directly — flagged as Blocker Q1 for architect/dev-team (who hold gateway access) to re-verify live before finalizing design. Reframes PO's 3 candidates: (i) generate system-map.json FROM the DB is unsafe standalone (DB proven non-durable, 5 incidents, most recently 6 days apart) — recommended a bidirectional write-through variant + the CI-audit candidate combined, not picking one of the three as-is. Also folded in 2 doc-drift instances beyond the row's named files (frontend/domain-model.md, technical-analysis architecture docs) per the row's own \"correct stale docstrings\" instruction, caught a stale file citation (fb-market-poster/flow/main.md:200 -> actually daily.md:157 after the 2026-08-06 pipeline split), and flagged a repeat-defect risk (technical-analysis Go service caches watchlist once at boot — already burned one QA round on this exact gap in the 2026-07-11 WATCHLIST-DB-SYSMAP-DRIFT-FIX precedent).",
          updated_at: $ARGS.named.now,
          updated_by: "ba",
          entered_review_at: $ARGS.named.now
        })
      ]
    | .task_board._updated_at = $ARGS.named.now
    | .task_board._updated_by = "ba"
    | (if (.head.active_task_id // null) == taskid then
        .head = {status:"idle", updated_at:$ARGS.named.now, updated_by:"ba", active_task_id:null, next_agent:null}
      else . end)
  end
