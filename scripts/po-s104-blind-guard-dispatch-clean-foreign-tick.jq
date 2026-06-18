# po-s104-blind-guard-dispatch-clean-foreign-tick.jq
#
# Single-pass dev-team :07-tick triage (2026-06-18T0731): dispatch the confirmed
# gateway-blind FABRICATION-class guard + fill the second WIP slot with the no-contention
# P3 CLEAN, hold the contending second agents-architect task.
#
# Mutations (all atomic, idempotent):
#   M1 MINT  FIX-COWORK-BLIND-SESSION-GUARD -> in_progress[] (status=IN_PROGRESS,
#            owner=agents-architect, next_agent=agent-father, zone=docs/agents/cowork-team/flow/)
#            — confirmed-live fabrication bug (5 fake briefs + 62 fake-stamped tickers 2026-06-18),
#            no fix in any board array, fully-specced handoff exists. Highest leverage. Dispatch now.
#            Skipped if id already present in ANY board array.
#   M2 DISPATCH CLEAN-FOREIGN-FLOW-DOC-PARAM-CODE-DRIFT ready[] -> in_progress[]
#            (status=IN_PROGRESS, dispatch stamp). dev-mcp-server owner — NO contention with
#            agents-architect; fills WIP slot 2. Skipped if already out of ready[].
#   M3 HOLD  DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER stays in ready[] (agents-architect
#            contention with M1 — do not run two agents-architect tasks concurrently). No mutation.
#   M4 RESOLVE signal_queue row po-20260618-cowork-blind-session-guard READ->RESOLVED
#            (the escalation is now actioned via M1 dispatch). Idempotent (status guard).
#   M5 HEAD  top-level .head -> active(FIX-COWORK-BLIND-SESSION-GUARD, agents-architect)
#            ONLY if head idle (active_task_id==null) AND M1 minted. Idempotent.
#
# Harness (caller): atomic temp -> [ -s ] -> jq empty -> CONSERVATION
#   (in_progress +2, ready -1, backlog/review/done/done_verified byte-stable, total +1)
#   -> PLACEMENT (both tasks in in_progress with IN_PROGRESS; gatherer still in ready)
#   -> IDEMPOTENCY (re-run delta 0) -> rename. Commit orch-state by EXPLICIT PATH. PUSH HELD.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s104-blind-guard-dispatch-clean-foreign-tick.jq \
#      docs/data/orch/orch-state.json

def all_ids:
  [ (.task_board | to_entries[] | select(.value | type=="array") | .value[]
      | (if type=="object" then .id else . end)) ]
  | map(select(. != null));

def blind_id: "FIX-COWORK-BLIND-SESSION-GUARD";
def clean_id: "CLEAN-FOREIGN-FLOW-DOC-PARAM-CODE-DRIFT";
def gatherer_id: "DESIGN-GATHERER-DOUBLEFIRE-DEDUP-CLUSTER";
def sig_id: "po-20260618-cowork-blind-session-guard";

. as $root
| ($root | all_ids) as $ids
| (($ids | index(blind_id)) == null) as $do_mint
| (($root.task_board.ready | map(.id) | index(clean_id)) != null) as $do_dispatch_clean

# M1 — mint blind-guard directly into in_progress[]
| (if $do_mint then
    .task_board.in_progress += [{
      id: blind_id,
      type: "FIX",
      priority: "HIGH",
      status: "IN_PROGRESS",
      route_to: "agents-architect",
      owner: "agents-architect",
      next_agent: "agent-father",
      zone: "docs/agents/cowork-team/flow/",
      title: "Gateway-blind cowork dispatcher FABRICATION guard — refuse to spawn data agents while .mcp.json mcpServers=={}",
      desc: "CONFIRMED live 2026-06-18: a blind news-scout local-spawn wrote fake 06-18 sentiment into 5 briefs + fake-stamped coverage-state for 62 tickers (PO reverted+quarantined). The */15 cowork master dispatcher (docs/agents/cowork-team/flow/main.md -> spawn-fanout.md) locally Agent-spawns data agents; when .mcp.json mcpServers=={} the subagents do NOT inherit mcp__gateway__call_tool -> they no-op or FABRICATE served data. Add a preflight blind-detection guard (jq .mcpServers|length==0) BEFORE slot matching: when blind, do NOT spawn data-producing slots, defer backstopped slots to cloud RemoteTriggers with a logged skip, log non-backstopped slots (news-scout-market, market-watcher-market, alert-commander-market) as undeliverable-while-blind in telemetry errors[], emit ONE work-channel summary per tick. Design owner=agents-architect; implement via agent-father (Agent .md factory rule — never edit agent/flow .md directly).",
      acceptance: "Read-verified (not green-tick): in a blind session NO data agent spawned; work channel gets ONE summary; undeliverable slots land in telemetry errors[]; in a wired session the guard is a no-op. Backstop-coverage from docs/data/cowork-schedule.json .slots[].backstop — never hardcode the slot list.",
      placement: "New sub-flow docs/agents/cowork-team/flow/blind-guard.md wired as Step 0c in main.md before match-slots.md; re-enforced in spawn-fanout.md Step 5.",
      handoff_path: "docs/handoffs/FIX-COWORK-BLIND-SESSION-GUARD-2026-06-18.md",
      user_action_ref: "docs/handoffs/GATEWAY-BLIND-USER-ACTION-2026-06-18.md",
      memory_ref: ["feedback_local_cowork_subagents_gateway_blind","feedback_no_fake_data_real_fetch","feedback_agent_md_factory"],
      size: "S",
      source: "po dev-team tick 2026-06-18T0731Z — own HIGH escalation signal po-20260618-cowork-blind-session-guard; WIP=0 gave room; HIGH>MEDIUM so dispatched ahead of DESIGN-GATHERER (same owner, held to avoid concurrent agents-architect contention)",
      created_at: $now,
      created_by: "po",
      dispatched_at: $now,
      dispatched_by: "po"
    }]
  else . end)

# M2 — dispatch CLEAN-FOREIGN ready[] -> in_progress[]
| (if $do_dispatch_clean then
    ( ($root.task_board.ready | map(.id) | index(clean_id)) ) as $ix
    | .task_board.ready[$ix] as $row
    | .task_board.in_progress += [ $row + {status:"IN_PROGRESS", dispatched_at:$now, dispatched_by:"po"} ]
    | .task_board.ready |= map(select(.id != clean_id))
  else . end)

# M4 — resolve the originating signal row
| (if (.signal_queue.rows? != null) then
    .signal_queue.rows |= map(
      if (.id == sig_id and .status != "RESOLVED")
      then . + {status:"RESOLVED", resolved_at:$now, resolved_by:"po",
                resolution:"actioned — FIX-COWORK-BLIND-SESSION-GUARD dispatched to agents-architect in_progress this tick"}
      else . end)
  else . end)

# M5 — point canonical head at the dispatched blind-guard (only if idle + minted)
| (if ($do_mint and (.head.active_task_id == null)) then
    .head = {
      status: "active",
      updated_at: $now,
      updated_by: "po",
      active_task_id: blind_id,
      next_agent: "agents-architect",
      note: ("DISPATCH FIX-COWORK-BLIND-SESSION-GUARD (HIGH, agents-architect design -> agent-father impl) — confirmed-live gateway-blind fabrication guard. CLEAN-FOREIGN-FLOW also dispatched (dev-mcp-server, WIP slot 2). DESIGN-GATHERER held in ready[] (same-owner contention).")
    }
  else . end)

| .updated_at = $now
| .updated_by = "po"
