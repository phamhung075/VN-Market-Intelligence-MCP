# po-s116-agent-signals-identical-dup-emission-mint-ack.jq
#
# Single-pass DB-sweep triage (PLAN-ONLY, project_anomaly_task_bridge) for the
# router 2231Z r5 finding: agent_signals SYSTEMIC truly-identical duplicate rows
# (genuine double-EMISSION reaching the data layer):
#   M1  id-guarded MINT of 1 BACKLOG FIX task FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION
#       (P2, NEVER promoted to ready[]) carrying the RAW LIVE evidence + a
#       "RAW-verify root cause before fix; identify ALL 5 emitters incl. the 3 cowork
#       agents; add idempotent dedup at emission (cowork + scheduler paths)" mandate
#       (corroboration gate: feedback_false_infra_failure_corroboration_gate).
#   M2  flip the originating signal_queue row NEW->READ (not RESOLVED — open until the
#       fix ships) with a triaged_into anchor pointing at the minted task id.
#
# Scope distinct from (cross-referenced, NOT duplicated):
#   - r2 FIX-SCHEDULER-DOUBLE-REGISTRATION  (mcp-server scheduler cron_job_runs symptom,
#     ONE job; this = DATA-LAYER agent_signals rows + 3 COWORK emitters outside r2 scope)
#   - FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH (alert_id orphan-FK on the
#     SAME alert-engine verified_decision emit path — coordinate roots, different defect)
#   - FACTORY-ALERT-dedup-window-config (alert dedup-window value, not row idempotency)
#   - FIX-AGENTSIGNALS-EXPIRED-GC-CRON (retention/GC, not duplicate-prevention)
#
# Idempotent:
#   - mint guarded by id-presence across ALL board lanes (re-run mints 0)
#   - signal flip guarded by status=="NEW" (re-run flips 0)
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s116-agent-signals-identical-dup-emission-mint-ack.jq docs/data/orch/orch-state.json

def all_ids:
  [ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
    .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]? ]
  | map(.id);

. as $root
| (all_ids) as $ids

