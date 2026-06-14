# po-s58-cron-scheduler-reliability-consolidate.jq
# Owner: PO triage (router cron-scheduler silent-misfire cluster brief, 2026-06-14T02:20Z LIVE).
# Idempotent: skips parent-task insert if id already present anywhere on the board.
# Consolidates the node-cron v3.0.3 silent-misfire RECURRING root cause (3rd+ touch:
#   53d00955 EVIDENCE-ACCUM-SILENT-CRON recoverMissedExecutions patch RECURRED,
#   c35db4fc FUNDAMENTALS banner-fix did NOT restore auto-fire,
#   FU-REPUTATION-CRON-MISS missed AGAIN 06-12) into ONE architect-bound root-cause task.
# Mutations (single atomic pass):
#   1. ADD ARCH-CRON-SCHEDULER-RELIABILITY -> .task_board.ready (SPRINT-S, architect, SEQUENCED after crash-loop).
#   2. CORRECT false-done: FIX-FUNDAMENTALS-REFRESH-CRON-DEAD keeps data-correctness done_verified
#      but gets reopened_autofire note + folded_into pointer (auto-fire defect is distinct + still live-dead).
#   3. FOLD FIX-OHLCV-DAILY-AGGREGATOR-STALE + FU-REPUTATION-CRON-MISS into parent (same root).
#   4. ADD FIX-NEWS-CB-FALSE-CLOSED -> .task_board.backlog (I2: Reuters/TradingEconomics 14 errors, CB still [OK]).
#   5. FOLD I7 (vn-sbv-fetch crash-loop) into existing FIX-SBV-FX-VPS-FETCHER-UNHEALTHY (no new task).
# Usage:
#   NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
#   jq --arg now "$NOW" -f scripts/po-s58-cron-scheduler-reliability-consolidate.jq \
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
      "id": "ARCH-CRON-SCHEDULER-RELIABILITY",
      "type": "SPRINT-S",
      "title": "node-cron v3.0.3 scheduler reliability — durable root-cause fix for the silent-misfire cluster (RECURRING, 3rd+ touch -> architect-bound). LIVE EVIDENCE (router 2026-06-14T02:20Z, PO re-verified): (1) ohlcvDailyAggregatorJob — get_pipeline_health 02:22Z confirms 'Aggregator last run: 2026-06-12', missed Fri 06-13 weekday, all 16 sectors N/A rotation. (2) vnstockFundamentalsRefresh — auto-fire never restored: commit c35db4fc fixed ONLY the vnstock-v4 stdout-banner data-correctness bug (fetches returned null -> tables frozen) and explicitly states the Jun-8 'crash' was a container restart mid-run; the cron AUTO-FIRE was never verified to resume (QA APPROVED via MANUAL trigger only). (3) reputationComputeJob — cron-miss 06-12 08:30, the SECOND miss after 06-11 was supposedly fixed by 53d00955. ROOT CLASS (named in 53d00955 commit msg): node-cron drops ticks when the event loop is saturated and recoverMissedExecutions=false; missedExecutions>0 -> autorecover guard skips emission -> tick gone; peer jobs sharing the same minute (08:30 cluster, daily-aggregate cluster) compound it. The per-job recoverMissedExecutions:true patch (53d00955, evidenceAccumulator+reputation only) did NOT durably close the class — it RECURRED on reputation and never covered aggregator/fundamentals. ARCHITECT must design the DEFINITIVE scheduler fix, not another per-job patch: candidate levers (architect rules A/B/C combination) — (A) upgrade or replace node-cron with a scheduler that does not silently drop ticks under loop saturation; (B) apply recoverMissedExecutions:true uniformly to ALL scheduled jobs + add deterministic per-tick dedup (cron_job_runs same-UTC-day guard, mirroring the EVIDENCE-ACCUM precedent) so uniform recovery cannot double-fire; (C) STAGGER the concurrent clusters (add per-job minute jitter so 08:30 / daily-aggregate jobs no longer collide on one tick); (D) add a missed-fire WATCHDOG that detects last_run age > 2x cadence per job and self-heals (force-run) or emits a WORK alert — closing the silent-miss blind spot that let these rot 3-6 days undetected. agent-father / dev-mcp-server implements after architect brief.",
      "owner": "architect",
      "route": "architect",
      "status": "READY",
      "size": "S",
      "priority": "P1",
      "recurring": true,
      "recurrence_count": 3,
      "escalation": "recurring-bug escalation per feedback_recurring_bug_escalation — 2+ commits same module (53d00955 + c35db4fc + FU-REPUTATION recurring) -> architect root-cause REQUIRED, no further per-job symptom patches.",
      "zone": "apps/mcp-server/",
      "depends": ["FIX-MCP-CRASH-LOOP-WRITEWAL"],
      "sequencing": "WIP=2 — dev-mcp-server is SATURATED (FIX-MCP-CRASH-LOOP-WRITEWAL in_progress + BC-1 deploy-verify; A-1/D-1 ready). Architect + design stages may run NOW in parallel (no dev-mcp-server WIP impact). The dev-mcp-server IMPL task is SEQUENCED behind the crash-loop fix landing — a wedged/crash-looping server is itself a source of loop-saturation tick drops, so the scheduler fix must land on a stable server.",
      "baseline_pass": false,
      "files": [
        "apps/mcp-server/src/scheduler/startScheduler.ts",
        "apps/mcp-server/src/scheduler/startupHelpers.ts",
        "apps/mcp-server/package.json"
      ],
      "verification_gate": "Prove the cluster auto-fires durably, not just that one manual run works: (G1) ohlcvDailyAggregatorJob auto-fires next VN market day — get_pipeline_health 'Aggregator last run' advances to that day with NO manual trigger AND all 16 sectors leave N/A rotation; (G2) vnstockFundamentalsRefresh auto-fires on its cadence and repopulates financial tables (live VCB/ACB/CTG rows newer than the run) with NO manual trigger; (G3) reputationComputeJob fires at its 08:30 tick on a market day even with peer jobs on the same minute (cron_job_runs row present, no miss); (G4) inject loop-saturation at a scheduled tick in test and assert the tick is recovered/emitted (regression test for the dropped-tick class, mirroring EVIDENCE-ACCUM-SILENT-CRON.test.ts); (G5) missed-fire watchdog emits a WORK alert + self-heal when a job's last_run age > 2x cadence. QA verifies LIVE raw (pipeline-health payload + cron_job_runs rows), never badges. Ship completion across the whole cluster, not one job.",
      "source": "router cron-scheduler silent-misfire cluster brief 2026-06-14T02:20Z (LIVE-verified) — subsumes ohlcv + fundamentals-autofire + reputation; recurring class first named in 53d00955",
      "groomed_by": "po",
      "groomed_at": $now,
      "subsumes": ["FIX-OHLCV-DAILY-AGGREGATOR-STALE", "FU-REPUTATION-CRON-MISS", "FIX-FUNDAMENTALS-REFRESH-CRON-DEAD#autofire"]
    }
  ) as $parent
