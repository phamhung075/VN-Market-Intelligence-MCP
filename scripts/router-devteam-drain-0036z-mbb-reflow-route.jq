# Dev-team tick 00:07Z (fired 00:36Z) — Step 0a signal_queue drain outcome.
#  (a) Mark router-esc4-fu-drainesc-severity-gate-20260704T0016Z: NEW -> READ (drained; PO triages this tick).
#  (b) Append ONE repair_task_request (to=po) for the MBB batch-reflow — router SKIPPED the 5th Opus
#      esc-deep-dive (4th consecutive redispatch, BYTE-IDENTICAL data since 2026-06-07, root-caused as
#      stale extraction predating the FIX-BCTC-BANK-SUMMARY-MAPPING merge — an Opus rerun changes nothing).
#      DEDUP-first against W5-FU-CTG-REFINE (same class, same user-gated deploy).
# Guard: no-op-safe — if the esc4-fu row is absent/already READ, the map is a harmless identity.
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" -f scripts/router-devteam-drain-0036z-mbb-reflow-route.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
.signal_queue.rows |= map(
    if (type=="object" and .id=="router-esc4-fu-drainesc-severity-gate-20260704T0016Z" and .status=="NEW")
    then .status = "READ"
    else . end
  )
| .signal_queue.rows += [
    {
      id: "dt-escdispatch-mbb-batch-reflow-20260704T0036Z",
      ts: $now,
      from: "dev-team/esc-dispatch",
      to: "po",
      type: "repair_task_request",
      summary: "MBB Q1-2026 ESC-2 balance-sheet imbalance (14.9%, assets 666711 vs liab 567490) is the 4th consecutive esc-deep-dive redispatch (c074/c075/c076/this) with BYTE-IDENTICAL data since published 2026-06-07 — root-caused as STALE EXTRACTION (report predates FIX-BCTC-BANK-SUMMARY-MAPPING merge a46131cf/2cd9e105), NOT a fresh fundamentals event. Router SKIPPED the 5th Opus deep-dive (same diagnosis, zero new info). ACTION: batch reflow/re-refine bank reports published before 2026-07-01 onto the served DB. DEDUP-first: same class + same user-gated W5 live-deploy+reingest as W5-FU-CTG-REFINE-96e36139 (CTG total_assets=0). Consider generalizing W5 into a batch-reflow task (MBB+CTG+any pre-fix bank report), and gate bctc-analyst re-emission once a reflow task is queued (stops per-cycle ESC noise).",
      severity: "HIGH",
      status: "NEW",
      payload_ref: "docs/signals/processed/bctc-analyst-20260704T001900Z.json",
      source_task: "esc-deepdive:MBB:Q1-2026:ESC-2"
    }
  ]
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "dev-team/drain-0036z"
