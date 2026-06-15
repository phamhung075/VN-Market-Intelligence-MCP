# Router dev-team tick 2026-06-15T10:0xZ — move FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE
# in_progress -> review on dev-mcp-server return (agentId a1bcfc7e — bootstrap guard landed).
# Code DoD met + tests REAL-green (router ran bun test); LIVE gate PENDING rebuild.
#
# ROUTER RAW VERIFY (git + code + test, NOT a relayed badge):
#   * 3-commit bundle: 2d494f77 (core clean-shutdown-sentinel discriminator),
#     ff874c82 (bootstrap guard — silent on pre-fix history), bb6fca2b (docs/orch).
#   * ff874c82 git show --stat = EXACTLY 2 code files (restartCadenceAlertJob.ts +72/-? ,
#     test +146) — no -A sweep, no foreign file, no secret.
#   * GUARD CODE RAW-READ (restartCadenceAlertJob.ts L149-214): firstCleanShutdown =
#     MIN(started_at) of mcpServerCleanShutdown rows; NULL => return {restartCount:0,
#     alertSent:false} (silent on pre-fix history); per-gap skip when prev<firstCleanShutdown.
#     Steady-state >=2-crash paging unchanged. Generic — no hardcoded timestamps/allowlists.
#   * bun test FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts => 10 pass / 0 fail / 33 expect()
#     (router-run). 2 new bootstrap tests at L129/L147 = exact defect cases.
#
# MIGRATION-BOUNDARY DEFECT (router caught on the prior return, now CLOSED): the pre-fix
#   historical mcpServerStartup rows (05:35/08:02/08:42) have no clean-shutdown predecessor,
#   so the FIRST cut would have fired CRASH-RESTART on the fix's OWN rollout for ~2.5h until
#   they age out — reproducing the exact false page. Bootstrap-null guard makes rollout SILENT.
#
# REBUILD_REQUIRED: YES — mcp-server ONLY (both changed files live in apps/mcp-server/:
#   restartCadenceAlertJob.ts + composition-root.ts shutdown handler). Force-recreate only,
#   NEVER docker compose down (named-vol market.db). Verify peers + DB rows post-rebuild.
#
# LIVE GATE (router RAW-verifies AFTER rebuild): firstCleanShutdown stays NULL immediately
#   post-deploy (the force-recreate SIGTERMs the OLD container which has no handler; the new
#   handler only writes a sentinel on the NEXT graceful stop) => the :15/:45 tick MUST be
#   SILENT (no CRASH-RESTART WORK page) even with pre-fix startups still in the 4h window.
#   Confirm via docker exec sqlite: COUNT(mcpServerCleanShutdown)=0 => bootstrap-null path
#   active => silence is BY THE GUARD not by luck. Steady-state >=2-crash fire proven by the
#   real-green unit tests. Then review -> done_verified.
#
# GUARD: refuse unless task in in_progress[] AND not already in review[].
# CONSERVATION: total task count UNCHANGED (pure move in_progress->review).
# Usage: jq --arg now "$NOW" -f scripts/router-d62-mcp-restart-alert-to-review-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in in_progress[] — refuse")
  elif ([.task_board.review[]? | select(.id==$tid)]|length>0) then error("already in review[] — refuse")
  else . end
| .task_board.in_progress = [ .task_board.in_progress[]? | select(.id!=$tid) ]
| .task_board.review = (.task_board.review + [ $t + {
      status:"REVIEW",
      review_entered_ts:$now,
      fix_commits:["2d494f77","ff874c82"],
      docs_commit:"bb6fca2b",
      root_cause:"restartCadenceAlertJob counted ALL mcpServerStartup rows in a 4h window and fired at count>=2 with ZERO deploy-vs-crash discriminator => paged on every force-recreate deploy (3 healthy deploys today: 05:35/08:02/08:42, RestartCount=0). Fix = clean-shutdown sentinel (composition-root SIGTERM handler writes mcpServerCleanShutdown before closeDb; crash skips it) + bootstrap guard (firstCleanShutdown NULL => silent; skip gaps whose predecessor pre-dates firstCleanShutdown).",
      tests_green:"router-run bun test FIX-MCP-CRASH-LOOP-A-restart-cadence.test.ts => 10 pass / 0 fail / 33 expect(); 2 new bootstrap cases L129/L147; tsc --noEmit clean (dev)",
      commit_hygiene_verified:"router git show --stat ff874c82 = 2 code files (restartCadenceAlertJob.ts + test), +181/-37, no -A sweep/foreign/secret; 2d494f77 = 3 files incl composition-root.ts; bb6fca2b = docs/orch separate",
      migration_boundary_defect:"CLOSED — router caught on prior return that pre-fix historical startups (no clean-shutdown predecessor) would fire CRASH-RESTART on the fix's OWN rollout for ~2.5h; bootstrap-null guard (ff874c82) makes rollout silent until first graceful stop records a sentinel",
      rebuild_required:true,
      rebuild_scope:"mcp-server ONLY — both changed files (restartCadenceAlertJob.ts + composition-root.ts shutdown handler) live in apps/mcp-server/. Force-recreate only, NEVER down (named-vol market.db). Verify peers + DB rows.",
      pending_live_gate:"AFTER rebuild: firstCleanShutdown stays NULL post-deploy (old container SIGTERMed has no handler; new handler writes sentinel only on NEXT graceful stop) => :15/:45 tick MUST be SILENT (no CRASH-RESTART WORK page) with pre-fix startups still in window. Confirm docker exec sqlite COUNT(mcpServerCleanShutdown)=0 => bootstrap-null path active. Then review->done_verified.",
      push_disposition:"HOLD — bundles with the held RSI/MA5 commits; PO pushes the fast-forward after the FIX-ALERT-ENGINE-RSI-SINGLEDIGIT behavioral gate closes 2026-06-16"
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"ops",
    rebuild_required:true,
    note:"DEV-TEAM TICK 2026-06-15T10:0xZ — FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE dev-mcp-server RETURNED (a1bcfc7e bootstrap guard), moved in_progress->review. Bundle 2d494f77 (core sentinel discriminator) + ff874c82 (bootstrap guard, silent on pre-fix history) + bb6fca2b (docs). Router RAW: ff874c82 = 2 code files no -A/secret; guard code reads firstCleanShutdown=MIN(clean-shutdown), NULL=>silent, skip prev<firstCleanShutdown — generic no hardcode; bun test 10 pass/0 fail (router-run). Migration-boundary defect (would have re-fired the false page on the fix's own rollout) CLOSED by the bootstrap-null guard. REBUILD_REQUIRED=YES mcp-server ONLY (force-recreate, NEVER down) — router dispatches ops. LIVE GATE after rebuild: firstCleanShutdown stays NULL post-deploy => :15/:45 tick SILENT (no CRASH-RESTART page) with pre-fix startups still in window; confirm docker exec sqlite COUNT(mcpServerCleanShutdown)=0 => then review->done_verified. PUSH held (bundle, PO post-RSI-gate 2026-06-16). PARALLEL: FIX-ALERT-ENGINE-RSI-SINGLEDIGIT in review (behavioral gate 2026-06-16 briefing 01:00Z/scan 02:15Z). Holds: ARCH-CRON-SCHEDULER-RELIABILITY (QA-observe), BA-VN-MACRO-TOOLING (design)."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
