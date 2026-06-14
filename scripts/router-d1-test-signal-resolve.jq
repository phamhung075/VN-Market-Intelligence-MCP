# Router signal hygiene: neutralize the D-1 live-verify TEST artifact left NEW in the live signal_queue.
# The ops D-1 gate (a65bfe98) deliberately fired a SIMULATED 15MB WAL escalation to prove the escalateFn
# path persists a signal — it PASSED — but left the row status=NEW. Live WAL is 528KB, so the "15.0 MB"
# claim is provably a test artifact, NOT a real checkpoint stall. If left NEW, the next dev-team Step-0a
# drain-signals would false-dispatch a P0 WAL crisis. Flip NEW->RESOLVED with audit annotation.
# GUARD: refuse unless the EXACT test id exists AND status==NEW AND type==WAL_ESCALATION (never resolve a
#        real future escalation — a genuine one would carry a different id/timestamp and a live WAL>10MB).
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b — router reconciles board/queue on pipeline forward).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-test-signal-resolve.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.signal_queue.rows | map(select(.id=="wal-escalation-1781422530317"))[0]) as $sig
| if $sig == null then error("test signal wal-escalation-1781422530317 not found — refuse")
  elif ($sig.status != "NEW") then error("signal already \($sig.status) (not NEW) — no-op refuse")
  elif ($sig.type != "WAL_ESCALATION") then error("id matched but type != WAL_ESCALATION — refuse")
  else . end
| .signal_queue.rows |= map(
    if .id=="wal-escalation-1781422530317" then
      . + {
        status: "RESOLVED",
        resolved_at: $now,
        resolved_by: "dev-team",
        resolution: "TEST ARTIFACT — D-1 live-verify gate (ops a65bfe98) fired a SIMULATED 15MB WAL escalation to prove escalateFn persists a signal atomically. Gate PASSED. Live WAL was 528KB at fire time, so the 15.0MB figure is synthetic, NOT a real checkpoint stall. Neutralized so Step-0a drain does not false-dispatch a P0. Follow-up defect (apps/mcp-server zone): D-1 escalation test must target a temp orch-state, never the live signal_queue."
      }
    else . end
  )
