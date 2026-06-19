# po-s110: dev-team tick 20260619T173118Z triage — WIP 0 -> 2.
#
# M1 PROMOTE the orphan-root FIX FU-ALERT-COWRITE-SCHEDULER-JOBS backlog -> ready[]
#    (escalate priority medium->high: recurring 103->63->33 + router RAW-verified
#     LIVE 33 orphaned / 119 alerts-24h on named-vol market.db this tick), set
#     status=READY + promotion stamps + next_agent=dev-mcp-server. The dependency
#     FIX-ALERT-ORPHAN-CORRELATION already shipped (7cbca67a/556eb214).
# M2 id-guarded MINT FIX-AUDITOR-SIGNAL-WRITE-WRONG-KEY -> ready[] (UNBLOCK class,
#    next_agent=agent-father via agent-md-factory): system-auditor signal-write
#    targets .signal_queue[N] numeric keys instead of .signal_queue.rows[] so
#    findings land at orphan keys invisible to PO triage (swallowed C-08 ~1.5d +
#    rag-service degraded this tick). DISTINCT FROM FIX-AUDITOR-EMIT-SCHEMA-DRIFT-
#    BUSDARK (done_verified) which fixed the ROW SHAPE, not the WRITE TARGET KEY.
# M3 FLIP the 4 triaged-this-tick signal_queue.rows NEW -> TRIAGED with disposition
#    notes (sau-c08 -> M1, orphankey-writebug -> M2, rag-OOM -> backlog ranked,
#    macro-fetch-cluster + health-idle + d4-collision -> backlog ranked/already-tracked).
#
# Idempotent: M1 promote guarded by non-backlog membership; M2 mint id-guarded;
# M3 flip guarded by current status==NEW.
# Atomic temp -> [ -s ] -> jq empty -> conservation -> placement -> rename.
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" \
#   -f scripts/po-s110-orphan-cowrite-promote-auditor-writebug-mint.jq \
#   docs/data/orch/orch-state.json

