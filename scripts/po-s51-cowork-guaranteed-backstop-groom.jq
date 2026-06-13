# po-s51-cowork-guaranteed-backstop-groom.jq
# Owner: PO triage (c94 TNB single-signal triage). Idempotent: skips if id already present
# anywhere on the board (ready/backlog/in_progress/review/done/done_verified arrays).
# Grooms FIX-COWORK-GUARANTEED-BACKSTOP → .task_board.ready (status READY for router claim).
# Also flips tnb signal row tnb-20260613T202300 NEW→RESOLVED in the same atomic pass.
# Usage:
#   jq --arg now "$NOW" -f scripts/po-s51-cowork-guaranteed-backstop-groom.jq \
#     docs/data/orch/orch-state.json > /tmp/orch.tmp \
#   && [ -s /tmp/orch.tmp ] && mv /tmp/orch.tmp docs/data/orch/orch-state.json
# Flow-doc pointer: docs/agents/po/flow/main.md (Reusable triage scripts)
def already_present($id):
  [ .task_board | to_entries[] | .value
    | (if type=="array" then .[] else empty end)
    | select((.id // "") == $id) ] | length > 0;

. as $root
| (
    {
      "id": "FIX-COWORK-GUARANTEED-BACKSTOP",
      "type": "SPRINT-S",
      "title": "Durable backstop for guaranteed cowork dishes during */15 dispatcher (Layer B) downtime — 5th recurrence of morning/EOD dish-miss. ROOT (c94, live-evidence): the session-scoped */15 cowork-team master dispatcher (Layer B) evaporated 2026-06-12T05:30Z→2026-06-13T14:00Z (~32h gap; last heartbeat docs/signals/processed/cowork-team-20260612T051500Z.json, then ZERO until slots resumed 14:08Z). Every guaranteed slot whose cron boundary fell in that window missed: chef-morning(05:15) AND chef-eod(08:45) on both 06-12 + 06-13. The runbook (docs/protocols/cowork-master-cron-runbook.md §1,§9) designed Layer A (per-slot RemoteTriggers) as the session-INDEPENDENT backstop for exactly these guaranteed slots — but cowork-schedule.json now shows ALL guaranteed slots trigger_status=deleted, trigger_id=null (_superseded_by:cowork-dispatcher migration). Layer A was deleted BEFORE §9's stability gate (skill proven across >=2 restarts) was met. Result: a single Layer-B session-evaporation now silently drops ALL guaranteed dishes with zero backstop = the recurring root. DESIGN a durable fix: either (A) restore Layer-A RemoteTriggers for the 4 guaranteed chef/audit slots (session-independent), or (B) add a silence-watchdog that detects >20min cowork-team heartbeat gap during VN market hours (02:00-08:30Z Mon-Fri per runbook §2 Signature A) and auto-re-arms /cron-cowork-team, or (C) make Layer B durability survive session-end. Architect picks A/B/C with rationale; agent-father implements. This is NOT a dev-mcp-server code change and NOT a cowork-schedule.json data edit — it is a cowork-reliability flow/skill/trigger design task. Subsumes both F-EOD-SCHEDULE-STALE(NEW/HIGH) and F-MORNING-NB-MISSING(HIGH,5th) — same incident, one root.",
      "owner": "architect",
      "route": "architect",
      "status": "READY",
      "size": "S",
      "priority": "high",
      "recurring": true,
      "recurrence_count": 5,
      "zone": "docs/agents/cowork-team/flow/",
      "depends": [],
      "baseline_pass": false,
      "files": [
        "docs/data/cowork-schedule.json",
        "docs/protocols/cowork-master-cron-runbook.md",
        ".claude/skills/cron-cowork-team/SKILL.md",
        "docs/agents/cowork-team/flow/main.md"
      ],
      "verification_gate": "PROVE the morning dish actually generates next cycle, not just that a trigger exists: (G1) on the NEXT VN market day (Mon 2026-06-16), chef-morning slot fires — cowork-schedule.json chef-morning.last_fired updates to a 2026-06-16T05:1x..05:3xZ timestamp AND a 2026-06-16 morning entry appears in docs/agent-memory/notebooks/unified-agent.md; (G2) same for chef-eod (last_fired 2026-06-16T08:4x..09:0xZ + EOD notebook entry); (G3) survives a deliberate CLI session restart — after restart with NO manual /cron-cowork-team, a guaranteed slot whose boundary falls post-restart still fires within one cron period (proves backstop is session-independent, i.e. closes the recurring root rather than re-arming by hand); (G4) silence-watchdog (if option B) emits a re-arm action on a simulated >20min market-hours heartbeat gap. TNB c95+ audit confirms morning+EOD present for 2 consecutive market days = recurrence closed.",
      "source": "tnb-audit c94 (tnb-20260613T202300) — F-EOD-SCHEDULE-STALE + F-MORNING-NB-MISSING",
      "groomed_by": "po",
      "groomed_at": $now,
      "router_action_required": "After done_verified, ROUTER must run /cron-cowork-team re-arm to restore Layer-B coverage immediately (the ~32h gap is still un-rearmed for sub-hourly slots). The durable fix above is the permanent remedy; the re-arm is the immediate stopgap."
    }
  ) as $t
| if already_present($t.id) then .
  else .task_board.ready += [$t]
       | .task_board._updated_at = $now
       | .task_board._updated_by = "po"
  end
# Flip tnb signal NEW->RESOLVED (dispositioned: F-OOM ack-closed, EOD+MORNING groomed into one root task)
| .signal_queue.rows = ( .signal_queue.rows | map(
    if .id == "tnb-20260613T202300"
    then .status = "RESOLVED"
       | .disposition = "F-OOM ack-closed (system-auditor c306 MemPerc 29.84%, RestartCount 0); F-EOD-SCHEDULE-STALE + F-MORNING-NB-MISSING(5th) => single root (Layer-B */15 dispatcher 32h evaporation, Layer-A backstop deleted) groomed READY as FIX-COWORK-GUARANTEED-BACKSTOP (architect, zone docs/agents/cowork-team/flow/)"
    else . end ) )
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "po"
| ._updated_at = $now
| ._updated_by = "po"
