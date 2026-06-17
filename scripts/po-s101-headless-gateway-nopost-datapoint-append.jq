# po-s101-headless-gateway-nopost-datapoint-append.jq
#
# SINGLE-PASS in-place DATA-POINT append (NO new task, NO lane move):
#   Record one recurrence data-point on the EXISTING backlog row
#   ARCH-HEADLESS-GATEWAY-COWORK-NOPOST. The router RAW-probed the gateway
#   LIVE this tick (task_claim + send_telegram + get_macro_snapshot all
#   returned data -> gateway UP) and pre-classified the bctc-analyst
#   15:00Z "gateway tool not available" claim as the known FALSE
#   headless/cloud per-session-miss phantom of this exact epic.
#
# Triage action per router note = DEDUP into the existing epic: append the
# 15:00Z bctc-analyst data-point (+ the PO session's own concurrent
# call_tool-unavailable miss as corroborating same-class evidence) to a
# .data_points[] array on the row. Bump .recurrence_count. Do NOT mint a
# task, do NOT move a lane, do NOT touch the head, do NOT escalate.
#
# IDEMPOTENT: guarded by the data-point's .at timestamp — re-run appends 0.
# Initializes .data_points to [] if absent (row currently has no such field).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s101-headless-gateway-nopost-datapoint-append.jq \
#      docs/data/orch/orch-state.json
#   (atomic temp -> [ -s ] -> jq empty -> conservation -> rename;
#    commit orch-state by EXPLICIT PATH; PUSH HELD — PO out-of-band.)

def DP_AT: "2026-06-17T15:00:00Z";

def datapoint:
  {
    at: DP_AT,
    from: "bctc-analyst",
    recorded_by: "po-s101",
    recorded_at: $now,
    symptom: "c063 Step 0 failed: call_tool (MCP gateway) not available in agent session -> no downstream vn-market tools reachable; cycle fail-loud-exited.",
    router_verdict: "FALSE — gateway RAW-probed UP THIS tick (task_claim + send_telegram + get_macro_snapshot all returned LIVE data). Known headless/cloud per-session MCP-registration miss of THIS epic, NOT a real outage.",
    disposition: "DEDUP into this epic (data-point only). No new task. No ops spawn. No bctc-analyst re-dispatch (next legit cron 18:00Z; last_fired already 15:08:04Z). 15:00 off-market BCTC slot produced no analysis — benign for a fundamental batch (fail-loud working, no fabrication).",
    corroborating: "po triage agent in THIS SAME tick also hit `mcp__gateway__call_tool` not-available in its own background-spawned session (could not run read_telegram_reports / list_unresolved_reports) — SAME headless per-session-miss class, while the router's LIVE probe confirms the gateway is up. Two background agents, one missing registration each; gateway itself healthy. Reinforces the architect design ask: probe call_tool + RE-QUEUE the slot rather than claim-and-drop."
  };

(.task_board.backlog[] | select(.id == "ARCH-HEADLESS-GATEWAY-COWORK-NOPOST")) |=
  ( (.data_points //= [])
    | if any(.data_points[]; .at == DP_AT)
      then .                                   # already recorded -> idempotent no-op
      else .data_points += [datapoint]
           | .recurrence_count = ((.recurrence_count // 0) + 1)
           | .updated_at = $now
           | .last_recurrence_at = DP_AT
      end
  )
