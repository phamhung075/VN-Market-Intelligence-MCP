# Router 2026-06-17 — dev-team tick: record FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD rebuilt+live-probed, done_verified WITHHELD.
#
# Chain: dev-mcp-server fix (commit 09302e45, withSectionDeadline Promise.race 3000ms over the 4 async sections of
# getSystemStatus) -> qa APPROVED code-gate (commit 8b41ffed, review->done, REBUILD_REQUIRED:YES) -> ops rebuild
# (force-recreate --no-deps --build mcp-server) -> ROUTER RAW-verify + LIVE probe (first-hand, this script's author).
#
# ROUTER RAW-VERIFY (first-hand, NOT relaying ops badge):
#   - Image .Created 2026-06-17T02:47:55Z > commit 09302e45 committer-date 2026-06-17T02:02:15Z UTC (image ~45min newer);
#   - Marker withSectionDeadline/SECTION_DEADLINE_MS present (17 hits) in RUNNING container /app/src/.../systemTools.ts
#     (docker exec, not host worktree);
#   - Container healthy, StartedAt 02:48:01Z (6s after image build = genuine recreate), no Bun-JIT 500 signature;
#   - All 11 peer services Up+healthy — force-recreate --no-deps took no casualties.
#
# ROUTER LIVE PROBE (get_system_status via gateway, on the rebuilt image):
#   - Returns ALL 4 guarded sections (DB STATUS / SOURCE HEALTH / DATA FRESHNESS / RECENT ERRORS), bounded, single call;
#   - No hang, no Bun-JIT 500, no synthetic-ok masking — degradation reported HONESTLY (Reuters & Trading Economics
#     "Suy giam", BCTC "Cu" 6.2h, foreign-flow fallbacks exhausted). Happy-path + no-regression CONFIRMED LIVE.
#
# done_verified WITHHELD (set explicit false): the ACTIVE timeout arm (a section exceeding 3000ms -> partial serve +
# "[LABEL] timeout/unknown — section exceeded 3000ms deadline") is NOT steady-state observable — no source is currently
# STALLING (the degraded sources fail FAST/connection-refused, never crossing the 3000ms deadline), and inducing a real
# stall would require invasive fault-injection on a live market-hours container (VN market OPEN) — declined. The stall arm
# is proven by qa's 6 AC unit tests (green) + code-marker + deployed-image, but per feedback_graceful_premise_verify_error_path
# a live happy-path return must NOT be conflated with the error/stall path. Same class as AF-1 (router-d97) & sentinel-
# discriminator: DONE, done_verified:false. PUSH held (PO out-of-band).
#
# In-place done-row stamp (NO lane move): clears next_agent=ops->null (ops satisfied; removes done-lane re-dispatch hazard),
# rebuild/rebuild_required->false (rebuilt+verified), done_verified:false, ops_rebuild_verified_at + live_verify note.
# head re-stamped idle (was qa-set idle) so pipeline-resume does not re-dispatch.
#
# GUARD: refuse unless FIX-SYSTEM-STATUS uniquely in done[] (count==1) AND its status == DONE.
# CONSERVATION: 6-lane total UNCHANGED (no lane move). Atomic temp->mv applied by caller.
# Usage: jq --arg now "$NOW" -f scripts/router-fix-system-status-done-rebuilt-withheld-20260617.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD" as $id
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done,.task_board.done_verified,.task_board.backlog]|map(length)|add) as $before6
| ([ .task_board.done[] | select((.id // .task_id // "")==$id) ] | length) as $cnt
| if ($cnt != 1) then error("GUARD: FIX-SYSTEM-STATUS not uniquely in done[] — count=" + ($cnt|tostring)) else . end
| ( .task_board.done[] | select((.id // .task_id // "")==$id) | .status ) as $st
| if (($st|ascii_upcase) != "DONE") then error("GUARD: done row status not DONE — got " + ($st|tostring)) else . end
| .task_board.done = [ .task_board.done[]
    | if ((.id // .task_id // "")==$id)
      then . + {
        next_agent:null, route_to:null,
        rebuild:false, rebuild_required:false,
        done_verified:false,
        ops_rebuild_verified_at:$now,
        live_verify:("LIVE RAW (router, first-hand) " + $now + " — REBUILT+PROBED, done_verified WITHHELD. ops force-recreate --no-deps --build mcp-server. Image .Created 02:47:55Z > commit 09302e45 02:02:15Z UTC (~45min newer); marker withSectionDeadline/SECTION_DEADLINE_MS present (17 hits) in RUNNING /app/src/.../systemTools.ts (docker exec); container healthy StartedAt 02:48:01Z, no Bun-JIT 500; 11/11 peers Up+healthy. LIVE get_system_status (gateway, rebuilt image): all 4 guarded sections (DB/SOURCE-HEALTH/DATA-FRESHNESS/RECENT-ERRORS) returned bounded, no hang, no 500, HONEST degradation (Reuters & Trading Economics Suy-giam, BCTC Cu 6.2h, foreign-flow fallbacks exhausted) — happy-path + no-regression CONFIRMED. done_verified:false — active timeout arm (section >3000ms -> partial serve + timeout text) NOT live-observable: no source currently STALLING (degraded sources fail-fast, never crossing 3000ms), real-stall induction declined on live market-hours container. Arm proven by qa 6 AC unit tests + code-marker + deployed-image (NOT live). Per feedback_graceful_premise_verify_error_path: happy 200 != error path. PUSH held (PO out-of-band).")
      }
      else . end ]
| .head = {
    status:"idle", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null,
    note:("ROUTER " + $now + " — FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD REBUILT+LIVE-PROBED (image .Created 02:47:55Z > commit 09302e45; marker live; 11/11 peers healthy; get_system_status serves 4 bounded sections, honest degradation, no 500). done_verified WITHHELD (false) — active >3000ms stall arm not steady-state observable (sources fail-fast), proven by unit tests not live; same class as AF-1. next_agent cleared (ops satisfied). PUSH held (PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="router"
| .task_board._updated_at=$now | .task_board._updated_by="router"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done,.task_board.done_verified,.task_board.backlog]|map(length)|add) != $before6)
    then error("CONSERVATION FAIL: 6-lane total changed on FIX-SYSTEM-STATUS done-rebuilt-withheld stamp") else . end
