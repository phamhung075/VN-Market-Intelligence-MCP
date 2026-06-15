# Router dev-team tick 2026-06-15T10:1xZ — promote FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE
# review -> done_verified. Rebuild LANDED + LIVE GATE GREEN (router RAW, NOT a relayed badge).
#
# ROUTER RAW LIVE VERIFY (independent docker inspect + named-vol sidecar, 10:1xZ):
#   * RUNNING container vn-market-intelligence-mcp-mcp-server-1 Image=d63fd379 (NEW, built
#     10:12:05Z > commit ff874c82 10:00:57Z), RestartCount=0, Health=healthy, Running=true,
#     StartedAt 10:12:11Z — fixed code is live.
#   * SENTINEL GATE (named-vol market.db, router sidecar keinos/sqlite3): mcpServerStartup=24
#     (last 10:12:13, this boot), mcpServerCleanShutdown row ABSENT => COUNT=0 => MIN=NULL =>
#     firstCleanShutdown=NULL => bootstrap-null guard returns {restartCount:0,alertSent:false}.
#     SILENT BY THE GUARD even with 3 pre-fix deploy startups (08:02/08:42/10:12) in the 4h
#     window — the exact false page this task kills. Pre-fix code would have fired >=2.
#   * Health 200 toolCount 163; daily_ohlcv 34,568 rows (no write-wedge); 12/12 peers up
#     (no peer killed by the force-recreate).
#
# FIRE-PATH proof: steady-state >=2-crash-after-bootstrap firing covered by router-run
#   bun test (10 pass / 0 fail / 33 expect()). Self-healing: next graceful stop writes the
#   first mcpServerCleanShutdown via the new composition-root handler => full discrimination
#   goes live once pre-fix rows age out of the 4h window.
#
# DoD: discriminator generic no hardcode PASS | bootstrap guard silent on rollout PASS (live) |
#   crash-loop >=2 still fires PASS (unit) | tests 10 green PASS | commit hygiene clean PASS |
#   rebuild landed new image running healthy PASS | live RAW-verified silent PASS. => done_verified.
#
# PUSH: HELD as a bundle (RSI c9892200 / MA5 d32f0a17 / restart 2d494f77+ff874c82 / routers).
#   FIX-ALERT-ENGINE-RSI-SINGLEDIGIT behavioral gate fires 2026-06-16 (briefing 01:00Z / scan
#   02:15Z). Runtime already serves this fix via the landed rebuild; origin-sync non-urgent.
#   PO pushes the whole fast-forward after the RSI gate closes.
#
# GUARD: refuse unless task in review[] AND not already in done_verified[].
# CONSERVATION: total task count UNCHANGED (pure move review->done_verified).
# Usage: jq --arg now "$NOW" -f scripts/router-d63-mcp-restart-alert-doneverified-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.review[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in review[] — refuse")
  elif ([.task_board.done_verified[]? | select(.id==$tid)]|length>0) then error("already in done_verified[] — refuse")
  else . end
| .task_board.review = [ .task_board.review[]? | select(.id!=$tid) ]
| .task_board.done_verified = (.task_board.done_verified + [ $t + {
      status:"DONE_VERIFIED",
      done_verified_ts:$now,
      done_verified_by:"dev-team",
      rebuild_landed:"vn-market-intelligence-mcp-mcp-server-1 Image=d63fd379 built 10:12:05Z (>commit ff874c82 10:00:57Z), RestartCount=0, healthy, Running; health 200 toolCount 163; named-vol daily_ohlcv 34,568 rows; 12/12 peers up (no peer killed by force-recreate)",
      live_gate_evidence:"router RAW named-vol sidecar 10:1xZ — mcpServerStartup=24 (last 10:12:13), mcpServerCleanShutdown ABSENT (COUNT=0 => firstCleanShutdown NULL) => bootstrap-null guard returns {restartCount:0,alertSent:false} => restart-cadence tick SILENT despite 3 pre-fix deploy startups in the 4h window. Pre-fix code would have fired >=2 (the false page). Fire-path proven by router-run bun test 10 pass.",
      goal_alignment:"/goal#1 (false-positive restart page on every intentional force-recreate deploy fixed at root — clean-shutdown sentinel discriminator + migration-boundary bootstrap guard) + /goal#2 (generic across all deploys/crashes, no per-deploy-id hardcode/allowlist/timestamp)",
      push_disposition:"HOLD — bundled with FIX-ALERT-ENGINE-RSI-SINGLEDIGIT + MA5; that fix's behavioral gate fires 2026-06-16; runtime already serves this fix via the landed rebuild so origin-sync non-urgent; PO pushes the fast-forward after the RSI gate closes"
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-ALERT-ENGINE-RSI-SINGLEDIGIT", next_agent:null,
    note:"DEV-TEAM TICK 2026-06-15T10:1xZ — FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE PROMOTED review->done_verified. Rebuild LANDED (ops a4c676de: mcp-server image d63fd379 built 10:12:05Z, running healthy RestartCount=0; health 200 toolCount 163; daily_ohlcv 34,568; 12/12 peers up). LIVE GATE GREEN (router RAW docker inspect + named-vol sidecar): mcpServerCleanShutdown COUNT=0 => firstCleanShutdown NULL => bootstrap-null guard => restart-cadence tick SILENT despite 3 pre-fix deploy startups in the 4h window (the exact false page killed); pre-fix code fired >=2. Fire-path (>=2 crashes after bootstrap) proven by router-run bun test 10 pass. Self-healing: next graceful stop writes first clean-shutdown sentinel => full discrimination live once pre-fix rows age out. Bundle 2d494f77+ff874c82+bb6fca2b+routers(075be6d3/17d6b7cd). PUSH held (PO post-RSI-gate 2026-06-16). ACTIVE FOCUS returns to FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (review, behavioral gate fires 2026-06-16 briefing 01:00Z/scan 02:15Z). Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA-observe), BA-VN-MACRO-TOOLING (design). Ready lane EMPTY; active coding lane=0."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
