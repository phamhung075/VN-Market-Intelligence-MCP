# po-s144-tnb-c109-triage.jq — single-pass PLAN-ONLY triage of the tnb-audit c109 handoff.
# Three idempotent mutations, all confined to .task_board.backlog[]:
#   M1 ANNOTATE-IN-PLACE  SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING  (chef-eod dormancy recurrence datum)
#   M2 ESCALATE-IN-PLACE  FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK (fold F-MCP-SUBAGENT + F-TNB-DUAL-DISPATCH, 14th+ cycle)
#   M3 ID-GUARDED MINT    FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE -> backlog[] (PLAN-ONLY)
# All guards make re-run a no-op: M1/M2 marker-guarded (has(...)), M3 id-guarded across all lanes.
# Reusable pattern: "triage a supervisor audit handoff plan-only — annotate the already-tracked
#   umbrella + recurrence rows, escalate a stale recurring-bug umbrella with folded manifestations,
#   mint only the genuinely-new finding as a backlog investigation row." Run via scripts/orch-apply.sh.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s144-tnb-c109-triage.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def all_ids:
  [ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
    .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]?
    | if type=="object" then .id else . end ];

($now) as $now
| (all_ids) as $ids

# M1 + M2: in-place annotations on existing backlog rows
| .task_board.backlog |= (map(
    if (type=="object" and .id=="SPIKE-COWORK-GUARANTEED-SLOT-SUPERSEDE-WIRING") then
      (if has("tnb_recurrence") then . else
        . + { tnb_recurrence: {
          at: $now,
          by: "po-tnb-c109-triage",
          datum: "F-CHEF-EOD-DORMANT-0714 (HIGH): chef-eod guaranteed slot did NOT fire 2026-07-14 (last_fired stuck 2026-07-13T08:55:03Z, cron 45 8 * * 1-5). RAW-verified in docs/data/cowork-schedule.json: chef-eod _superseded_by=cowork-dispatcher (same undeliverable-supersede symptom this SPIKE tracks). NARROWING vs 07-09/07-10 3-slot miss: today ONLY chef-eod missed — chef-morning (05:26Z) + chef-evening (19:48Z) both fired. chef-eod carries depends_on=foreignFlowAlertJob:08:13:UTC (24-min upstream gate) — plausible dependency-chain stall, ops/dev diagnosis not TNB's. Delivery-side mitigation OPS-COWORK-GUARANTEED-SLOT-INSTALL is in review[] (launchd firer) — this SPIKE remains the root-cause investigation.",
          source: "docs/handoffs/tnb-audit-latest.md#F-CHEF-EOD-DORMANT-0714"
        } }
      end)
    elif (type=="object" and .id=="FIX-COWORK-FLOWS-GATEWAY-BLIND-BRIDGE-FALLBACK") then
      (if has("tnb_escalation") then . else
        . + { tnb_escalation: {
          at: $now,
          by: "po-tnb-c109-triage",
          recurrence: "14th+ consecutive tnb-audit cycle (c97..c109) spawned MCP-blind; c107/c108/c109 handoffs all flag it. Per standing recurring-bug-2+ policy this is now blocking-grade.",
          design_vs_defect: "REAL DEFECT, not expected-by-design. Correcting the handoff premise: tran-ngoc-bau/init.md grants tools_packages=[bootstrap, tran-ngoc-bau-full]; tran-ngoc-bau.md declares 'Access level: FULL — all vn-market tools'. So full MCP is granted BY DESIGN; the zero-MCP runtime is a provisioning/spawn-binding failure. Second c109 session confirmed the whole MCP surface (incl mcp__semble__search) was unbound, not just vn-market — a session-level MCP-binding failure, which is exactly why the curl-bypass (does not depend on MCP-client handshake) is the right fallback. Root cause already root-caused (SPIKE-GATEWAY-BLIND-CLI-HANDSHAKE, DONE); the remediation script scripts/agents-flow/mcp-call.sh ALREADY EXISTS ON DISK but is UNWIRED into tnb-audit's flow (fix never shipped != fix keeps failing).",
          folded_findings: [
            "F-MCP-SUBAGENT-SYSTEMIC (HIGH): wire scripts/agents-flow/mcp-call.sh curl-bypass into tnb-audit flow (docs/agents/tran-ngoc-bau/flow/) so Phase 0.5 read_telegram_reports + Phase 3 get_agent_signals/get_signal_effectiveness/get_alert_accuracy work MCP-blind.",
            "F-TNB-DUAL-DISPATCH-GATE-MCP-DEPENDENT (MED): the PUBLISHED MARKER GATE dedup mutex is task_claim-over-MCP, so two gateway-blind sessions cannot dedup and both wrote the shared notebook (peer self-detected + deferred, no data lost). Dedup must survive gateway-blind — via the mcp-call.sh bridge to task_claim OR a file-based fallback lock (claim-file under docs/signals/ checked via Read); architect chooses during po->ba->pm->architect."
          ],
          stale: "promoted 2026-07-08, still BACKLOG 6 days / 13+ cycles. supervised handling applies (bounded-1 5th-hole class); promotion left to router/dev-team adjudication — PLAN-ONLY triage does not self-promote.",
          source: "docs/handoffs/tnb-audit-latest.md"
        } }
      end)
    else . end
  ))

