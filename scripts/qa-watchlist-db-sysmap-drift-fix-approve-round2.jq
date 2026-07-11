# QA round 2 — WATCHLIST-DB-SYSMAP-DRIFT-FIX: APPROVED, status-flip AND lane-move
# (review[] -> done[], per feedback_review_status_stuck_in_inprogress_lane_blocks_wip.md —
# status-flip-without-lane-move has blocked WIP twice; both must happen together).
#
# Round-1 blocker (AC-5, technical-analysis Go container serving stale 41-ticker set —
# resolves watchlist once at process startup) remediated by ops: single-service
# `docker compose restart technical-analysis` (no code/image change). QA round-2
# RAW-verified live, first-hand, not relayed:
#   - container StartedAt=2026-07-11T12:06:33Z, healthy; startup log line
#     "WATCHLIST_TICKERS not set — resolved from DB watchlist table" count:33
#     (was count:41 on the prior 2026-07-08 boot).
#   - POST /ta/roc-momentum and /ta/money-flow-oscillators (both :5003, live curl):
#     33 unique .tickers[].code each, diff against system-map.json's 33 active
#     tickers = zero both directions, zero of the stale-set tickers
#     (BDI/DLC/GVR/JSH/SIS/VDC/VEA/VNH/GAS/MBB/ACB/CTG/VPB/HSG/NKG/HVN/ACV/HCM/
#     DHG/POW/PPC/TCH/REE/MWG) present in either response.
#   - git log edd1ec31e..HEAD -- apps/mcp-server apps/technical-analysis = empty:
#     no new commits since round-1 HEAD, scope unchanged.
#
# Usage: jq --arg now "$NOW" -f scripts/qa-watchlist-db-sysmap-drift-fix-approve-round2.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| "WATCHLIST-DB-SYSMAP-DRIFT-FIX" as $tid
| (
    .task_board.backlog + .task_board.ready + .task_board.in_progress
    + .task_board.review + .task_board.done + .task_board.done_verified
    + [.task_board.active_sprints[]?.tasks[]?]
    + [.task_board.closed_sprints[]?.tasks[]?]
    | length
  ) as $before
| ([.task_board.review[]?|select(.id==$tid)]|length) as $rv
| if $rv != 1 then error("tid not uniquely in review[] — refuse flip: " + ($rv|tostring)) else . end
| (.task_board.review[]|select(.id==$tid)) as $row
| (
    ($row | del(.next_agent))
    + {
        status: "DONE",
        qa_verdict: "APPROVED",
        qa_round: 2,
        qa_reviewed_at: $now,
        qa_reviewed_by: "qa",
        qa_note: "APPROVED round 2. Round-1 AC-5 blocker (technical-analysis Go container serving stale 41-ticker set, resolved once at startup) remediated by ops: single-service `docker compose restart technical-analysis`, no code/image change (WATCHLIST_TICKERS unset, DB-fallback path). QA RAW-verified live, first-hand: container StartedAt=2026-07-11T12:06:33Z healthy; startup log 'resolved from DB watchlist table count:33' (was 41 on prior boot). Live-curled both endpoints myself: POST /ta/roc-momentum and /ta/money-flow-oscillators each return 33 unique .tickers[].code, zero-diff against system-map.json's 33 active tickers both directions, zero of the prior stale-set tickers in either response. git log edd1ec31e..HEAD -- apps/mcp-server apps/technical-analysis = empty (no new commits since round-1 HEAD, scope unchanged from round-1's already-clean code/tests/DDD/security pass).",
        completed_at: $now
      }
  ) as $done_row
| .task_board.review = [ .task_board.review[] | select(.id != $tid) ]
| .task_board.done = (.task_board.done + [$done_row])
| ._updated_at = $now | ._updated_by = "qa"
| .task_board._updated_at = $now | .task_board._updated_by = "qa"
| (
    .task_board.backlog + .task_board.ready + .task_board.in_progress
    + .task_board.review + .task_board.done + .task_board.done_verified
    + [.task_board.active_sprints[]?.tasks[]?]
    + [.task_board.closed_sprints[]?.tasks[]?]
    | length
  ) as $after
| if $after != $before then error("CONSERVATION FAIL: total changed on a lane-move-only write (before=" + ($before|tostring) + " after=" + ($after|tostring) + ")") else . end
