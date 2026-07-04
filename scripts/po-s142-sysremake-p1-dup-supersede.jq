# scripts/po-s142-sysremake-p1-dup-supersede.jq
# ─────────────────────────────────────────────────────────────────────────────
# CONVERGENCE (anti-churn) — supersede the coarse SYSREMAKE-P1* umbrella rows a
# prior PO tick (2026-07-04T06:37Z) minted for the SAME systemic-remake Phase-1
# work that po-s141's granular atomic tasks + direct detector-fix promotion now
# replace. Leaving both sets IS the churn-without-convergence anti-pattern this
# very sprint exists to kill, so converging to ONE authoritative set is mandatory
# Phase-1 work. Keep po-s141's set (router-directed: promoted + atomic +
# depends[]-sequenced, script/flow split); mark the SYSREMAKE overlaps CANCELLED.
#
# SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE is DELIBERATELY UNTOUCHED — it is the
# legit Phase-2 tracker (USER-GATED), out of Phase-1 scope.
#
# In-place field edits ONLY (status->CANCELLED + superseded_by/_note/_at); lane
# lengths byte-stable. Idempotent: guarded on status!=CANCELLED (re-run mutates 0).
# CANCELLED-in-backlog[] adds non-blocking coherence warnings (same class already
# present; swept by FIX-BACKLOG-TERMINAL-ROW-DRIFT-EVICT-BLIND).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-s142-sysremake-p1-dup-supersede.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# ─────────────────────────────────────────────────────────────────────────────

({
  "SYSREMAKE-P1A-DEVTEAM-RUNIDLE-PREFLIGHT":     ["P1-IDLE-DEVTEAM-PREFLIGHT-SCRIPT","P1-IDLE-DEVTEAM-FLOW-BRANCH"],
  "SYSREMAKE-P1B-AUDITOR-TIER-PROBE-GENERALIZE": ["P1-IDLE-AUDITOR-TIER23-SCRIPT","P1-IDLE-AUDITOR-CRON-WIRING"],
  "SYSREMAKE-P1C-AUDITOR-NOTEBOOK-APPEND-GATE":  ["P1-IDLE-AUDITOR-NOTEBOOK-GATE"],
  "SYSREMAKE-P1F-TOOLCOUNT-CRON-DRIFT-REGEN":    ["P1-DRIFT-NARRATIVE-NUMBER-POINTER","P1-DRIFT-PARITY-TEST-EXTEND","P1-DRIFT-QUARANTINE-FREEZE-FLAG"],
  "SYSREMAKE-P1DET-PROMOTE-4-DETECTOR-FIXES":    ["FIX-CONTEXT-BLOAT-HOOK-SETTLE-READ-DEBOUNCE","FU-AUDITOR-D4-SIGNAL-ID","FIX-SIGNALQUEUE-DUP-ID-GUARD","FIX-AUDITOR-B05-BCTC-FRESHNESS-LAYER-SPLIT"]
}) as $map
| .task_board.backlog = (.task_board.backlog | map(
    if (type=="object" and ($map[.id] != null) and (.status != "CANCELLED"))
    then . + {
      "status": "CANCELLED",
      "superseded_by": $map[.id],
      "superseded_at": $now,
      "superseded_by_agent": "po-s141-systemic-remake-phase1",
      "superseded_note": "Superseded by po-s141 granular Phase-1 atomic tasks (router-directed FULL Phase-1 execution 2026-07-04, brief §1). This coarse umbrella row minted prior tick 2026-07-04T06:37Z is replaced by the listed atomic task(s); the 4 named detector fixes were promoted DIRECTLY to ready[] (P1DET-PROMOTE routing task thereby satisfied). Convergence per the systemic-remake anti-churn mandate — do NOT re-action."
    }
    else . end))
| ._updated_at = $now
| ._updated_by = "po-s142-sysremake-dup-supersede"
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s142-sysremake-dup-supersede"
