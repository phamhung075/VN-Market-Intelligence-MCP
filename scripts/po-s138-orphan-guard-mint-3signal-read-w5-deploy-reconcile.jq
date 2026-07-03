# scripts/po-s138-orphan-guard-mint-3signal-read-w5-deploy-reconcile.jq
# ---------------------------------------------------------------------------
# PO single-pass triple-mutation triage (idempotent) — dev-team 06:37Z tick drain.
#
#   M1  id-guarded MINT of FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD -> .task_board.backlog[]
#       as a PLAN-ONLY FIX row (HIGH, zone=multi[apps/mcp-server/ + flow-docs], next_agent=ba)
#       from the dev-team repair_task_request. Skipped if id already in ANY board lane.
#
#   M2  DRAIN the 3 dev-team-handed signal rows NEW->READ (id + status=="NEW" guarded),
#       stamping each with a po_triage disposition:
#         - sau-20260703T074552Z            (A-13 FAIL, HIGH)  -> transient FALSE-POSITIVE,
#           self-resolved; NO backlog task (corroborated by the INFO row below).
#         - dt-flowdefect-orphan-guard-...  (repair_task_request, HIGH) -> minted as M1.
#         - sau-2026-07-03T08:41:40Z        (corroboration, INFO) -> loop-closer for A-13.
#       READ (not RESOLVED) per router instruction — keeps the audit trail alive.
#
#   M3  RECONCILE both W5 review rows in-place (marker-guarded on po_triage_deploy_gate_note):
#       their code blocker FIX-BCTC-BANK-BS-COLUMN-ORDER is now DONE_VERIFIED (qa PASS
#       66dfe89a5, router RAW-verified; supersedes SECTION-CLASSIFIER). Rewrite blocked_on
#       from the (stale) code-task pointer to the real remaining gate = ops-deploy of the
#       COLUMN-ORDER fix + operational finalize_bctc_refine on live CTG report
#       96e36139 (named-volume market.db). Status stays BLOCKED so no dev coding lane is
#       dispatched before the deploy — the router routes ops-deploy first, then the re-ingest.
#
# Idempotent: M1 id-guard across all lanes, M2 status=="NEW" guard, M3 marker guard.
# Re-run mutates 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s138-orphan-guard-mint-3signal-read-w5-deploy-reconcile.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#   (orch-apply does Zod + dup-key + CAS-mtime + atomic rename; PUSH HELD — fleet-push timer pushes)
# ---------------------------------------------------------------------------

"FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD" as $newid
| (["sau-20260703T074552Z","dt-flowdefect-orphan-guard-20260703T0817Z","sau-2026-07-03T08:41:40Z"]) as $sig_ids
| (["TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST","W5-FU-CTG-REFINE-96e36139"]) as $w5_ids
| ([.task_board | (.backlog,.ready,.in_progress,.review,.qa,.done,.done_verified)[]?
     | if type=="object" then .id else . end]) as $existing

# ── M1 — mint orphan-adoption guard FIX ──────────────────────────────────────
| .task_board.backlog += (
    if ($existing | index($newid)) then []
    else [ {
      "id": $newid,
      "type": "FIX",
      "title": "Orphan-adoption board-state guard (both paths) + stop false-orphaning long agents + clearable reaper orphans",
      "owner": "po",
      "status": "BACKLOG",
      "priority": "high",
      "severity": "HIGH",
      "plan_only": true,
      "zone": "multi",
      "zones": ["apps/mcp-server/", "flow-docs"],
      "next_agent": "ba",
      "created_at": $now,
      "created_by": "po",
      "source_signal": "dt-flowdefect-orphan-guard-20260703T0817Z",
      "detail_ref": "docs/signals/router-flowdefect-orphan-adoption-guard-20260703.md",
      "incident": "FIX-BCTC-BANK-BS-COLUMN-ORDER orphaned mid-run 08:04Z (sprint-task lock TTL 3600s < ~90min runtime, not heartbeated), completed cleanly 08:08Z (d69b13f41 + e73a53688, RAW-verified, done_verified). Reaper-created orphan-signal is immune to all session-based clear tools (owner_client_session=null) — clearable only by TTL/GC. Router applied the guard MANUALLY this cycle by promoting COLUMN-ORDER done_verified before any adoption could re-dispatch the still-live task.",
      "fix_spec": [
        "(a) Board-state guard in BOTH orphan-adoption paths — dev-team docs/agents/dev-team/flow/main.md Step 0a AND router .claude/skills/dispatch-claim/SKILL.md Orphan-Adoption Probe: before adopting, read orch-state .task_board; if original_task_id is already in review/qa/done/done_verified/closed -> SKIP adoption, log, and neutralize the orphan-signal (no re-dispatch, no tree-hygiene git-checkout).",
        "(b) Stop false-orphaning live agents: heartbeat the sprint-task lock during long agent runs, OR raise the sprint-task lock TTL above typical ~90min agent runtime (currently 3600s).",
        "(c) Make reaper-created null-session orphan-signals clearable by owner_agent + payload.original_owner_client_session match (today a session=null orphan is unclearable except by TTL)."
      ],
      "acceptance": [
        "AC1: orphan-adoption in BOTH paths skips original_task_id when its board lane is terminal (review/qa/done/done_verified/closed); logs skip + neutralizes the orphan-signal (no re-dispatch, no tree-hygiene revert of unrelated uncommitted files).",
        "AC2: a dispatched agent running longer than the sprint-task lock TTL is NOT false-orphaned (heartbeat during run OR TTL raised above runtime).",
        "AC3: a reaper-created null-session orphan-signal is clearable via owner_agent + payload.original_owner_client_session (no longer TTL-only)."
      ],
      "recurrence_class": "feedback_dead_worker_uncommitted_live_file_revert + feedback_orphan_signal_immune_and_adoption_no_board_guard",
      "note": "Permanent-fix backlog item, NOT an active incident (router mitigated this instance manually). Normal po->ba->pm->dev chain; architect SPLITs the multi-zone (dev-mcp-server reaper/lock/orphan-signal code + flow-doc guards)."
    } ]
    end
  )

