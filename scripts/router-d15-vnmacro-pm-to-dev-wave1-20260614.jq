# Router dev-team dispatcher — VN-MACRO-TOOLING pm breakdown DONE (router RAW-verified) -> dev WAVE-1 fan-out.
# pm (a50089da, commit 983af548 — router RAW-verified 8 files explicit-path: orch-state.json + pm.md notebook +
#   6 handoff docs TASK_PROBE-1..4 / TASK_VMT-D-VPSFETCH / TASK_VMT-6-CREDIT-FLOW-EXTEND, all real on disk 5.4-9.8KB;
#   .head UNTOUCHED [still next_agent=pm]; signal_queue 0 refs in diff; KINHDICH done + ARCH-CRON IN_PROGRESS preserved)
#   decomposed the architect blueprint into 20 atomic tasks in active_sprints[VN-MACRO-TOOLING].tasks (5 waves).
# Probe-gate DAG RAW-verified vs architect blueprint: VMT-1b<-PROBE-1 (bloc_split only, VMT-1a ungated),
#   VMT-2<-PROBE-2, VMT-3b<-PROBE-3 (PMI VMT-3a ungated), VMT-4<-PROBE-3, VMT-5b<-PROBE-4 (interbank/OMO only, VMT-5a ungated).
#   WAVE-1 = exactly 6 zero-dep: PROBE-1..4 + VMT-D-VPSFETCH + VMT-6-CREDIT-FLOW-EXTEND.
# ROOT-CAUSE FIX (NEVER-guess-agent-type + fix-on-all): pm labeled the 4 probes owner="ops-vps-crawls" — that agent
#   type DOES NOT EXIST. Architect blueprint specified ops-vps-fetch (SSH recon diagnostician = exactly what a PROBE is:
#   document page structure/anti-bot/working-recipe; dev-vps-crawls is for IMPLEMENTING a scraper later). This write
#   corrects owner ops-vps-crawls -> ops-vps-fetch on ALL tasks carrying it (the 4 probes) at the board SSOT.
# This write (ONE atomic temp->rename): advance parent BA-VN-MACRO-TOOLING in in_progress[]
#   status architect-design-done -> pm-breakdown-done, next_agent pm -> dev; stamp pm_commit + pm_task_count +
#   pm_wave_plan + pm_handoff_dir + router_pm_reverify_verdict. Fix probe owner. Mark WAVE-1 6 tasks TODO->dispatched.
#   sprint.status PLANNING -> IN_PROGRESS. head -> active/next=dev.
# GUARD: refuse unless head.next_agent=="pm" AND BA-VN-MACRO-TOOLING in in_progress[] status=="architect-design-done" next_agent=="pm".
# Usage: jq --arg now "$NOW" -f scripts/router-d15-vnmacro-pm-to-dev-wave1-20260614.jq docs/data/orch/orch-state.json
def PARENT: "BA-VN-MACRO-TOOLING";
def SPRINT: "VN-MACRO-TOOLING";
def WAVE1: ["PROBE-1","PROBE-2","PROBE-3","PROBE-4","VMT-D-VPSFETCH","VMT-6-CREDIT-FLOW-EXTEND"];
($ARGS.named.now) as $now
| ([.task_board.in_progress[]? | select(type=="object" and ((.id // "")==PARENT))][0]) as $p
| if (.head.next_agent != "pm") then error("head.next_agent != pm (\(.head.next_agent)) — refuse")
  elif ($p == null) then error("BA-VN-MACRO-TOOLING not in in_progress[] — refuse")
  elif (($p.status // "") != "architect-design-done") then error("parent status != architect-design-done (\($p.status)) — refuse")
  elif (($p.next_agent // null) != "pm") then error("parent next_agent != pm (\($p.next_agent)) — refuse")
  else . end
# 1. advance parent task
| .task_board.in_progress = [
    .task_board.in_progress[] | if (type=="object" and ((.id // "")==PARENT))
      then (. + {
        status: "pm-breakdown-done",
        next_agent: "dev",
        pm_breakdown_done_at: $now,
        pm_commit: "983af548",
        pm_task_count: 20,
        pm_wave_plan: "WAVE-1 (6 zero-dep, dispatch now): PROBE-1..4 (ops-vps-fetch recon) + VMT-D-VPSFETCH (dev-macro-indicators Zone D vpsFetch.go, HARD prereq to all Zone A) + VMT-6-CREDIT-FLOW-EXTEND (dev-mcp-server Zone C, ships degraded is_estimate=true). WAVE-2 (after Zone D): VMT-1a/3a/5a (ungated) + VMT-2 (gated PROBE-2). WAVE-3 (after probes): VMT-1b/3b/4/5b (probe-gated sub-fields). WAVE-4 (after Zone A live): VMT-7a..e Zone B mcp-server thin proxy handlers. WAVE-5 FINAL: VMT-7-REGISTER (tool registration + gateway surface + skill switch-on acceptance).",
        pm_handoff_dir: "docs/handoffs/TASK_*.md (6 WAVE-1 handoffs: PROBE-1..4, VMT-D-VPSFETCH, VMT-6-CREDIT-FLOW-EXTEND)",
        router_pm_reverify_verdict: "RAW-RE-VERIFIED INDEPENDENTLY (not the pm badge): git show 983af548 --stat = 8 files explicit-path (orch-state.json + pm.md notebook + 6 TASK_*.md handoffs, all real on disk 5.4-9.8KB); .head UNTOUCHED (still next_agent=pm, router owns advancement); signal_queue 0 refs in diff; KINHDICH done + ARCH-CRON-SCHEDULER-RELIABILITY IN_PROGRESS both preserved. 20 atomic tasks in active_sprints[VN-MACRO-TOOLING].tasks. WAVE-1 = exactly 6 zero-dep. Probe-gate DAG matches architect blueprint exactly (VMT-1b<-PROBE-1 bloc_split-only / VMT-2<-PROBE-2 / VMT-3b+VMT-4<-PROBE-3, VMT-3a PMI ungated / VMT-5b<-PROBE-4 interbank-OMO-only, VMT-5a ungated). CAUGHT+FIXED: pm mislabeled probe owner=ops-vps-crawls (non-existent agent) -> corrected to ops-vps-fetch at board SSOT on all 4. READY for WAVE-1 dev fan-out."
      })
      else . end
  ]
# 2. mutate the VN-MACRO sprint: fix probe owner, mark WAVE-1 dispatched, sprint status
| .task_board.active_sprints = [
    .task_board.active_sprints[] | if (type=="object" and ((.id // "")==SPRINT))
      then (
        .status = "IN_PROGRESS"
        | .wave1_dispatched_at = $now
        | .tasks = [
            .tasks[]
            # ROOT-CAUSE FIX: non-existent agent ops-vps-crawls -> ops-vps-fetch (all probes carrying it)
            | (if ((.owner // "") == "ops-vps-crawls") then (.owner = "ops-vps-fetch") else . end)
            | (if ((.agent // "") == "ops-vps-crawls") then (.agent = "ops-vps-fetch") else . end)
            # mark WAVE-1 zero-dep tasks dispatched
            | (if ((.id // "") as $id | WAVE1 | index($id)) then (.status = "dispatched" | .dispatched_at = $now) else . end)
          ]
      )
      else . end
  ]
# 3. head -> next_agent=dev
| .head = {
    status: "active",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "BA-VN-MACRO-TOOLING",
    next_agent: "dev",
    note: "VN-MACRO-TOOLING pm breakdown DONE (a50089da, commit 983af548, router RAW-verified 8 files explicit-path: orch-state + pm notebook + 6 TASK_*.md handoffs; .head untouched; signal_queue clean; KINHDICH done + ARCH-CRON IN_PROGRESS preserved). 20 atomic tasks in active_sprints[VN-MACRO-TOOLING], 5 waves, probe-gate DAG verified vs architect blueprint. CAUGHT+FIXED pm mislabel: probe owner ops-vps-crawls (non-existent) -> ops-vps-fetch at SSOT. -> dev WAVE-1 fan-out (6 zero-dep, dispatched): PROBE-1..4 via ops-vps-fetch (1 agent, all 4 VPS recon probes — VN sources GEO-BLOCKED -> Vinahost VPS, HNX/TLS --cacert) + VMT-D-VPSFETCH via dev-macro-indicators (Zone D vpsFetch.go, VpsFetchPort domain port, FIRST hard prereq) + VMT-6-CREDIT-FLOW-EXTEND via dev-mcp-server (Zone C creditFlowTools.ts, ships degraded is_estimate=true honest, NO is_estimate removal). Constraints: fail-closed never fabricate; contract from LIVE payload not schema comment; per-series is_estimate honest; tsc/pnpm check BEFORE commit; commit explicit path only; do NOT touch .head (router owns) or KINHDICH/ARCH-CRON. WAVE-2/3 gated on Zone D + probe returns. ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15. KINHDICH-HOVER-ENRICH-FE done_verified. Commit explicit path only."
  }
