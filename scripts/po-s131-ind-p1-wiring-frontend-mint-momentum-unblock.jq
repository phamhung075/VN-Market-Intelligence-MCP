# =============================================================================
# scripts/po-s131-ind-p1-wiring-frontend-mint-momentum-unblock.jq
# =============================================================================
# Sprint: MARKET-INDICATOR-DEPTH-P0 (P1 phase scoping — po lane)
# Origin: 2026-06-30 — router spawned po to own the P1 continuation after the P0
#         umbrella reached done_verified (7 deliverables done[] dv=true
#         lg=LIVE_VERIFIED; OHLCV-BACKFILL-P0 + P0-2-FOREIGN-ROOM-SUITE LIVE).
#
# SINGLE-PASS triple-mutation P1-phase grooming (idempotent, indicator-lane ONLY):
#
#   M1a MINT  IND-P1-FRONTEND-GAUGE-CARDS  -> backlog[] (BACKLOG / plan_only:true)
#             — the 2nd of the two po-signoff follow-ups; PLAN-ONLY for next tick.
#   M1b MINT  IND-P1-CONSUMER-WIRING-AUDIT -> ready[]   (READY / plan_only:false)
#             — the 1st follow-up AND the SEQUENCING decision: promoted as the
#               FIRST P1 sub-wave (CORE of the user's "more indices so helper
#               agents analyze better" intent — tools shipping != agents using).
#               Carries the LIVE grep audit ground truth (0/6 flows consume the
#               5 new P0 tools) + a recommended per-flow wiring_map.
#   M2  UNBLOCK 4 gated backlog rows in-place (gated:null + unblocked_* stamps):
#             IND-P1-ROC-MOMENTUM / IND-P1-RELATIVE-STRENGTH /
#             IND-P1-52W-HIGH-PROXIMITY  (OHLCV-BACKFILL-P0 gate cleared) +
#             IND-P1-FOREIGN-ACCUM-RANK  (P0-2-FOREIGN-ROOM-SUITE gate cleared).
#             They STAY PLAN-ONLY BACKLOG — unblocking != promoting; sequenced
#             AFTER consumer-wiring on a future planning tick.
#
# The canonical .head is DELIBERATELY untouched (the live dev-team anomaly loop,
# session 693817d0/router, owns it on BA-DEFERRED-SCHEDULER — a DIFFERENT lane).
#
# IDEMPOTENT: M1 id-guarded across ALL board lanes; M2 marker-guarded on
#   absence of `unblocked_at`. Re-run (e.g. after an orch-apply CAS exit-2
#   retry) mutates 0.
#
# USAGE:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s131-ind-p1-wiring-frontend-mint-momentum-unblock.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#   (orch-apply.sh validates Zod + dup-key + CAS-mtime, then atomic-renames;
#    exit 2 = CAS retry — re-run the same pipe.)
# =============================================================================

# All task ids currently on the board (any lane) — for the M1 id-guard.
def all_ids:
  [ (.task_board.backlog, .task_board.ready, .task_board.in_progress,
     .task_board.review, .task_board.done, .task_board.done_verified,
     .task_board.qa)[]? | objects | .id ];

(all_ids) as $ids

# ── M1a — MINT FRONTEND-GAUGE-CARDS into backlog[] (id-guarded) ──────────────
| (if ($ids | index("IND-P1-FRONTEND-GAUGE-CARDS")) then .
   else .task_board.backlog += [ {
     "id": "IND-P1-FRONTEND-GAUGE-CARDS",
     "tier": "P1",
     "title": "Frontend gauge cards for the 6 new P0 scalars (rv_20d_percentile, foreign_outflow_z_5d, news_sentiment_z, insider net_sentiment_score, breadth_z_score, liquidity_stress_score) under the freshness-badge program",
     "owner": "dev-frontend",
     "zone": "apps/frontend",
     "priority": "medium",
     "status": "BACKLOG",
     "plan_only": true,
     "sprint": "MARKET-INDICATOR-DEPTH-P0",
     "roadmap_ref": "docs/roadmaps/vn-market-indicator-roadmap.md",
     "created_by": "po",
     "created_at": $now,
     "scalars": ["rv_20d_percentile","foreign_outflow_z_5d","news_sentiment_z","insider net_sentiment_score","breadth_z_score","liquidity_stress_score"],
     "scope": "Add 6 gauge cards sourced from the LIVE P0 tools (get_volatility_indicators.rv_20d_percentile; foreign-room suite foreign_outflow_z_5d; get_market_sentiment_index news_sentiment_z; insider tool net_sentiment_score; get_breadth_thrust breadth_z_score; get_vn_liquidity_state liquidity_stress_score). Register each in docs/data/frontend-data-coverage-map.json with data_asof wiring.",
     "freshness_program": "project_frontend_freshness_transparency — SSOT docs/data/frontend-data-coverage-map.json; each card: 'Cập nhật lúc' badge from data_asof, source-link + detail dropdown (project_all_info_source_link_dropdown_recheck), NEVER baked/client-now time; honest-NULL -> show null_reason not a fake value.",
     "depends_polish": "Folds the P3 gauge-contract polish from sprint-MARKET-INDICATOR-DEPTH-P0-po.md FOLLOW-UPS: (i) rv_20d_percentile scalar lacks co-located unit/confidence/null_reason (volatility proxy adds only source_tier+fetched_at) — backend technical-analysis/mcp-server; (ii) omo_curve absent from liquidityStateTools Zod schema (raw passthrough bypasses Zod). Cards surface unit/confidence/null_reason where present; backend polish (i)+(ii) may need a sibling dev fix before honest confidence can render.",
     "sequence_note": "PLAN-ONLY — sequenced AFTER IND-P1-CONSUMER-WIRING-AUDIT (agents-first per user intent). Promote on a future planning tick."
   } ] end)

