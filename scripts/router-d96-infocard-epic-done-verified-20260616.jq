# Router 2026-06-16 — dev-team: INFOCARD-EXPAND-FETCH epic done -> done_verified after LIVE RAW first-hand verification.
#
# The 3 tasks are the gate for the standing user goal: every served info element must LINK its source +
# EXPAND to full fetched detail for re-check. Router verified the LIVE rendered card first-hand (not a badge):
#   - Backend GET /mcp/api/signals/stock/FPT (api-gateway:4000, the exact path the FE consumes) serves full
#     finding_data OBJECTS + source + ISO created_at, honest null/empty where genuinely absent.
#   - Frontend SSR /dashboard/analysis?stock=FPT renders the exact trigger card "Tác động Macro — FPT" with a
#     VALID date "14/6/2026" (was "Invalid Date"; 0 "Invalid Date" in live HTML) + 15x "▼ Xem thêm" Radix
#     disclosure triggers (aria-expanded/controls/label) on cascade + stock-signal cards.
#   - FE container rebuilt (img dc2c5d36, .Created +2042s after commit a20b2d18); mcp-server img a2ef510b post-6abf4d19.
#
# GUARD: refuse unless EACH of the 3 ids is uniquely in done[] (count==1). CONSERVATION: 6-lane total UNCHANGED
# (done -3, done_verified +3). null-safe (.id? // ""). Atomic temp->mv applied by caller.
# Usage: jq --arg now "$NOW" -f scripts/router-d96-infocard-epic-done-verified-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (["FIX-SIGNALS-STOCK-FULL-DETAIL","FIX-CASCADE-CARD-INVALID-DATE","FIX-INFOCARD-DROPDOWN-EXPAND"]) as $ids
| ({
    "FIX-SIGNALS-STOCK-FULL-DETAIL": "LIVE RAW (router): api-gateway:4000 GET /mcp/api/signals/stock/FPT serves full finding_data OBJECTS (chain_catalyst #6071 keys affected_sectors/affected_stocks/confidence/direction src=cafef; urgent_news #6069 cpi_pressure_risk/headline/hot_money_risk/regime) + honest null source & empty {} (verified_decision #6031) + ISO-8601 created_at; mcp-server img a2ef510b post-6abf4d19; qa bun 22/22.",
    "FIX-CASCADE-CARD-INVALID-DATE": "LIVE RAW (router): SSR /dashboard/analysis?stock=FPT renders cascade-card date '14/6/2026' (was 'Invalid Date'); 0 'Invalid Date' literals in live HTML; formatDateOnlyVi slash-format correct; formatDate.ts 33/33 + qa full-suite 1695/2 (2 pre-existing QUE disjoint, not a regression).",
    "FIX-INFOCARD-DROPDOWN-EXPAND": "LIVE RAW (router): SSR renders 15x '▼ Xem thêm' Radix disclosure (aria-expanded/aria-controls/aria-label='Xem chi tiết', data-state=closed) on cascade+signal cards; source <a target=_blank> lives in CollapsibleContent (renders on expand, correctly unmounted when closed); generic FindingDataPanel + honest empty-state; qa 25 tests + DJ-GATE-1 remediated dev-frontend-S2 (402ead6c); FE img dc2c5d36 +2042s."
  }) as $ev
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) as $before6
| ([ $ids[] as $t | ([ .task_board.done[]? | select((.id? // "")==$t) ] | length) ]) as $counts
| if ($counts | any(. != 1)) then error("GUARD: a task not uniquely in done[] — counts=" + ($counts|tostring)) else . end
# NB: bind id to $tid FIRST — `$ids | index(.id…)` would rebind `.` to $ids inside the pipe (the no-op bug fixed here).
| ([ .task_board.done[] | (.id? // "") as $tid | select( $ids | any(. == $tid) )
      | . + {status:"DONE_VERIFIED", next_agent:null, done_verified_at:$now, done_verified_by:"router", live_verify:($ev[$tid]) } ]) as $promoted
| .task_board.done = [ .task_board.done[] | (.id? // "") as $tid | select( ($ids | any(. == $tid)) | not ) ]
| .task_board.done_verified = ( $promoted + .task_board.done_verified )
| .head = {
    status:"idle", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null,
    note:("ROUTER " + $now + " — INFOCARD-EXPAND-FETCH epic DONE_VERIFIED (live RAW first-hand): #1 FIX-CASCADE-CARD-INVALID-DATE + #2 FIX-SIGNALS-STOCK-FULL-DETAIL + #3 FIX-INFOCARD-DROPDOWN-EXPAND -> done_verified. Live /dashboard/analysis?stock=FPT: valid date '14/6/2026' (was Invalid Date) + 15x 'Xem thêm' Radix disclosure + backend full finding_data+source+ISO. Standing goal (every served info element links source + expands to fetched detail for re-check) STATE now LIVE in production. FE img dc2c5d36, mcp-server a2ef510b. PUSH held (PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) != $before6)
    then error("CONSERVATION FAIL: 6-lane total changed on INFOCARD done->done_verified move") else . end
