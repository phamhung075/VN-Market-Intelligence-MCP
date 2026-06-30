# =============================================================================
# scripts/po-s132-ind-p1-momentum-ba-mint-frontend-promote.jq
# =============================================================================
# PO planning-tick triage — fires once the IND-P1-CONSUMER-WIRING-AUDIT gate is
# done_verified (commit 3fd6e151: 5 P0 indicator tools LIVE-consumed by 6 helper
# flows). The consumption pattern PROVED OUT, so the PLAN-ONLY P1 momentum
# sub-wave + the frontend gauge-cards (held "promote on a future planning tick
# (po-s132)") are now sequenced and promoted.
#
# Single-pass triple-mutation, all idempotent:
#   M1  MINT one BA spec task BA-IND-P1-MOMENTUM-RS -> ready[] (next_agent=ba,
#       zone=multi) covering the 4 NEW backend momentum/relative-strength
#       indicator tools. id-guarded (skip if id already in any non-backlog lane).
#   M2  ANNOTATE-IN-PLACE the 4 IND-P1-* momentum child rows in backlog[] with
#       specced_under=BA-IND-P1-MOMENTUM-RS (they STAY BACKLOG — pm decomposition
#       under the BA spec mints the real per-tool dev tasks; the placeholders must
#       NOT be dispatched directly). marker-guarded (skip if specced_under present).
#   M3  PROMOTE IND-P1-FRONTEND-GAUGE-CARDS backlog[] -> ready[] (status=READY,
#       next_agent=dev-frontend). Disjoint zone (apps/frontend) + agent from the
#       backend sub-wave -> parallel-eligible, no WIP contention. id-guarded.
#
# Top-level .head is DELIBERATELY UNTOUCHED — it carries a pending
# BA-DEFERRED-SCHEDULER handoff (separate in-flight concern); the router
# continues THIS cascade from the PO RETURN block's NEXT, not from .head.
#
# Conservation (first run): ready +2, backlog -1, in_progress/review/done/
#   done_verified byte-stable, total entries +1 (net BA mint). Re-run: delta 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s132-ind-p1-momentum-ba-mint-frontend-promote.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply.sh does Zod + dup-key + CAS-mtime + atomic rename; the calling
#  harness adds placement + conservation asserts on the candidate before apply.)
# =============================================================================

def momentum_ids: ["IND-P1-ROC-MOMENTUM","IND-P1-RELATIVE-STRENGTH","IND-P1-52W-HIGH-PROXIMITY","IND-P1-FOREIGN-ACCUM-RANK"];

