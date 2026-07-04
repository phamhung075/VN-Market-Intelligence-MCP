# Router Step-3 execute: FIX-DRAINESC-SEVERITY-RECURRENCE-GATE ready[] -> in_progress[] (SPRINT-S).
# PO minted this in ready[] (dev-team :07 tick 2026-07-04); WIP=0, non-deploy-gated -> dispatch architect (bg).
# Cures the recurring per-cycle Opus esc-deep-dive waste (MBB fired 4x with byte-identical data).
# Sets .head in_progress/next_agent=architect so pipeline-resume is unambiguous. SF-1 held by router across chain.
# Guard: error if not in ready[] (idempotent — re-run after promote errors, orch-apply aborts, no write).
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" -f scripts/router-devteam-promote-drainesc-inprogress-20260704.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.ready | map(select(type=="object" and .id=="FIX-DRAINESC-SEVERITY-RECURRENCE-GATE"))[0]) as $t
| if $t == null then error("FIX-DRAINESC-SEVERITY-RECURRENCE-GATE not in ready[] -- refuse to promote") else . end
| .task_board.in_progress += [
    ($t + {
      status: "IN_PROGRESS",
      owner: "architect",
      next_agent: "architect",
      dispatched_at: $now,
      dispatched_by: "router",
      dispatch_note: "[router :07 tick 2026-07-04] SPRINT-S dispatched to architect (bg). Design 2 gates in drain-esc-dispatch.md BETWEEN Step 2 (mutex) and Step 3 (spawn): GATE-A severity floor (effective_severity = row.severity or max tier across all_esc_fired; < HIGH -> no Opus, mark row terminal, release guard_key); GATE-B known-root DEDUP (OPEN board task for {ticker,quarter} e.g. REFLOW-<ticker>-<quarter> OR semantic content-fp sha256(ticker+quarter+trigger_id+context) seen N>=2 -> route to reflow, skip Opus). Architect decides GATE-B state location (board-row-exists check [cheapest] vs content-fp counter in drain-signals.js). MANDATE: no ticker hardcode; never suppress a genuine FRESH high-severity finding. Files: docs/agents/dev-team/flow/drain-esc-dispatch.md + scripts/agents-flow/drain-signals.js. Chain: architect -> pm -> dev -> qa."
    })
  ]
| .task_board.ready |= map(select(type != "object" or .id != "FIX-DRAINESC-SEVERITY-RECURRENCE-GATE"))
| .head = {
    status: "in_progress",
    active_task_id: "FIX-DRAINESC-SEVERITY-RECURRENCE-GATE",
    next_agent: "architect",
    next_action: "SPRINT-S FIX-DRAINESC-SEVERITY-RECURRENCE-GATE dispatched to architect (bg) at :07 tick. Awaiting architect blueprint -> pm decompose -> dev implement -> qa. Cures recurring per-cycle Opus esc-deep-dive waste (MBB 4x byte-identical). SF-1 held by router across the chain; concurrent dev-team cron ticks SKIP (single-flight).",
    updated_at: $now,
    updated_by: "router",
    note: "00:45Z: FIX-DRAINESC ready->in_progress, architect dispatched. WIP=1. Chain driven by router via completion notifications."
  }
