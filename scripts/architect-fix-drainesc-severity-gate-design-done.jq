# Architect step complete for FIX-DRAINESC-SEVERITY-RECURRENCE-GATE (SPRINT-S).
# In-place owner handoff architect -> pm (single row flows through the whole chain,
# unlike the ARCH-<x>/PM-<x> two-row split precedent used for FIX-BCTC-BANK-SUMMARY-MAPPING —
# PO/router minted ONE row here meant to carry owner reassignment across architect->pm->dev->qa).
# .head deliberately LEFT UNTOUCHED: dispatch note carries "SF-1 held by router across the chain"
# (router-held coordination lock spanning this whole multi-step chain) — router reconciles head
# on return, per the same precedent as SPIKE-BCTC-DISCOVER-PIPELINE-DEAD (2026-07-03) and the
# feedback_architect_self_flips_spike_board lesson (only self-close head when NO such hold is noted).
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" -f scripts/architect-fix-drainesc-severity-gate-design-done.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

(.task_board.in_progress | map(select(type=="object" and .id=="FIX-DRAINESC-SEVERITY-RECURRENCE-GATE"))[0]) as $t
| if $t == null then error("FIX-DRAINESC-SEVERITY-RECURRENCE-GATE not in in_progress[] -- refuse to hand off") else . end
| .task_board.in_progress |= (
    map(select(type != "object" or .id != "FIX-DRAINESC-SEVERITY-RECURRENCE-GATE"))
    + [
        ($t + {
          owner: "pm",
          next_agent: "pm",
          status: "IN_PROGRESS",
          architecture_brief: "docs/architecture-briefs/2026-07-04-drainesc-severity-recurrence-gate.md",
          handoff_ref: "docs/handoffs/TASK_FIX-DRAINESC-SEVERITY-RECURRENCE-GATE.md",
          dispatched_at: $now,
          dispatched_by: "architect",
          dispatch_note: (
            "[architect 2026-07-04] Design DONE. GATE-A severity floor (effective_severity = "
            + "row.severity authoritative — NOT max-of-both, that would re-escalate the shipped "
            + "ESC-4 AC-2 INFO downgrade; static ESC-id tier table is a fallback ONLY when "
            + "row.severity missing; floor=HIGH per SignalSeverityEnum orchStateSchema.ts:172). "
            + "GATE-B two-tier DEDUP: Tier-1 board-row-exists (REFLOW-<ticker>-<quarter>, self-healing "
            + "on TERMINAL_SET status flip, zero new state) PRIMARY; Tier-2 signals_processed exact-"
            + "context COUNT>=2 (read-only json_extract, zero schema change) SECONDARY bootstrap net. "
            + "Live-verified against real signals.db: MBB Q1-2026 ESC-2 (2 byte-identical rows, "
            + "REFLOW-MBB-Q1-2026 already open/BLOCKED) confirms Tier-1; GVR Q1-2026 ESC-4 (4 rows, "
            + "context KEYS DRIFT every cycle) DISPROVES a naive content-hash-only design — load-"
            + "bearing finding, see brief. Precise change points + jq filter + drain-signals.js CLI "
            + "subcommand snippet in the brief. pm: decompose into ONE atomic dev task (both files "
            + "land together, brief section 5) — files: docs/agents/dev-team/flow/drain-esc-dispatch.md + "
            + "scripts/agents-flow/drain-signals.js. Zone: cross-service. Dev-agent routing flagged "
            + "for pm's call (developer per zone-detect Tier-2, or dev-mcp-server per established "
            + "scripts/agents-flow/ ownership precedent, po-decisions.md)."
          )
        })
      ]
  )
| ._updated_at = $now
| ._updated_by = "architect"
