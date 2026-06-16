# Router 2026-06-16 — dev-team: INFOCARD epic gate advance after BOTH coding tasks RAW-verified GREEN first-hand.
#
# #2 FIX-SIGNALS-STOCK-FULL-DETAIL (dev-mcp-server, commit 6abf4d19): in_progress -> review.
#     Router RAW: stockSignalsHandler.ts exposes full finding_data(object) + source(finding_data->payload->null)
#     + ISO created_at (NaN-guarded honest-null), schema-evolution guarded, GENERIC across signal_types (/goal#2);
#     bun test 22/22 green isolation; tsc exit0; commit scoped 5 files no race-sweep. REBUILD mcp-server pending (ops).
# #1 FIX-CASCADE-CARD-INVALID-DATE (dev-frontend, commit 60652af3): LANE RECONCILE in_progress -> review.
#     Agent set .status=REVIEW but left the element in in_progress[] (lane lagged status). Router RAW: formatDate.ts
#     robust+generic (NaN-guard->'—', includes('T') kills double-Z root), 33/33 vitest green, 0 brittle parses left.
#     FE rebuild batched with #3 (one frontend rebuild).
# #3 FIX-INFOCARD-DROPDOWN-EXPAND (dev-frontend): backlog -> in_progress, UNBLOCK (#2 code GREEN), dispatch.
#     Build reusable expand-on-click dropdown + clickable source link against the verified StockSignalItem contract.
#     This is the task that makes the served-info-verifiable standing-goal STATE exist in the codebase.
#
# GUARD: refuse unless #2 & #1 each uniquely in in_progress[] AND #3 uniquely in backlog[].
# CONSERVATION: 6-lane total UNCHANGED (in_progress -1 net [-2 promote +1 dispatch]; review +2; backlog -1).
# null-safe (.id? // ""). Usage: jq --arg now "$NOW" -f scripts/router-d95-infocard-2review-3dispatch-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-SIGNALS-STOCK-FULL-DETAIL" as $lead
| "FIX-CASCADE-CARD-INVALID-DATE" as $fe1
| "FIX-INFOCARD-DROPDOWN-EXPAND" as $drop
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) as $before6
| ([.task_board.in_progress[]?|select((.id? // "")==$lead)]|length) as $nlead
| ([.task_board.in_progress[]?|select((.id? // "")==$fe1)]|length) as $nfe1
| ([.task_board.backlog[]?|select((.id? // "")==$drop)]|length) as $ndrop
| if $nlead != 1 then error("lead not uniquely in in_progress[] — refuse: " + ($nlead|tostring)) else . end
| if $nfe1  != 1 then error("fe1 not uniquely in in_progress[] — refuse: "  + ($nfe1|tostring))  else . end
| if $ndrop != 1 then error("drop not uniquely in backlog[] — refuse: "     + ($ndrop|tostring)) else . end
| ([.task_board.in_progress[]?|select((.id? // "")==$lead)][0]) as $leadtask
| ([.task_board.in_progress[]?|select((.id? // "")==$fe1)][0])  as $fe1task
| ([.task_board.backlog[]?|select((.id? // "")==$drop)][0])     as $droptask
| ($leadtask + {
    status:"REVIEW", next_agent:"qa", impl_commit:"6abf4d19", rebuild_required:true,
    code_verify:"GREEN (router RAW first-hand): stockSignalsHandler.ts querySignalsForStock exposes full finding_data (object, never flattened) + source (finding_data.source->payload.source->null) + ISO created_at via normalizeCreatedAt (NaN-guarded honest-null); schema-evolution guarded (probes optional cols); GENERIC across all signal_types (no special-case, /goal#2); bun test 22/22 green isolation; tsc exit0; commit 6abf4d19 scoped 5 files, no race-sweep of FE WIP.",
    rebuild_note:"REBUILD mcp-server (ops: force-recreate --no-deps --build, NEVER down; verify image .Created > 1781628457). Then router LIVE RAW-verify GET /mcp/api/signals/stock/:code serves full finding_data + source + ISO created_at before done_verified.",
    push_gate:"HELD (PO out-of-band).",
    promoted_to_review_ts:$now, promoted_by:"dev-team"
  }) as $leadp
| ($fe1task + {
    status:"REVIEW", next_agent:"qa",
    code_verify:"GREEN (router RAW first-hand): app/lib/formatDate.ts robust+generic (parseDate NaN-guard->null->'—'; includes('T') check kills double-Z 'Invalid Date' root at old dashboard.analysis.tsx:780; vi-VN/Asia-HCM; no per-card/ticker/date-literal hardcode /goal#2); 0 brittle inline parses remain; 33/33 vitest green isolation; commit 60652af3 scoped 5 FE files no race-sweep.",
    lane_reconcile:"in_progress->review — agent set .status=REVIEW but left element in in_progress[] (lane lagged status); router reconciled.",
    rebuild_required:true,
    rebuild_note:"FE rebuild batched with FIX-INFOCARD-DROPDOWN-EXPAND (#3) — single frontend rebuild + one live-verify of the card.",
    promoted_to_review_ts:$now, promoted_by:"dev-team"
  }) as $fe1p
| ($droptask + {
    status:"IN_PROGRESS", next_agent:"dev-frontend", dispatched_at:$now, dispatched_by:"dev-team", dispatched_to:"dev-frontend",
    blocked_by:[],
    unblocked_note:"FIX-SIGNALS-STOCK-FULL-DETAIL code GREEN (commit 6abf4d19, in review) — endpoint contract now exposes full finding_data + source + ISO created_at. Build reusable expand-on-click dropdown + clickable source link against this contract; honest empty-state where a field is genuinely null (no fabrication).",
    contract_ref:"apps/mcp-server/src/interface/mcp/routes/stockSignalsHandler.ts StockSignalItem {finding_data:object|null, payload:object, source:string|null, created_at:ISO, direction, confidence_score, detail}; endpoint GET /mcp/api/signals/stock/:code?type=..."
  }) as $dropp
| .task_board.in_progress = [ .task_board.in_progress[] | select((.id? // "") != $lead and (.id? // "") != $fe1) ]
| .task_board.in_progress += [ $dropp ]
| .task_board.review = ([ $leadp, $fe1p ] + .task_board.review)
| .task_board.backlog = [ .task_board.backlog[] | select((.id? // "") != $drop) ]
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:$drop, next_agent:"dev-frontend", rebuild_required:true,
    next_action:("INFOCARD epic: #1 FIX-CASCADE-CARD-INVALID-DATE + #2 FIX-SIGNALS-STOCK-FULL-DETAIL -> review (both router RAW-verified GREEN first-hand: FE date helper 33/33; backend full finding_data+source+ISO 22/22). #2 needs mcp-server REBUILD (ops, force-recreate --no-deps --build) then router LIVE RAW-verify endpoint. #3 FIX-INFOCARD-DROPDOWN-EXPAND dispatched -> dev-frontend (reusable expand-on-click dropdown + clickable source link against verified StockSignalItem contract) = the task that makes the served-info-verifiable standing-goal STATE exist. On #3 return: RAW-verify -> FE rebuild (batch #1+#3) -> LIVE RAW-verify card (valid date + source link + dropdown full REAL detail). PUSH held (PO out-of-band)."),
    note:("ROUTER " + $now + " — dev-team: #2 backend GREEN (6abf4d19) -> review + mcp-server rebuild pending (ops); #1 FE lane reconciled -> review; #3 dropdown unblocked + dispatched dev-frontend. WIP coding=1 (#3); ARCH-CRON architect-track separate. Commit by pathspec.")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done,.task_board.backlog]|map(length)|add) != $before6)
    then error("CONSERVATION FAIL: 6-lane total changed on INFOCARD 2-review + 1-dispatch move") else . end
