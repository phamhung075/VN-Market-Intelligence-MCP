# po-s96: triage 2 NEW signal_queue rows + 48h D-PRUNE
# Pointer: docs/agents/po/flow/main.md (Step 1 triage + 0a-D-PRUNE)
# 1. sau-c06 -> READ  (false-positive: market_messages healthy, off-market 3h window)
# 2. sau-b13 -> TRIAGED, linked to FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH (no new task)
# 3. Mint LOW backlog task FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE
# 4. D-PRUNE: archive RESOLVED/READ rows older than 48h to .signal_queue.archive[]
# Args: $now (UTC iso), $cut (48h cutoff iso), $session
.signal_queue.rows |= (
  map(
    if .id == "sau-c06-202606171834" then
      . + {
        status: "READ",
        triaged_by: $session,
        triaged_at: $now,
        disposition: "FALSE-POSITIVE",
        triage_note: "RAW-probed live market.db (named volume vn-market-intelligence-mcp_market_data, sidecar): market_messages last sent_at=2026-06-17T15:30:02Z (age 4.09h), 19 rows/24h, 56 rows/72h, total 796 — table HEALTHY. C-06 fired at 18:34Z; its 3h window (~15:34-18:34Z) is fully OFF-MARKET (VN market closed 08:59Z). 0 messages is normal: summary/Chef agents post ~3x/day not hourly, last dish (15:30 evening_summary) just predates the window. Not a wedge. Generic recalibration minted -> FIX-AUDITOR-C06-OFFMARKET-RECALIBRATE (backlog/ready, LOW)."
      }
    elif .id == "sau-b13-202606171834" then
      . + {
        status: "TRIAGED",
        triaged_by: $session,
        triaged_at: $now,
        disposition: "DUPLICATE",
        linked_task: "FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH",
        triage_note: "DUP/SYMPTOM of in-flight FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH (in_progress, CHANGES_REQUESTED->dev-mcp-server, test-fix re-dispatch underway). The 8 stale-pending>72h rows ARE the genuinely-absent tickers stuck at attempts=0 that that fix terminalizes: post-rebuild they accumulate real-discovery attempts -> reach MAX_ENRICH_ATTEMPTS(5) -> marked url_not_found terminal -> drop out of pending -> B-13 self-clears. No new task minted. dev-mcp-server + QA own that row's status/next_agent — PO does not touch it."
      }
    else . end
  )
)
# 0a-D-PRUNE: move RESOLVED/READ rows older than 48h into archive
| ( [ .signal_queue.rows[]
    | select((.status=="RESOLVED" or .status=="READ") and ((.resolved_at // .triaged_at // .ts) < $cut)) ] ) as $pruned
| .signal_queue.archive = (.signal_queue.archive + $pruned)
| .signal_queue.rows |= map(
    select( ((.status=="RESOLVED" or .status=="READ") and ((.resolved_at // .triaged_at // .ts) < $cut)) | not )
  )
# Mint LOW backlog recalibration task (BACKLOG only — WIP full, do not promote)
| .task_board.backlog += [ $newtask ]
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = $session
| .task_board._updated_at = $now
| .task_board._updated_by = $session
| ._updated_at = $now
| ._updated_by = $session
