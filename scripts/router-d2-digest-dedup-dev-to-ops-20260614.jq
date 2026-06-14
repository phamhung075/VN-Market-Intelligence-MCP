# Router dev-team dispatcher — advance FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP dev-impl-GREEN -> review/ops (targeted rebuild for new MCP tool).
# dev-mcp-server a8bc7d01 returned GREEN (commit ccbe43ec). Router RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge, BIDIRECTIONAL):
#   COMMIT HYGIENE: git show ccbe43ec --stat = EXACTLY 6 explicit files (isoWeek.ts new 188L, dedup test new 455L,
#     coordinationTools.ts +56 get_week_period tool, digest-predict/flow/main.md, tran-ngoc-bau/flow/main.md, cowork-team/spawn-fanout.md).
#     Concurrent dirty tree (bctc-analyst.md, coverage-state.json, cowork-schedule.json M; digest-predict session + 4 docs/signals ??)
#     NOT captured — verified via name-only grep = CLEAN.
#   GATES re-run locally by router (NOT relayed): bunx tsc --noEmit -> TSC_EXIT=0; bun test FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP.test.ts
#     -> 35 pass / 0 fail / 90 expect (257ms).
#   W24 CORRECTNESS (the off-by-one root cause): python3 date(2026,6,14).strftime('%G-W%V') = 2026-W24 INDEPENDENT crosscheck
#     matches the canonical helper getISOWeekPeriod (Sun 2026-06-14 = W24, NOT W25). Both divergent paths now derive one key.
#   GENERIC: helper getISOWeekPeriod + buildWeeklyPublishMarkerKey are SHARED (one canonical impl), get_week_period MCP tool exposes
#     it to every agent session -> applies across ALL guaranteed weekly slots (digest-sunday, tnb, ...), not just the one that doubled.
#   NO RE-POST: dev confirms recurrence-prevention only; no Telegram send in the fix path. 2026-06-14 digest already delivered (twice).
# This write (ONE atomic temp->rename): FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP in_progress[] -> review[]; status IN_PROGRESS->REVIEW;
#   next_agent dev-mcp-server->ops; records dev_impl_verdict + router_dev_reverify_verdict + ops_instructions (targeted rebuild so the
#   new get_week_period MCP tool + isoWeek domain service are live in the container the agents call; flow-doc gates read live).
#   head -> status=review/active=FIX-DIGEST-PREDICT/next_agent=ops. ARCH-CRON-SCHEDULER-RELIABILITY (passive Mon-gate) stays in_progress.
#   PARKED reaudit untouched. Concurrent dirty tree untouched.
# GUARD: refuse unless task in in_progress[] with status IN_PROGRESS and next_agent=="dev-mcp-server".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — dev-green -> ops deploy/rebuild gate).
# Usage: jq --arg now "$NOW" -f scripts/router-d2-digest-dedup-dev-to-ops-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP")][0]) as $t
| if $t == null then error("FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("status != IN_PROGRESS (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "dev-mcp-server") then error("next_agent != dev-mcp-server (\($t.next_agent)) — refuse")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP") | not)]
| .task_board.review = ((.task_board.review // []) + [
    ($t + {
      status: "REVIEW",
      next_agent: "ops",
      dev_impl_done_at: $now,
      dev_impl_commit: "ccbe43ec",
      dev_impl_verdict: "GREEN (dev-mcp-server a8bc7d01, commit ccbe43ec): canonical isoWeek.ts (getISOWeekPeriod + buildWeeklyPublishMarkerKey) + get_week_period MCP tool in coordinationTools.ts + PUBLISHED-MARKER-GATE rewritten in digest-predict & tran-ngoc-bau flows to use the period date-RANGE key (generic_mandate) + spawn-fanout weekly-slot note. tsc 0; 35/35 tests; Sun 2026-06-14=W24.",
      router_dev_reverified_at: $now,
      router_dev_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the dev badge). git show ccbe43ec --stat = exactly 6 explicit files; name-only grep confirms NO concurrent-agent file (bctc-analyst/coverage-state/cowork-schedule/docs-signals) captured. Router re-ran locally: bunx tsc --noEmit TSC_EXIT=0; bun test FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP.test.ts 35 pass/0 fail/90 expect. W24 root cause: python3 date(2026,6,14).strftime('%G-W%V')=2026-W24 INDEPENDENT crosscheck matches canonical helper (off-by-one Sunday-boundary defeated). GENERIC: shared helper + get_week_period tool applies to ALL guaranteed weekly slots; period-RANGE key makes last_fired staleness irrelevant as a dedup vector. No re-post (recurrence-prevention only).",
      ops_instructions: "DEPLOY GATE — targeted rebuild, then hand to qa. TARGETED REBUILD (the new isoWeek.ts domain service + get_week_period MCP tool are runtime code agents call at session-init): cd repo root && docker compose build --no-cache mcp-server && docker compose up -d --no-deps --force-recreate mcp-server ; then docker ps -a to confirm all peers Up/healthy (NEVER docker compose down — rebuild-recreate-destroys-peers). Verify: (1) image ID changed (docker inspect); (2) no 'Cannot convert a symbol to a string' Bun-JIT line in startup logs; (3) the new tool is live — call_tool(server='vn-market', tool='get_week_period', arguments={ date:'2026-06-14T13:47:00Z' }) returns weekLabel '2026-W24' (NOT W25) with period start/end — RAW-verify this return. The 3 flow-doc edits (digest-predict, tran-ngoc-bau, spawn-fanout) need NO rebuild (fleet-cron reads them live). Commit nothing except (if needed) your notebook by explicit path — concurrent agent dirty tree must NOT be captured. RETURN: image id, peer health count, raw get_week_period return.",
      ops_dispatched_at: $now
    })
  ])
| .head = {
    status: "review",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP",
    next_agent: "ops",
    note: "FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP dev-impl GREEN (commit ccbe43ec) + router RAW-re-verified INDEPENDENTLY (git show 6 explicit files clean; tsc 0; 35/35 tests; Sun 2026-06-14=W24 via python crosscheck; canonical shared helper + get_week_period tool = GENERIC across ALL weekly slots; period-range key defeats last_fired staleness; no re-post). -> ops: TARGETED rebuild mcp-server for the new isoWeek service + get_week_period tool (flow-doc gates read live, no rebuild), all peers Up, no down; RAW-verify get_week_period returns 2026-W24. -> qa LIVE gate -> done_verified. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15 G1/G2/G3. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 same-zone. Commit explicit path only."
  }