# M1 — agent_signals identical-dup double-emission (MEDIUM -> P2; data-layer + multi-emitter)
| ( if ($ids | index("FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION")) then {} else
    { id: "FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION",
      title: "agent_signals has SYSTEMIC truly-identical duplicate rows from genuine double-EMISSION reaching the data layer (NOT retry/upsert). LIVE RAW (named volume vn-market-intelligence-mcp_market_data, immutable=1, scan_ts 2026-06-25T22:31Z): total=4266; 102 all-time identical dup-groups (same signal_type+stock_code+minute AND same from_agent+cycle_id+payload); 43 active dup-groups last 24h (created_at>=2026-06-24).",
      type: "FIX", priority: "P2", status: "BACKLOG",
      zone: "apps/mcp-server/", owner: "developer",
      root_cause: "Two-layer: (1) NO data-layer idempotency guard on agent_signals — identical re-inserts are accepted, so any emitter double-fire corrupts the table; (2) multiple emitters genuinely double-fire. 24h dup attribution: alert-engine|verified_decision=43, freshness-sla-monitor|urgent_news=42, news-scout|chain_catalyst=3, bctc-analyst|fundamental_validation=2, system-auditor|signal_feedback=1. Sample dup pair ids 7269 & 7271 (alert-engine|verified_decision|DPM, 0.9s apart, both retry_count=0, cycle_id=NULL) => genuine double-EMISSION.",
      generic_mandate: "RAW-verify the root LIVE before any code change (re-run the GROUP BY (from_agent,signal_type,stock_code,minute-bucket,payload) HAVING COUNT(*)>1 on the named-volume DB; confirm genuine double-emission not retry/upsert) — DB-sweep finding, corroborate first (feedback_false_infra_failure_corroboration_gate). Then: (A) DATA-LAYER BACKSTOP (permanent, emitter-agnostic): add an agent_signals idempotency guard rejecting/deduping identical re-inserts keyed on (from_agent, signal_type, stock_code, payload, minute-bucket) — MUST use CREATE UNIQUE INDEX + INSERT OR IGNORE/REPLACE, NEVER ALTER TABLE ADD COLUMN ... UNIQUE which is a SILENT NO-OP in SQLite (feedback_sqlite_add_column_unique_silent_noop). (B) PER-EMITTER ROOT-CAUSE: identify ALL 5 emitters and add idempotent dedup at emission across BOTH paths — mcp-server scheduler path (freshness-sla-monitor + system-auditor; confirm shared root with r2 scheduler double-registration) AND the 3 COWORK agent paths (alert-engine, news-scout, bctc-analyst) which have their own cron/spawn double-trigger roots OUTSIDE r2's scope (r2's fix will NOT cover them). (C) VERIFY-DON'T-CLAIM: alert-engine|verified_decision dups MAY cause double Telegram alerts — CONFIRM whether verified_decision triggers a send BEFORE claiming user-facing impact; only THEN escalate to HIGH (feedback_router_verify_raw_not_badges).",
      verification_gate: "LIVE: after fix, GROUP BY (from_agent,signal_type,stock_code,minute-bucket,payload) HAVING COUNT(*)>1 returns 0 rows AND fresh cycles across BOTH the scheduler emitters and the 3 cowork emitters add no new identical dup-groups over 2 cycles; RAW-verify against named-volume DB.",
      source_signal: "router-dbsweep-20260625T2231Z-r5-agent-signals-identical-dup-doublefire",
      cross_ref: "router-dbsweep-20260625T1906Z-r2-scheduler-double-register",
      relationship_to_r2: "SAME double-fire CLASS, BROADER scope. r2 = ONE mcp-server scheduler job (vnIndexRefreshJob cron_job_runs symptom). THIS = (a) DATA-LAYER impact (duplicate agent_signals rows) and (b) 3 of 5 emitters are COWORK agents (alert-engine, news-scout, bctc-analyst) outside r2's mcp-server-scheduler scope. freshness-sla-monitor + system-auditor MAY share r2's root. NOT a dup of r2.",
      related_board: [
        "FIX-SCHEDULER-DOUBLE-REGISTRATION(backlog, r2 — mcp-server scheduler emitter root candidate, DISTINCT class)",
        "FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH(done-live-verified — SAME alert-engine verified_decision emit path implicated in the 220 orphan-alert_id finding; likely SAME emit path, coordinate roots, different defect)",
        "FACTORY-ALERT-dedup-window-config(backlog — alert dedup-window value, NOT agent_signals row idempotency)",
        "FIX-AGENTSIGNALS-EXPIRED-GC-CRON(backlog — retention/GC, NOT duplicate-prevention)"
      ],
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY (project_anomaly_task_bridge): minted BACKLOG, NOT promoted to ready (WIP=0). PRIORITY P2; escalate to HIGH ONLY if Telegram double-send is CONFIRMED. Do NOT fold into r2 (different table + cowork emitters)."
    } end ) as $t1

# --- M1 apply: append non-empty mint to backlog ---------------------------------
| .task_board.backlog += ([$t1] | map(select(. != {})))

# --- M2 apply: flip the originating signal row NEW -> READ with triaged_into ------
| .signal_queue.rows |= map(
    if (.id == "router-dbsweep-20260625T2231Z-r5-agent-signals-identical-dup-doublefire") and .status == "NEW" then
      .status = "READ"
      | .triaged_at = $now
      | .triaged_by = "po"
      | .triaged_into = "FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION"
      | .po_decision = "MINTED BACKLOG FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION (P2, PLAN-ONLY) — own task, NOT folded into r2. Scope: data-layer agent_signals idempotency backstop (CREATE UNIQUE INDEX/upsert, NOT ALTER ADD UNIQUE) + per-emitter roots for ALL 5 emitters incl. the 3 COWORK agents (alert-engine, news-scout, bctc-analyst) outside r2's mcp-server-scheduler scope. Cross-refs r2 (scheduler emitter root) + FIX-ALERT-ENGINE-VERIFIED-DECISION-ALERTID-UUID-MISMATCH (same alert-engine emit path). RAW-verify-first; escalate to HIGH only if Telegram double-send confirmed. READ not RESOLVED (open until fix ships)."
    else . end )

# --- metadata bump --------------------------------------------------------------
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-s116"