def in_nonbacklog($id):
  ([ .task_board.ready[]?, .task_board.in_progress[]?, .task_board.review[]?,
     .task_board.done[]?, .task_board.done_verified[]? ]
   | map(if type=="string" then . else (.id // "") end)
   | index($id)) != null;

# --- M1: mint BA spec into ready[] (id-guarded) ---
(if in_nonbacklog("BA-IND-P1-MOMENTUM-RS") then .
 else .task_board.ready += [{
   id: "BA-IND-P1-MOMENTUM-RS",
   type: "SPRINT-M",
   tier: "P1",
   title: "BA spec — IND-P1 Momentum & Relative-Strength factor sub-wave: 4 NEW backend indicator tools (ROC-Momentum 12-1, Cross-Sectional Relative-Strength, 52W-High Proximity, Foreign-Accumulation Momentum Rank)",
   status: "READY",
   owner: "ba",
   next_agent: "ba",
   zone: "multi",
   priority: "medium",
   sprint: "MARKET-INDICATOR-DEPTH-P0",
   roadmap_ref: "docs/roadmaps/vn-market-indicator-roadmap.md",
   created_by: "po-s132",
   created_at: $now,
   children: momentum_ids,
   scope: "Spec 4 new derived indicator tools (all † gates now CLEARED — OHLCV backfill + Foreign-Room suite LIVE_VERIFIED 2026-06-30): (1) get_roc_momentum — Multi-Horizon ROC Momentum Factor 12-1 Jegadeesh-Titman skip-month, z-score/decile, factor-return series (closes DP backtest/Brier req); (2) get_relative_strength — Cross-Sectional RSC percentile 63/126/252d + Mansfield RS; (3) 52W-High Proximity + Net-New-Highs — %-from-52w-high/low, %>MA50/MA200, net-new-highs line; (4) Foreign-Accumulation Momentum Rank — ADTV-normalized 5/20d foreign net-flow z-rank + room_exhaustion flag (shares Foreign-Room suite). Source roadmap §3 P1 entries verbatim.",
   contract: "HARD no-fake-data gate (roadmap top-rule): every value computed from data already on hand / already fetched (Tier 1-3 real). Honest-NULL on absent source — same contract the 5 P0 tools hold (return null + blocked_reason/null_reason, NEVER a fabricated distribution). Each tool ships a gauge scalar + source_tier + fetched_at, and (folding the P0 FOLLOW-UP) co-located unit/confidence/null_reason.",
   cascade: "BA spec -> architect blueprint (MUST SPLIT multi-zone: 3x apps/technical-analysis [ROC, RS, 52W] + 1x apps/stock-price [Foreign-Accum-Rank]) -> pm decomposition into per-tool dev tasks (supersedes the 4 IND-P1-* placeholders) -> dev -> qa. Full gate IN EFFECT (roadmap §6) — genuinely new analytical features.",
   consumer_intent: "Serves the user STANDING intent 'more indices so the helper agents analyze the market better' — these are NEW indices for the analyst agents (MW/CHEF/AC/DP/TNB/NS), the direct continuation now that IND-P1-CONSUMER-WIRING-AUDIT proved the P0 consumption pattern (done_verified 3fd6e151).",
   gate_proof: "Unblocked: OHLCV-BACKFILL-P0 + P0-2-FOREIGN-ROOM-SUITE both done[] done_verified=true live_gate=LIVE_VERIFIED (router RAW-verified 2026-06-30); IND-P1-CONSUMER-WIRING-AUDIT done_verified (3fd6e151)."
 }] end)

# --- M2: annotate the 4 momentum child rows in backlog[] (marker-guarded) ---
| .task_board.backlog |= map(
    (if type=="object" then (.id // "") else "" end) as $eid
    | if ((momentum_ids | any(. == $eid))) and (type=="object") and (has("specced_under")|not)
    then . + {
      specced_under: "BA-IND-P1-MOMENTUM-RS",
      promoted_to_ba_at: $now,
      promoted_to_ba_by: "po-s132",
      hold_note: "Specced under BA-IND-P1-MOMENTUM-RS — STAYS BACKLOG; pm decomposition under the BA spec mints the real per-tool dev task. Do NOT dispatch this placeholder directly."
    }
    else . end)

# --- M3: promote FRONTEND-GAUGE-CARDS backlog -> ready (id-guarded) ---
| (if in_nonbacklog("IND-P1-FRONTEND-GAUGE-CARDS") then .
   else
     ([ .task_board.backlog[] | select(type=="object" and ((.id // "")=="IND-P1-FRONTEND-GAUGE-CARDS")) ]) as $fc
     | if ($fc|length)==0 then .
       else
         (.task_board.ready += [ $fc[0]
            | del(.plan_only) | del(.sequence_note)
            | . + {
                status: "READY",
                next_agent: "dev-frontend",
                promoted_at: $now,
                promoted_by: "po-s132",
                parallel_eligible: true,
                parallel_note: "Disjoint zone (apps/frontend) + agent (dev-frontend) from the backend momentum sub-wave (apps/technical-analysis + apps/stock-price) -> safe to dispatch concurrently; no WIP/zone contention.",
                promote_note: "Gate met: IND-P1-CONSUMER-WIRING-AUDIT done_verified (3fd6e151) — 5 P0 tools LIVE-consumed by 6 helper flows; the 6 gauge scalars now carry REAL values worth surfacing. Honest-NULL: render null_reason where a scalar is absent, NEVER a fabricated value (project_frontend_freshness_transparency + project_all_info_source_link_dropdown). depends_polish (rv_20d_percentile unit/confidence/null_reason; omo_curve Zod) is SOFT — surface what is present; a sibling backend polish FIX may follow."
              } ])
         | .task_board.backlog |= map(select((if type=="object" then (.id // "") else "" end)!="IND-P1-FRONTEND-GAUGE-CARDS"))
       end
   end)

| .task_board._updated_at = $now
| .task_board._updated_by = "po-s132"
| ._updated_at = $now
| ._updated_by = "po-s132"
