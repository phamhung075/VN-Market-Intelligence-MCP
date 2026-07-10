# qa-fix-agent-signals-orphan-alertid-hold-review-ops.jq
# Single-task QA verdict on FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID: code+tests
# independently APPROVED, held at REVIEW (not done_verified) because the
# mcp-server container has not been rebuilt+swapped yet (ops-gated) — the
# writer-level guard is not live in production until the rebuild ships.
# Sets next_agent="ops", adds qa_verified_at/qa_verified_by + qa_note
# (does not overwrite dev-mcp-server's status_note), syncs top-level .head.
# Usage: jq --arg now "$NOW" -f scripts/qa-fix-agent-signals-orphan-alertid-hold-review-ops.jq
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
def qa_note:
  "QA independently re-verified (not trusted from report): (1) diff confirmed generic parameterized `SELECT 1 FROM alerts WHERE id = ?` existence guard in BOTH storeAlerts/storeAlertsFromCommander (alertStore.ts), not hardcoded to any alert id. (2) New FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID.test.ts re-run fresh: 8/8 pass. (3) Targeted alert suites re-run fresh (8 files incl. FIX-ALERT-ORPHAN-CORRELATION/ta-scan-job/bb-scan-job/UUID-MISMATCH/CONFIDENCE-DEFAULT-50/data-audit-job x2 + 2 foreign-flow-alert files): 129/129 pass. tsc clean (0 errors). DDD clean (no domain-layer files touched; scheduler/infra imports match each file's own documented layer). Security clean (parameterized SQL, no process.env, no secrets). mock-guard PASS exit 0. (4) Independently re-ran FULL `bun test`: 14456 pass/40 skip/56 fail/5 errors/1187 files (552s, same documented Bun 1.3.13 teardown-crash class) — grepped all 56 failing test names for alert/signal/orphan/audit/alertStore/dataAuditJob/checkOrphanAgentSignalsAlertId: zero overlap. Spot-isolated 3 of the 56 (102-job-news-poll.test.ts, 1875c-record-signal-outcome-routing.test.ts, 1518-get-foreign-flow-ohlcv-source.test.ts) in isolation: the pollNews cluster fails on a real local-sandbox cause (`Browser was not found at /usr/bin/chromium`, 5000ms bun-test-default timeout), the other 2 pass 9/9 clean in isolation — confirms pre-existing resource-contention/env flake, not a regression from this diff, matching dev-mcp-server's own claim (their run: 14449/63/9; run-to-run count variance is itself the documented flakiness signature per S27/S12 precedent). (5) Live-DB RAW-probe (docker exec bun against the named-volume DB `/app/data/market.db`, confirmed via DB_PATH env + volume-mount inspection, not readonly to avoid WAL-blindness): 0 orphans, 10/10 alert_id-tagged agent_signals rows resolve to a real alerts.id — independently reproduces the claimed 0-orphan snapshot. (6) Verified the running container's image was built 2026-07-09T12:49:50Z, strictly BEFORE this fix's commit (33bb3078e, 2026-07-10T04:30:25Z) — the deployed container is CONFIRMED still running the pre-fix code; the writer guard is not live in production yet, so the underlying defect (silent dangling-FK creation on a future fingerprint collision) has not actually stopped, even though the current DB snapshot happens to read 0 orphans. VERDICT: code+tests APPROVED, held at REVIEW (not DONE_VERIFIED) per standing precedent (qa-S7/S9/qa journal: docker compose swap is ops-gated, QA does not self-authorize) — routing next_agent=ops for the rebuild+swap; DJ-GATE-1 confirmed satisfied (dev-mcp-server-S28, task-id stamped).";

.task_board.review |= map(
  if .id == "FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID" then
    .next_agent = "ops"
    | .rebuild_required = true
    | .qa_verified_at = $now
    | .qa_verified_by = "qa"
    | .qa_note = qa_note
    | .updated_at = $now
    | .updated_by = "qa"
  else . end
)
| (
    if .head.active_task_id == "FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID" then
      .head = {
        status: "review",
        active_task_id: "FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID",
        next_agent: "ops",
        next_action: "FIX-AGENT-SIGNALS-ORPHAN-ALERT-ID: qa APPROVED code+tests (independently re-verified), held at REVIEW — mcp-server rebuild+swap still pending (image predates fix commit). ops rebuilds+swaps, then re-runs the live 0-orphan RAW-probe before qa/po can close done_verified.",
        updated_at: $now,
        updated_by: "qa"
      }
    else . end
  )