# M3: id-guarded mint of the genuinely-new evening-dup/date-mislabel investigation row
| if ($ids | index("FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE")) then .
  else .task_board.backlog += [ {
    id: "FIX-CHEF-EVENING-DUP-DATE-MISLABEL-INVESTIGATE",
    title: "Confirm/refute chef-evening 07-14 duplicate-publish + fix VN-local date-mislabel in notebook session headers",
    type: "FIX",
    priority: "P2",
    status: "BACKLOG",
    zone: "cross-service/",
    owner: "po",
    supervised: true,
    created_at: $now,
    created_by: "po-tnb-c109-triage",
    origin: "docs/handoffs/tnb-audit-latest.md#F-CHEF-EVENING-DUPLICATE-DATE-MISLABEL",
    note: "PLAN-ONLY (anomaly->BACKLOG bridge, project_anomaly_task_bridge). SUSPECTED, MCP-blocked at audit time. TWO components: (1) DATE-MISLABEL [genuinely new/untracked]: unified-agent.md top entry headed 'Session: 2026-07-15 (evening — current)' @19:49 UTC sits 1 min above a 'Session: 2026-07-14 (evening)' @19:48 UTC entry; 19:49UTC+7h = 02:49 VN on 07-15 => VN-local date leaked into the session header instead of UTC (premise-date-error class, feedback_premise_date_error_survives_agent_chain). Fix: chef.md must stamp UTC date in session/notebook headers, never VN-local. (2) DUP-PUBLISH [likely REFUTED — verify cheaply, do NOT re-litigate the dedup mechanism]: PO RAW-verified docs/data/cowork-schedule.json chef-evening.last_fired = single 2026-07-14T19:48:44.480Z matching ONLY the 19:48 entry, NOT the 19:49 entry — a genuine 2nd scheduled fire would have bumped last_fired, so this leans to a notebook mislabel/manual write, not a real double MARKET publish. CONFIRM step: one read_telegram_reports cycle_id pairing of the two [CHEF-DETAIL] WORK messages once MCP restored — IF a real duplicate MARKET post is found, fold to the EXISTING dedup cluster (FIX-CHEF-PUBLISHED-MARKER-RELEASE / FU-CHEF-MARKER-INFLOW / UC-CCA-P3) and do NOT duplicate that work here; this row's own deliverable is the UTC-date-header fix.",
    verification_gate: "read_telegram_reports cycle_id pairing shows either (a) single evening publish -> chef.md UTC-header fix lands + no dup, or (b) genuine dup -> folded to dedup cluster. done_verified requires the header-fix RAW-verified in a subsequent evening dish header carrying UTC date."
  } ]
  end

# metadata bump
| ._updated_at = $now
| ._updated_by = "po-tnb-c109-triage"
