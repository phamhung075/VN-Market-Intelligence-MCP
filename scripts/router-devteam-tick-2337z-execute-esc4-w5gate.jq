# Router dev-team tick 23:37Z execute-step board update.
#  (a) ESC4-HEURISTIC-FIX-TAXBASIS-SOE ready[] -> in_progress[] (dispatched to agent-father bg a42e8913):
#      AC-1 pretax-basis non-op-income formula + AC-2 SOE-conglomerate (GVR/PHR/DPR/TRC/HRC) HIGH->INFO exception.
#  (b) The two W5 review rows: annotate deploy_gate_note — ops spawn DENIED by auto-mode classifier [Production Deploy].
#      Live mcp-server rebuild/deploy + CTG 96e36139 reingest against live named-volume market.db need EXPLICIT user
#      authorization; the generic CLAUDE.md OVERRIDE is not specific-enough intent. Rows stay BLOCKED-in-review, next_agent=ops.
#  (c) head: coordinating, active_task_id=ESC4, next_action records both the dispatch and the user-gate. WIP=1.
# Guard: error if ESC4 not in ready[]. Idempotent-ish: re-run errors (ESC4 already moved) -> safe (orch-apply aborts, no write).
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" -f scripts/router-devteam-tick-2337z-execute-esc4-w5gate.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.ready | map(select(type=="object" and .id=="ESC4-HEURISTIC-FIX-TAXBASIS-SOE"))[0]) as $esc4
| if $esc4 == null then error("ESC4-HEURISTIC-FIX-TAXBASIS-SOE not in ready[] -- refuse update") else . end
| .task_board.in_progress += [
    ($esc4 + {
      status: "IN_PROGRESS",
      owner: "agent-father",
      next_agent: "agent-father",
      dispatched_at: $now,
      dispatched_by: "router",
      dispatch_note: "[router 23:37Z tick] dispatched to agent-father (bg a42e8913) -- AC-1 pretax-basis non-op-income formula ((PBT-OpProfit)/PBT) + AC-2 SOE-conglomerate class (GVR/PHR/DPR/TRC/HRC) HIGH->INFO exception in bctc-analyst heuristic doc."
    })
  ]
| .task_board.ready |= map(select(type != "object" or .id != "ESC4-HEURISTIC-FIX-TAXBASIS-SOE"))
| .task_board.review |= map(
    if (type=="object" and (.id=="TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST" or .id=="W5-FU-CTG-REFINE-96e36139"))
    then . + {
      deploy_gate_note: "[router 2026-07-04T00:00Z] next_agent=ops but ops spawn DENIED by auto-mode permission classifier [Production Deploy]: rebuild+deploy live mcp-server + reingest CTG 96e36139-5dac-414d-8e4d-20a4725890d1 against live named-volume market.db need EXPLICIT user authorization (generic CLAUDE.md OVERRIDE 07-03 is insufficient intent). BLOCKED pending user clearing the deploy gate (run ops outside auto mode / approve the permission prompt). Code is done_verified; only deploy+operate remains."
    }
    else . end
  )
| .head += {
    status: "coordinating",
    active_task_id: "ESC4-HEURISTIC-FIX-TAXBASIS-SOE",
    next_agent: "agent-father",
    next_action: "dev-team tick 23:37Z: PO batch promoted 2. (1) ESC4-HEURISTIC-FIX-TAXBASIS-SOE dispatched to agent-father (bg, in_progress) -- awaiting completion for RAW-verify. (2) W5 deploy-gate to ops DENIED by auto-mode classifier [Production Deploy] -- needs explicit user authorization; W5 rows parked in review with deploy_gate_note. WIP=1.",
    updated_at: $now,
    updated_by: "router",
    note: "23:37Z tick execute: ESC4->in_progress (agent-father bg); W5 deploy user-gated (classifier denial)."
  }