def in_nonbacklog($id):
  ([.task_board.ready, .task_board.in_progress, .task_board.review,
    .task_board.done, .task_board.done_verified] | add // [])
  | any(.[]?; (.id // "") == $id);

# ---- M1: promote orphan-root FIX backlog -> ready (escalate priority) ----
(if (in_nonbacklog("FU-ALERT-COWRITE-SCHEDULER-JOBS")) then .
 else
   ( [.task_board.backlog[]? | select(.id == "FU-ALERT-COWRITE-SCHEDULER-JOBS")] ) as $rows
   | if ($rows | length) == 0 then .
     else
       .task_board.backlog |= map(select(.id != "FU-ALERT-COWRITE-SCHEDULER-JOBS"))
       | .task_board.ready += [ ($rows[0]
           + { status: "READY",
               priority: "high",
               next_agent: "dev-mcp-server",
               promoted_at: $now,
               promoted_by: "po-s110",
               live_evidence: "Router RAW-verified 2026-06-19T17:15Z named-vol market.db: 33 orphaned / 119 alerts-24h (was 63 06-18, 103 06-13). Recurring + currently real. C-08 source signal sau-c08-202606180038.",
               promotion_note: "Dependency FIX-ALERT-ORPHAN-CORRELATION shipped (7cbca67a/556eb214). 3 scheduler jobs (taAlertScanJob/bbAlertScanJob/foreignFlowAlertJob) INSERT INTO alerts directly, skipping storeAlerts co-write -> genuine orphans. DoD: route all 3 through storeAlerts atomic alert->agent_signals co-write; live-verify orphan-delta -> ~0 on named-vol DB; generic all tickers." } ) ]
     end
 end)

# ---- M2: mint auditor signal-write wrong-key UNBLOCK -> ready ----
| (if ([.task_board.ready, .task_board.in_progress, .task_board.review,
        .task_board.done, .task_board.done_verified, .task_board.backlog]
       | add // [] | any(.[]?; (.id // "") == "FIX-AUDITOR-SIGNAL-WRITE-WRONG-KEY"))
   then .
   else
     .task_board.ready += [ {
       id: "FIX-AUDITOR-SIGNAL-WRITE-WRONG-KEY",
       type: "UNBLOCK",
       title: "system-auditor signal-write targets .signal_queue[N] numeric keys instead of .signal_queue.rows[] -> findings invisible to PO triage",
       status: "READY",
       owner: "po",
       next_agent: "agent-father",
       route_to: "agent-father",
       route_via: "agent-md-factory",
       priority: "high",
       size: "S",
       zone: "docs/agents/system-auditor",
       created_at: $now,
       created_by: "po-s110",
       source_signal: "router-auditor-orphankey-writebug-20260619T1715Z",
       desc: "ROOT CAUSE (meta-bug): system-auditor signal emit/append step writes to .signal_queue[N] (numeric key) instead of .signal_queue.rows[] array. Findings land at orphan keys the PO signal-dashboard pre-check never scans -> SILENTLY SWALLOWED. Confirmed swallowed: C-08 db-breach (06-18, ~1.5d invisible) + rag-service degraded (this tick) + legacy junk keys 0/1/2. DISTINCT FROM FIX-AUDITOR-EMIT-SCHEMA-DRIFT-BUSDARK (done_verified) which corrected the ROW SHAPE, NOT the write-target KEY. Definitif fix via agent-md-factory then agent-father: correct the emit step in signal-dashboard skill (.claude/skills/signal-dashboard/SKILL.md § WRITE) and/or system-auditor flow to append to .signal_queue.rows += [row], PLUS a post-write self-check that asserts the row is readable back in .signal_queue.rows[] (fail-loud if not). Generic — keys on the write contract, no per-finding hardcode.",
       verification_gate: "After fix: a fresh system-auditor finding appears in .signal_queue.rows[] (NOT a numeric orphan key) AND the post-write self-check passes; PO signal-dashboard READ surfaces it. No new orphan-key writes for 7d.",
       dod: "Emit/append step writes .signal_queue.rows += [row]; post-write read-back self-check asserts membership; agent-md-factory SSOT/DRY honored; no .signal_queue[N] numeric-key writes remain."
     } ]
   end)

# ---- M3: flip triaged-this-tick signal rows NEW -> TRIAGED ----
| .signal_queue.rows |= map(
    if (.status == "NEW") and ((.id // "") | IN(
        "sau-c08-202606180038",
        "router-auditor-orphankey-writebug-20260619T1715Z",
        "sau-20260619T170803Z",
        "devteam-20260619T170200Z-macro-fetch-cluster",
        "devteam-20260619T170637Z-health-idle-vs-crash",
        "devteam-20260619T170637Z-d4-id-collision"))
    then . + {
      status: "TRIAGED",
      triaged_at: $now,
      triaged_by: "po-s110",
      disposition: (
        if .id == "sau-c08-202606180038"
          then "DISPATCHED via M1 FU-ALERT-COWRITE-SCHEDULER-JOBS (orphan root) -> ready/dev-mcp-server."
        elif .id == "router-auditor-orphankey-writebug-20260619T1715Z"
          then "DISPATCHED via M2 FIX-AUDITOR-SIGNAL-WRITE-WRONG-KEY -> ready/agent-father (agent-md-factory)."
        elif .id == "sau-20260619T170803Z"
          then "RANKED backlog: rag-service OOM-cycle (MEDIUM) overlaps FU-RAG-DEPLOY-MEMORY + RAG-SERVICE-AVAIL-01-FIX; WIP<=2 this tick consumed by 2 HIGH roots. Cap-bump (~1.5GB) is an ops/infra change; growth-investigation is dev-rag-service. Pick up next free slot."
        elif .id == "devteam-20260619T170200Z-macro-fetch-cluster"
          then "RANKED backlog: 5-finding cluster needs PO scoping into separate FIX tasks (DJIA/WTI stale store; Reuters/TE circuit-open; FRED_API_KEY unset; SBV zero-mask; foreign-flow primary dead). Multi-owner, not blind-dispatch. Scope next tick."
        elif .id == "devteam-20260619T170637Z-health-idle-vs-crash"
          then "RANKED backlog: P1 health-recheck queue=0+active=IDLE-not-CRASH; owner=health-recheck RemoteTrigger prompt (router-updatable, NOT a dev coding lane). matches project_health_recheck_trigger + feedback_bctc_lastpush_age_misread_as_crash."
        else
          "RANKED backlog: P2 D4 signal-id collision already tracked as FU-AUDITOR-D4-SIGNAL-ID; durable fix overlaps M2 signal-dashboard write-path work. Fold/sequence after M2."
        end)
    }
    else . end)

# ---- metadata bump ----
| .task_board._updated_at = $now
| .task_board._updated_by = "po-s110"
