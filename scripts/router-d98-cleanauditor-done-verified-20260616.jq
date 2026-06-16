# Router 2026-06-16 — dev-team tick 20260616T222629Z: record CLEAN-AUDITOR-DOC-SIGNAL-TYPES ready -> done_verified.
#
# agent-father shipped the system-auditor doc-coherence fix (commit bab66a03) — post_agent_signal signal_type
# enum drift after the signal_feedback migration (220b48c5). Router RAW-verified FIRST-HAND (doc fix → live
# source IS the oracle; nothing to defer-observe, so done_verified is honest, not withheld):
#   - commit bab66a03 touched EXACTLY 3 owned paths (audit-dimensions.md + init.md + agent-father DJ) — no churn swept;
#   - SUBSTANCE: new enum verified against apps/mcp-server/src/infrastructure/db/agentSignalStore.ts:39-51
#     (SignalTypeSchema z.enum) — "signal_feedback" IS in the enum (L48); the 4 old labels
#     (microservice_degraded|data_stale|db_integrity_breach|system_health_report) are NOT → payload/dedup categories;
#   - init.md:24/47/81/137 corrected to `signal_type: signal_feedback`;
#   - audit-dimensions.md:18/28/38 (D1/D2/D3 post_agent_signal probes) -> "Finding category (dedup namespace)" + signal_feedback;
#   - audit-dimensions.md:76/144 (D4/D5) `system_issue` = FREE-FORM signal_queue-row type, live-confirmed in
#     tasksMdJanitorJob.ts:234 -> correctly LEFT untouched per scope rule #3 (NOT a gap — router checked both ways);
#   - grep gate green: zero stale post_agent_signal *type* refs; all remaining hits = legit tool name + signal_feedback;
#   - DJ-GATE-1 satisfied (decisions/sprint-FE-PAGE-REORG-agent-father.md task-id CLEAN-AUDITOR-DOC-SIGNAL-TYPES, L19).
#
# GUARD: refuse unless CLEAN-AUDITOR-DOC-SIGNAL-TYPES uniquely in ready[] (count==1).
# CONSERVATION: 6-lane total UNCHANGED (ready -1, done_verified +1). Atomic temp->mv applied by caller.
# Usage: jq --arg now "$NOW" -f scripts/router-d98-cleanauditor-done-verified-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "CLEAN-AUDITOR-DOC-SIGNAL-TYPES" as $id
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done,.task_board.done_verified,.task_board.backlog]|map(length)|add) as $before6
| ([ .task_board.ready[] | select((.id? // .task_id? // "")==$id) ] | length) as $cnt
| if ($cnt != 1) then error("GUARD: CLEAN-AUDITOR not uniquely in ready[] — count=" + ($cnt|tostring)) else . end
| ([ .task_board.ready[] | select((.id? // .task_id? // "")==$id)
      | . + {status:"DONE_VERIFIED", next_agent:null, done_at:$now, done_by:"agent-father",
             done_verified_at:$now, done_verified_by:"router",
             live_verify:"LIVE RAW (router, first-hand): commit bab66a03 (3 owned paths, no churn). New enum verified vs apps/mcp-server/src/infrastructure/db/agentSignalStore.ts:39-51 SignalTypeSchema — signal_feedback in enum (L48), old labels microservice_degraded|data_stale|db_integrity_breach|system_health_report NOT in enum (= payload/dedup categories). init.md:24/47/81/137 -> signal_type:signal_feedback. audit-dimensions.md:18/28/38 (D1/D2/D3 post_agent_signal) -> 'Finding category (dedup namespace)'+signal_feedback. D4/D5 76/144 system_issue = free-form signal_queue-row type, live-confirmed tasksMdJanitorJob.ts:234, correctly untouched (scope rule #3). grep gate: zero stale post_agent_signal type refs (remaining = tool name + signal_feedback). DJ-GATE-1 ok. Doc-only: no runtime obs pending." } ]) as $promoted
| .task_board.ready = [ .task_board.ready[] | select((.id? // .task_id? // "")!=$id) ]
| .task_board.done_verified = ( $promoted + .task_board.done_verified )
| .head = {
    status:"idle", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null,
    note:("ROUTER " + $now + " — CLEAN-AUDITOR-DOC-SIGNAL-TYPES DONE_VERIFIED (router RAW-verified first-hand, commit bab66a03): system-auditor docs now cite signal_type:signal_feedback (live enum agentSignalStore.ts) — D1/D2/D3 post_agent_signal disambiguated, D4/D5 signal_queue-row system_issue correctly preserved. DESIGN-GATHERER umbrella (ready, design-complete tracker) + DMS-1+DMS-2 (backlog) still HELD behind ARCH-CRON-SCHEDULER-RELIABILITY. PUSH held (PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done,.task_board.done_verified,.task_board.backlog]|map(length)|add) != $before6)
    then error("CONSERVATION FAIL: 6-lane total changed on CLEAN-AUDITOR done_verified move") else . end
