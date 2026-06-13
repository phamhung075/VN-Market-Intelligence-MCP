# PO sprint-50: groom FU-ORPHAN-AUDIT-JOIN-FIX -> READY + adjudicate EVIDENCE-ACCUM-SILENT-CRON gates.
# Invoked with --arg now "<ISO8601>". Atomic temp->[ -s ]->jq -e guard->mv at call site.
# Idempotent: re-running sets the same READY status / same notes.

.task_board.backlog |= map(
  if .id == "FU-ORPHAN-AUDIT-JOIN-FIX" then
    .status = "READY"
    | ._updated_at = $now
    | ._groomed_by = "po"
    | .ac = [
        "AC1: docs/agents/system-auditor/flow/main.md C-08 row (line ~463) JOIN changed from `ON a.id = s.id` to `ON a.id = s.alert_id`; no other C-08 column altered.",
        "AC2: agent-md-factory skill invoked BEFORE editing the flow .md (SSOT/DRY gate).",
        "AC3: manual run of the corrected C-08 query against the LIVE named-volume market.db (via keinos/sqlite3 sidecar, NOT host ./data) returns ~0 orphans (post FIX-ALERT-ORPHAN-CORRELATION alert_id co-write).",
        "AC4: blocks_metric tier3-orphan-delta-long-watch cleared — orphan-delta is a valid regression signal only AFTER this lands; record that on close.",
        "AC5: parallel-safe — NO container rebuild (flow .md only); zone docs/agents/system-auditor/ is distinct from apps/mcp-server/."
      ]
    | .ready_note = "GROOMED READY \($now) by po. Dependency FIX-ALERT-ORPHAN-CORRELATION=DONE (alert_id column + atomic co-write shipped, commit 7cbca67a) -> DoD AC3 now achievable. Dispatch to agent-md-factory next tick; runs in parallel with the apps/mcp-server zone-blocked EVIDENCE-ACCUM."
  else . end
)

| .task_board.active_sprints |= map(
  if .id == "EVIDENCE-ACCUM-SILENT-CRON" then
    .tasks |= map(
      if .id == "EVIDENCE-ACCUM-SILENT-CRON" then
        .note = "Dev DONE commit 53d00955 (recoverMissedExecutions+dedup+double-wrap) — CONFIRMED ancestor of HEAD. ADJUDICATION \($now) by po: REBUILD_REQUIRED is SATISFIED — mcp-server container rebuilt 07:52 UTC today from current HEAD; 53d00955 is LIVE in the running image. Two cron-gated live re-checks remain: (a) reputationComputeJob 08:30 UTC FIRED ~08:30 (now live-verifiable) -> QA dispatched to verify recovered execution against LIVE named-volume reputation_scores (sqlite sidecar, NOT host ./data); (b) evidenceAccumulatorJob 16:00 UTC still ~7.5h future. RULING: item legitimately HOLDS the apps/mcp-server zone until the 16:00 evidenceAccumulatorJob gate lands and is live-verified — DONE is GATED on the 16:00 re-check, not on rebuild. This is the documented zone-block reason."
        | .zone_block_reason = "Holds apps/mcp-server zone until 2026-06-13T16:00Z evidenceAccumulatorJob cron-gated live re-check lands (rebuild gate already met; DONE gated on 16:00 firing)."
        | .gate_status = "rebuild=MET; reputationCompute-0830=QA-VERIFY-NOW; evidenceAccumulator-1600=PENDING-FUTURE"
        | ._updated_at = $now
        | ._adjudicated_by = "po"
      else . end
    )
  else . end
)

| ._updated_at = $now
| ._updated_by = "po"
