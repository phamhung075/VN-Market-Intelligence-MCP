# Router dev-team dispatcher — advance FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP ops-deploy-GREEN -> qa (FINAL LIVE gate).
# ops ac50a7c5 returned GREEN. Router RAW-RE-VERIFIED INDEPENDENTLY (not the ops badge, BIDIRECTIONAL):
#   IMAGE CHANGE: docker inspect mcp-server-1 = sha256:8a842a13a51d (was 674f872db96d) — rebuilt. docker ps: mcp-server Up
#     About a minute (healthy).
#   PEERS INTACT: docker ps -a = 12 containers, ALL Up/healthy, ZERO Exited/Restarting/unhealthy -> no peer destroyed
#     (rebuild-recreate-destroys-peers avoided; the earlier refine-flow "13" included a transient — decisive check is ps -a
#     showing nothing stopped). Bun-JIT 'Cannot convert a symbol to a string' ABSENT (ops + mcp-server healthy not 500).
#   TOOL LIVE (decisive, router probed the GATEWAY directly — not the ops relay): get_week_period{date:2026-06-14T13:47:00Z} ->
#     {weekLabel:"2026-W24", periodStart:"2026-06-08", periodEnd:"2026-06-14", periodKey:"2026-06-08/2026-06-14", weekNumber:24}.
#     The W25 off-by-one is GONE and the key is a date-RANGE (periodKey) -> last_fired staleness is no longer a dedup vector;
#     both divergent dispatch paths now derive the SAME periodKey for the calendar week. GENERIC across ALL weekly slots.
# This write (ONE atomic temp->rename): FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP review[] -> qa[]; status REVIEW->QA; next_agent ops->qa;
#   records ops_deploy_verdict + router_live_verdict + qa_instructions. head -> status=qa/active=FIX-DIGEST-PREDICT/next_agent=qa.
#   umbrella ARCH-CRON-SCHEDULER-RELIABILITY stays in_progress (passive Mon-gate). PARKED reaudit untouched. Dirty tree untouched.
# GUARD: refuse unless task in review[] with status REVIEW and next_agent=="ops".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — ops-green advance to qa LIVE gate).
# Usage: jq --arg now "$NOW" -f scripts/router-d2-digest-dedup-ops-to-qa-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP")][0]) as $t
| if $t == null then error("FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("status != REVIEW (\($t.status)) — refuse")
  elif (($t.next_agent // null) != "ops") then error("next_agent != ops (\($t.next_agent)) — refuse")
  else . end
| .task_board.review = [$rv[] | select((type=="object" and .id=="FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP") | not)]
| .task_board.qa = ((.task_board.qa // []) + [
    ($t + {
      status: "QA",
      next_agent: "qa",
      ops_deployed_at: $now,
      ops_deploy_verdict: "GREEN (ops ac50a7c5): targeted build --no-cache mcp-server + up -d --no-deps --force-recreate; image 674f872db96d->8a842a13a51d; 12 peers Up/healthy (no teardown); Bun-JIT line absent; get_week_period live returns 2026-W24 periodKey 2026-06-08/2026-06-14.",
      router_live_verified_at: $now,
      router_live_verified_by: "dev-team",
      router_live_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the ops badge). docker inspect mcp-server-1=sha256:8a842a13a51d (was 674f872db96d), Up ~1min healthy. docker ps -a=12 containers ALL Up/healthy, ZERO Exited/Restarting -> no peer destroyed. Router probed GATEWAY get_week_period{date:2026-06-14T13:47:00Z} DIRECTLY -> weekLabel 2026-W24, periodKey 2026-06-08/2026-06-14, weekNumber 24 (W25 off-by-one GONE; date-RANGE key makes last_fired staleness a non-vector; both dispatch paths derive the SAME periodKey). GENERIC across ALL guaranteed weekly slots (shared helper + get_week_period tool). Recurrence-prevention only — no re-post.",
      qa_instructions: "FINAL LIVE GATE — gate-keeper, write Task Report, never accept a badge. Re-confirm INDEPENDENTLY: (1) git show ccbe43ec --stat = exactly 6 explicit files (isoWeek.ts new, FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP.test.ts new, coordinationTools.ts +get_week_period, digest-predict/flow/main.md, tran-ngoc-bau/flow/main.md, cowork-team/spawn-fanout.md) AND no concurrent-agent file (bctc-analyst/coverage-state/cowork-schedule/docs-signals) captured; (2) re-run tests: cd apps/mcp-server && bunx tsc --noEmit (0) + bun test src/__tests__/FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP.test.ts (expect 35/0) — and read the W24 RCA assertion + an adjacent week-boundary Sunday case to confirm not a tautology; (3) LIVE TOOL proof against the rebuilt container: call_tool get_week_period{date:'2026-06-14T13:47:00Z'} returns weekLabel '2026-W24' + periodKey '2026-06-08/2026-06-14' (NOT W25) AND a second probe at the divergent CLI time '2026-06-14T13:52:00Z' returns the SAME periodKey (proves both paths converge -> dedup holds); (4) GENERIC check: read docs/agents/digest-predict/flow/main.md + tran-ngoc-bau/flow/main.md PUBLISHED-MARKER GATE — confirm the marker task_id keys on periodKey (date-range) NOT a derived week label, so the fix covers EVERY weekly slot not just digest-sunday; (5) confirm NO re-post: the 2026-06-14 digest was already delivered twice — verify the fix path performs no Telegram send (recurrence-prevention only). On qa-APPROVED -> router RAW-confirms -> promote done_verified. Commit Task Report by EXPLICIT PATH only (concurrent agent dirty tree: bctc-analyst.md, coverage-state.json, cowork-schedule.json, docs/signals/*.json — must NOT be captured).",
      ops_verified: $now
    })
  ])
| .head = {
    status: "qa",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP",
    next_agent: "qa",
    note: "FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP ops deploy GREEN + router RAW-re-verified LIVE (independent, not the ops badge): image 8a842a13a51d (was 674f872db96d), 12 peers all healthy (docker ps -a zero Exited -> no peer destroyed), gateway get_week_period -> 2026-W24 periodKey 2026-06-08/2026-06-14 (W25 off-by-one gone, date-range key defeats last_fired staleness). -> qa FINAL LIVE gate + Task Report (re-run 35/35, dual-time periodKey-convergence probe 13:47Z vs 13:52Z, generic marker-key check across weekly slots, no-re-post). qa-APPROVED -> done_verified. Umbrella ARCH-CRON-SCHEDULER-RELIABILITY held Mon 2026-06-15 G1/G2/G3. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 same-zone. Commit explicit path only."
  }