# ── M2 — drain the 3 signal rows NEW->READ with dispositions ──────────────────
| .signal_queue.rows |= map(
    if ((.id as $i | $sig_ids | index($i)) != null) and (.status == "NEW")
    then .status = "READ"
       | .po_triaged_at = $now
       | .po_triage = (
           if   .id == "sau-20260703T074552Z"
           then "TRANSIENT FALSE-POSITIVE (self-resolved) — A-13 api-gateway health unreachable was a transient probe blip; system-auditor re-probed and emitted INFO corroboration sau-2026-07-03T08:41:40Z (HTTP 200 at 08:40Z, container RestartCount=0, uptime 4d). NO backlog task. Non-actionable."
           elif .id == "dt-flowdefect-orphan-guard-20260703T0817Z"
           then "TRIAGED -> minted backlog FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (HIGH, plan-only, zone=multi, next_agent=ba). Incident doc: docs/signals/router-flowdefect-orphan-adoption-guard-20260703.md. Permanent-fix item (router mitigated the instance manually)."
           else "INFO loop-closer for A-13 (sau-20260703T074552Z) — api-gateway recovered HTTP 200. Read; corroborates the false-positive triage. No action."
           end
         )
    else .
    end
  )

# ── M3 — reconcile both W5 review rows: code blocker cleared, now DEPLOY-gated ─
| .task_board.review |= map(
    if (type == "object")
       and ((.id as $i | $w5_ids | index($i)) != null)
       and ((has("po_triage_deploy_gate_note")) | not)
    then . + {
      "po_triage_deploy_gate_note": "[po 2026-07-03T08:57Z] CODE BLOCKER CLEARED: FIX-BCTC-BANK-BS-COLUMN-ORDER is DONE_VERIFIED (qa PASS 66dfe89a5, router RAW-verified; supersedes FIX-BCTC-BANK-BS-SECTION-CLASSIFIER, folds its 3 RC fixes 2c7fb5b0 as non-regressions). depends[] (SECTION-CLASSIFIER done+superseded; W2 ROW-REPAIR 2cd9e105 + W4 AGGREGATOR-FIXTURES a46131cf were W1-W4 done_verified at PARTIAL sprint close) are all satisfied. This row is NO LONGER a code/qa task — the ONLY remaining gate is DEPLOY-then-operate: (1) ops rebuild+deploy the COLUMN-ORDER fix to live mcp-server, then (2) run finalize_bctc_refine / reingest-bctc-report.ts on live CTG report 96e36139-5dac-414d-8e4d-20a4725890d1 (named-volume market.db) to unfreeze total_assets from 0, then (3) RAW-probe total_assets != 0 -> done_verified. Status kept BLOCKED so no dev coding lane dispatches before the deploy.",
      "blocked_on": "DEPLOY-GATE: ops rebuild+deploy of FIX-BCTC-BANK-BS-COLUMN-ORDER (done_verified) to live mcp-server, THEN operational finalize_bctc_refine on live CTG report 96e36139-5dac-414d-8e4d-20a4725890d1 (named-volume market.db). Code is complete; this is deploy + operational re-ingest, NOT code/qa."
    }
    else .
    end
  )

# ── metadata bump ────────────────────────────────────────────────────────────
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s138"
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po"
