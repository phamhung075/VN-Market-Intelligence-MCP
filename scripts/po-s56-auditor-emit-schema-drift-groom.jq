# po-s56-auditor-emit-schema-drift-groom.jq — groom one PLAN-ONLY design task into .task_board.backlog
# Owner: PO triage. Idempotent: skips if id is present in ANY board array (ready/in_progress/review/done/done_verified/backlog).
# Originated 2026-06-15T14:21Z dev-team tick: health-recheck report 3182 (14:11Z) surfaced a NEW, RAW-confirmed bug —
#   system-auditor/flow/main.md emit sites (L193/L482/L509) call post_agent_signal with {type,ts,summary,checks},
#   but the LIVE tool requires {from_agent,to_agent,signal_type∈enum,payload} -> every emit fails MCP -32602 ->
#   zero anomaly signals reach the coordination bus (explains signals.db 0 rows / signal_queue 0 OPEN).
#   The auditor's 4 declared types (microservice_degraded/data_stale/db_integrity_breach/system_health_report)
#   have NO counterpart in the live enum (urgent_news|price_anomaly|...|verified_decision) -> NOT a drop-in rename;
#   needs a design decision (extend tool enum vs remap onto existing enum vs re-sink). Hence HELD-for-BA, PLAN-ONLY.
# Reusable pattern: "RAW-confirmed-live NEW bug that is NOT a clean coding lane -> groom HELD design task, don't dispatch".
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s56-auditor-emit-schema-drift-groom.jq \
#        docs/data/orch/orch-state.json > /tmp/orch.tmp && [ -s /tmp/orch.tmp ] && jq empty /tmp/orch.tmp \
#        && mv /tmp/orch.tmp docs/data/orch/orch-state.json
# Flow-doc pointer: docs/agents/po/flow/main.md (Reusable triage scripts)
. as $root
| {
    id: "FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK",
    type: "FIX",
    status: "BACKLOG",
    priority: "high",
    route_to: "ba",
    owner: "ba",
    zone: "multi",
    size: "S-M",
    created_at: $now,
    created_by: "po",
    source: "health-recheck report 3182 (2026-06-15T14:11Z) BUG-NEW",
    title: "system-auditor post_agent_signal emit-schema drift -> coordination bus dark",
    raw_evidence: "PO RAW-confirmed LIVE 2026-06-15T14:30Z: call post_agent_signal({type,ts,tier,summary}) -> MCP -32602; live tool requires {from_agent,to_agent,signal_type(enum),payload}. Flow emit sites: docs/agents/system-auditor/flow/main.md L193,L482,L509.",
    root_cause: "system-auditor flow emits the historic {type,ts,summary,checks} shape; live post_agent_signal schema is {from_agent,to_agent,signal_type in enum,payload}. The 4 auditor types (microservice_degraded/data_stale/db_integrity_breach/system_health_report) are NOT in the live enum (urgent_news|price_anomaly|cross_validate|suppress|chain_catalyst|fundamental_validation|price_confirmation|verified_chain|signal_feedback|legal_risk|verified_decision).",
    why_not_drop_in: "Not a mechanical arg-rename: no live enum value maps to health/degrade/breach. Needs a design decision — (A) extend the post_agent_signal enum + payload contract on the tool side (dev-mcp-server), OR (B) remap auditor findings onto existing enum + carry detail in payload, OR (C) re-sink auditor health to signal_queue/DASHBOARD only and stop using post_agent_signal. BA decomposes, architect picks the option, then dev impl + agent-father rewrites the 3 emit blocks.",
    generic_mandate: "Fix must cover ALL THREE emit sites (L193 data_stale, L482 db_integrity_breach, L509 system_health_report) + the L16 doc note, not just one. /goal#2.",
    verification_gate: "LIVE: after fix, a real system-auditor cycle writes >=1 row reachable on the coordination bus (signals.db / signal_queue) with NO -32602; RAW-verify by reading the bus row, not a green log.",
    hold_reason: "HELD-for-BA: BA + architect lanes both occupied this tick (BA-VN-MACRO-TOOLING in_progress, ARCH-CRON-SCHEDULER-RELIABILITY in_progress). Unpark to ready once a non-coding decomposition lane frees. Design-gated, NOT a clean coding FIX -> do not dispatch a coding lane.",
    related: ["SYS-FUNC-05-FIX", "FU-AUDITOR-D4-SIGNAL-ID"]
  } as $t
| if ([.task_board[]? | if type=="array" then .[]? else empty end | select(type=="object") | select(.id == $t.id)] | length) > 0
  then .                                     # idempotent: already groomed somewhere on the board
  else .task_board.backlog += [$t]
       | .task_board._updated_at = $now
       | .task_board._updated_by = "po"
       | ._updated_at = $now
       | ._updated_by = "po"
  end