# ── M1b/M3 — MINT CONSUMER-WIRING-AUDIT into ready[] (id-guarded) ────────────
# Materialized as a backlog-schema row AND promoted to ready[] as the first P1
# sub-wave (sequencing decision). next_agent=cowork-refactory-expert; the live
# dev-team router will PRE-CLAIM + spawn on its next triage tick.
| (if ($ids | index("IND-P1-CONSUMER-WIRING-AUDIT")) then .
   else .task_board.ready += [ {
     "id": "IND-P1-CONSUMER-WIRING-AUDIT",
     "tier": "P1",
     "title": "Consumer-Wiring Audit — wire the 5 LIVE P0 indicator tools into the 6 helper-agent flows (tools shipping != agents using them; the CORE of the user's 'more indices so the helper agents analyze the market better' intent)",
     "owner": "cowork-refactory-expert",
     "zone": "cross-service",
     "priority": "high",
     "status": "READY",
     "plan_only": false,
     "sprint": "MARKET-INDICATOR-DEPTH-P0",
     "roadmap_ref": "docs/roadmaps/vn-market-indicator-roadmap.md",
     "created_by": "po",
     "created_at": $now,
     "next_agent": "cowork-refactory-expert",
     "materialized_as": "backlog-schema row, promoted to ready[] as the FIRST P1 sub-wave (po sequencing decision, po-s131)",
     "promoted_at": $now,
     "promoted_by": "po",
     "audit_finding": "LIVE grep audit 2026-06-30 (po): 0/6 consumer flows reference ANY of get_volatility_indicators / get_market_sentiment_index / get_foreign_room / get_breadth_thrust / get_vn_liquidity_state. TOTAL wiring gap — the P0 tools deliver ZERO analyst value until wired. NOTE: market-analyst references no gateway/market tools at all in its flow tree (verify its tool-call mechanism first); the other 5 flows DO call gateway market tools but NONE the new P0 set.",
     "new_p0_tools": ["get_volatility_indicators","get_market_sentiment_index","get_foreign_room (foreign-room suite)","get_breadth_thrust","get_vn_liquidity_state (omo_curve / liquidity-stress field)"],
     "consumer_flows": ["market-analyst","market-watcher","news-scout","unified-agent (CHEF)","digest-predict","alert-commander"],
     "wiring_map": {
       "market-analyst": ["get_volatility_indicators","get_breadth_thrust","get_market_sentiment_index","get_foreign_room"],
       "market-watcher": ["get_volatility_indicators","get_breadth_thrust","get_vn_liquidity_state"],
       "news-scout": ["get_market_sentiment_index"],
       "unified-agent": ["get_volatility_indicators","get_market_sentiment_index","get_foreign_room","get_breadth_thrust"],
       "digest-predict": ["get_volatility_indicators","get_breadth_thrust"],
       "alert-commander": ["get_volatility_indicators","get_vn_liquidity_state","get_foreign_room"]
     },
     "generic_mandate": "For EACH of the 6 flows: (1) RAW-verify (grep the flow .md tree) which gateway tools it currently calls; (2) wire the verified new P0 tool(s) into the flow's analysis step via the gateway call_tool wrapper (server=vn-market, bare tool name); (3) honest-NULL handling — a tool may return honest-NULL/honest-error (breadth accrues forward, net_outstanding can be blocked_reason NULL); the flow MUST degrade gracefully and NEVER fabricate; (4) Vietnamese only for FB/MARKET output text, English for work. wiring_map is a RECOMMENDATION — do NOT add a tool to a flow where it has no analytical purpose.",
     "verification_gate": "Sprint success_metric: 'each indicator consumed by >=1 helper agent'. PASS when: each of the 5 new P0 tools is called by >=1 helper flow (grep shows the tool name in the flow .md); each wired call has a graceful honest-NULL path; no fabrication; the cowork team flows still pass their own gates."
   } ] end)

# ── M2 — UNBLOCK 4 now-ungated backlog rows in-place (marker-guarded) ────────
| .task_board.backlog |= map(
    if (.id == "IND-P1-ROC-MOMENTUM" or .id == "IND-P1-RELATIVE-STRENGTH" or .id == "IND-P1-52W-HIGH-PROXIMITY")
       and (has("unblocked_at") | not)
    then . + {
      "gated": null,
      "unblocked_at": $now,
      "unblocked_by": "po",
      "unblocked_note": "OHLCV-BACKFILL-P0 is LIVE_VERIFIED (done[] dv=true lg=LIVE_VERIFIED, router RAW-verified 2026-06-30). OHLCV-backfill gate cleared. STAYS PLAN-ONLY BACKLOG — unblocking != promoting; sequenced AFTER IND-P1-CONSUMER-WIRING-AUDIT; promote on a future planning tick (po-s131)."
    }
    elif (.id == "IND-P1-FOREIGN-ACCUM-RANK") and (has("unblocked_at") | not)
    then . + {
      "gated": null,
      "unblocked_at": $now,
      "unblocked_by": "po",
      "unblocked_note": "P0-2-FOREIGN-ROOM-SUITE is LIVE_VERIFIED (done[] dv=true lg=LIVE_VERIFIED, router RAW-verified 2026-06-30). 'P0 Foreign-Room suite live' gate cleared. STAYS PLAN-ONLY BACKLOG — sequenced AFTER consumer-wiring; promote on a future planning tick (po-s131)."
    }
    else . end
  )

# ── metadata bump (existing keys only — no new root/task_board keys) ─────────
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po:s131:ind-p1-phase-scope"
| ._updated_at = $now
| ._updated_by = "po:s131:ind-p1-phase-scope"