| (
    {
      "id": "FIX-NEWS-CB-FALSE-CLOSED",
      "type": "FIX",
      "status": "TODO",
      "priority": "P2",
      "zone": "apps/news-fetch/",
      "owner": "dev-news-fetch",
      "title": "FIX-NEWS-CB-FALSE-CLOSED — Reuters RSS + TradingEconomics x2 at 14 CONSECUTIVE errors since the 2026-06-13T23:18Z restart, yet their circuit-breakers still report [OK] (failure threshold not hit). CB false-closed masks a never-succeeded-since-restart news-source freshness gap from agent monitoring. FIX: (a) lower the CB failure threshold so 14 consecutive errors trips OPEN, and/or (b) add a never-succeeded-since-restart detector (a source with zero successes since process start AND error_count>=N must surface as DEGRADED regardless of the rolling-window CB). Surface the degradation to the BUG/WORK channel + freshness gate so news-source staleness is no longer invisible. PLAN-ONLY at PO layer — dev-team chain implements.",
      "user_impact": "MED — macro/news context silently stale (Reuters + TradingEconomics) while health reports show green; corrupts news-driven freshness for chef/news-scout consumers.",
      "depends": [],
      "source": "router cluster brief 2026-06-14T02:20Z (SECONDARY I2)",
      "groomed_by": "po",
      "groomed_at": $now
    }
  ) as $news
# 1. Insert parent into ready (idempotent)
| (if already_present($parent.id) then . else .task_board.ready += [$parent] end)
# 4. Insert news CB task into backlog (idempotent)
| (if already_present($news.id) then . else .task_board.backlog += [$news] end)
# 2. Correct false-done: annotate FIX-FUNDAMENTALS-REFRESH-CRON-DEAD (lives in backlog[] with status done_verified)
| .task_board.backlog = ( .task_board.backlog | map(
    if .id == "FIX-FUNDAMENTALS-REFRESH-CRON-DEAD"
    then . + {
      "po_correction": "FALSE-DONE PARTIAL: data-correctness (vnstock-v4 stdout-banner -> null fetches -> frozen tables, c35db4fc) is GENUINELY fixed + QA-verified via manual trigger (live VCB/ACB writes) — that part stays done_verified. BUT the CRON AUTO-FIRE was never restored: c35db4fc commit msg itself states the Jun-8 'crash' was a container restart mid-run, and QA APPROVED via MANUAL trigger only. The auto-fire failure is a DISTINCT, still-OPEN defect of the node-cron silent-misfire class.",
      "autofire_status": "STILL-OPEN",
      "autofire_folded_into": "ARCH-CRON-SCHEDULER-RELIABILITY",
      "corrected_by": "po",
      "corrected_at": $now
    }
    else . end ) )
# 3. Fold OHLCV + REPUTATION into parent (status -> FOLDED, pointer to parent)
| .task_board.backlog = ( .task_board.backlog | map(
    if (.id == "FIX-OHLCV-DAILY-AGGREGATOR-STALE" or .id == "FU-REPUTATION-CRON-MISS")
    then . + {
      "status": "FOLDED",
      "folded_into": "ARCH-CRON-SCHEDULER-RELIABILITY",
      "fold_reason": "same node-cron v3.0.3 silent-misfire root class — consolidated under one architect-bound root-cause task to avoid recurring symptom-patching (per feedback_recurring_bug_escalation).",
      "folded_by": "po",
      "folded_at": $now
    }
    else . end ) )
# 5. Fold I7 (vn-sbv-fetch crash-loop) into existing FIX-SBV-FX-VPS-FETCHER-UNHEALTHY (no new task)
| .task_board.backlog = ( .task_board.backlog | map(
    if .id == "FIX-SBV-FX-VPS-FETCHER-UNHEALTHY"
    then . + {
      "po_fold_note": "I7 (router 2026-06-14T02:20Z): vn-sbv-fetch crash-looping again (unhealthy, uptime resets) though data still flows via push buffer. CONFIRMED same module/symptom as this task (VPS fetcher infra down) — folded in, NOT a duplicate.",
      "i7_folded_by": "po",
      "i7_folded_at": $now
    }
    else . end ) )
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
| ._updated_at = $now
| ._updated_by = "po"
