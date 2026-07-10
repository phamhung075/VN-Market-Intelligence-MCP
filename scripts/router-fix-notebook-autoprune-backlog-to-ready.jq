# Board flip: FIX-NOTEBOOK-AUTOPRUNE-ORDERING-ASSUMPTION BACKLOG -> READY
#
# Escalation per recurring-bug-2+ policy. Row itself (created 2026-07-10T11:20Z
# by router-raw-verify-fix) already documented 2 confirmed data-loss instances
# on pm.md (c322 entry silently lost; this same tick's SHG-1/architect/pm chain
# reconstructing it). A 3RD confirmed instance landed this same tick: the D0
# triage sub-agent's notebook write deleted the pre-existing c324 entry
# (2026-07-10T12:30Z, D3A unblock + FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS mint)
# and added nothing in its place — independently confirmed via
# `git show 26ffe7567 -- docs/agent-memory/notebooks/pm.md` (diff = pure
# deletion, zero insertions) and a `grep` for any D0/triage mention in the
# resulting file (zero hits). Router restored the lost c324 content + added a
# genuine D0 cycle entry directly (docs/agent-memory/notebooks/pm.md, 88L,
# well under the 200L cap — see that file's own c325 entry for the full
# incident note).
#
# GUARD: refuse unless the row is in backlog[] with status BACKLOG.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/router-fix-notebook-autoprune-backlog-to-ready.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| (.task_board.backlog // []) as $bl
| ([$bl[] | select(type=="object" and .id=="FIX-NOTEBOOK-AUTOPRUNE-ORDERING-ASSUMPTION")][0]) as $t
| if $t == null then error("FIX-NOTEBOOK-AUTOPRUNE-ORDERING-ASSUMPTION not in backlog[] — refuse")
  elif ($t.status != "BACKLOG") then error("FIX-NOTEBOOK-AUTOPRUNE-ORDERING-ASSUMPTION status != BACKLOG (got \($t.status)) — refuse")
  else . end
| ($t + {
    status: "READY",
    updated_at: $now,
    updated_by: "router",
    escalated_at: $now,
    escalated_by: "router",
    escalation_reason: "3rd confirmed instance this session (recurring-bug-2+ policy) — D0-BACKLOG-HYGIENE-TERMINAL-ROW-TRIAGE sub-agent's notebook write deleted the c324 entry on pm.md with no replacement, same root cause already diagnosed in this row's own note. Router restored the lost content directly; promoting for immediate dispatch rather than leaving a proven-recurring data-loss bug sitting in backlog."
  }) as $ready
| .task_board.backlog = [$bl[] | select(.id != "FIX-NOTEBOOK-AUTOPRUNE-ORDERING-ASSUMPTION")]
| .task_board.ready = ((.task_board.ready // []) + [$ready])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "router"
