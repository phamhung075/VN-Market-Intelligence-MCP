# scripts/po-s133-ind-p1-momentum-consumer-wiring-mint-nextwave-rank.jq
# ---------------------------------------------------------------------------
# Single-pass DUAL-mutation PLAN-ONLY triage (idempotent):
#   M1  id-guarded MINT of IND-P1-MOMENTUM-CONSUMER-WIRING -> .task_board.backlog[]
#       (status=BACKLOG, owner+next_agent=cowork-refactory-expert, zone=cross-service)
#       — closes the AC6 P1 consumer-wiring gap left open by the P0-only
#         IND-P1-CONSUMER-WIRING-AUDIT (done_verified). Carries a per-flow
#         wiring_map + generic_mandate + ACs + verification_gate.
#   M2  ANNOTATE-IN-PLACE the IND-ROADMAP-LEDGER backlog row with the
#       next_wave_ranking (16 remaining IND-P1/P2 rows ranked by analytical
#       value-per-effort) — marker-guarded (only added if absent).
#
# Originated 2026-06-30 (po-s133) at the IND-P1 momentum wave-completion
# boundary. Reusable pattern for "a wave shipped tools but left an AC6
# consumer-wiring gap untracked on the board + the next indicator wave needs a
# recorded priority order — mint the wiring task BACKLOG (cowork-refactory
# path, NOT a dev-* zone) and stamp the ranked sequence onto the roadmap
# ledger SSOT, plan-only (PO does NOT promote or spawn)".
#
# Idempotent: M1 id-guarded across ALL lanes; M2 marker-guarded
# (has("next_wave_ranking")) -> re-run mutates 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s133-ind-p1-momentum-consumer-wiring-mint-nextwave-rank.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply.sh does Zod + dup-key + CAS-mtime + atomic rename.)
# ---------------------------------------------------------------------------

# --- M1 candidate task ------------------------------------------------------
({
  "id": "IND-P1-MOMENTUM-CONSUMER-WIRING",
  "tier": "P1",
  "title": "AC6 P1 Consumer-Wiring — wire the 4 LIVE P1 momentum/RS tools (get_roc_momentum / get_relative_strength / get_52w_proximity / get_foreign_accum_rank) into the helper-agent flows. Closes the AC6 gap left OPEN by IND-P1-CONSUMER-WIRING-AUDIT (which wired the 5 P0 tools ONLY). Tools shipping != agents using them — the CORE of the user's 'more indices so the helper agents analyze the market better' intent.",
  "owner": "cowork-refactory-expert",
  "zone": "cross-service",
  "priority": "high",
  "status": "BACKLOG",
  "plan_only": false,
  "type": "FIX",
  "sprint": "MARKET-INDICATOR-DEPTH-P0",
  "roadmap_ref": "docs/roadmaps/vn-market-indicator-roadmap.md",
  "created_by": "po",
  "created_at": $now,
  "next_agent": "cowork-refactory-expert",
  "depends": ["IND-P1-CONSUMER-WIRING-AUDIT", "BA-IND-P1-MOMENTUM-RS"],
  "audit_finding": "P1 momentum suite (5 tasks) reached done[] qa-APPROVED 2026-06-30 (reports/TASK_REPORT_IND-P1-MOMENTUM-SUITE.md). The 4 MCP proxy tools are LIVE-callable but AC6 ('tool consumed by >=1 helper agent') is an OPEN TRACKED GAP: IND-P1-CONSUMER-WIRING-AUDIT (done_verified, commit 7832cc1f) wired the 5 P0 tools ONLY. 0/6 helper flows currently reference get_roc_momentum / get_relative_strength / get_52w_proximity / get_foreign_accum_rank. Until wired, the 4 P1 tools deliver ZERO analyst value — the exact 'tools exist but agents do not consume them' failure the user named.",
  "new_p1_tools": [
    "get_roc_momentum (#181) — multi-horizon ROC momentum factor 12-1, momentum_factor_z + per-ticker decile",
    "get_relative_strength (#182) — cross-sectional RSC percentile (63/126/252d) + market_rs_composite + low_sample_warning",
    "get_52w_proximity (#183) — %-from-52w-high/low, pct_above_ma200, net-new-highs line",
    "get_foreign_accum_rank (#184) — ADTV-normalized 5/20d foreign net-flow z-rank + room_exhaustion + foreign_accum_z_market"
  ],
  "wiring_map": {
    "market-watcher": ["get_roc_momentum", "get_relative_strength", "get_52w_proximity", "get_foreign_accum_rank"],
    "unified-agent": ["get_roc_momentum", "get_relative_strength", "get_52w_proximity", "get_foreign_accum_rank"],
    "alert-commander": ["get_relative_strength", "get_52w_proximity", "get_foreign_accum_rank"],
    "digest-predict": ["get_roc_momentum", "get_relative_strength"],
    "news-scout": ["get_foreign_accum_rank"],
    "tran-ngoc-bau": ["get_relative_strength"]
  },
  "wiring_map_rationale": "Per roadmap §3 P1 consuming-agent legend: ROC=DP·CHEF·MW; Relative-Strength=MW·CHEF·AC·DP·TNB; 52W-Proximity=MW·AC·CHEF; Foreign-Accum-Rank=MW·CHEF·AC·NS. market-watcher + unified-agent(CHEF) are the full-stack consumers (scan + synthesis) -> all 4. alert-commander gets the 3 alert-relevant (RS/52W/foreign-accum, NOT ROC). digest-predict gets ROC (closes its backtest/Brier momentum-factor requirement) + RS. news-scout gets foreign-accum (foreign-flow context for news). tran-ngoc-bau gets RS. market-analyst EXCLUDED pending its tool-call-mechanism verification (P0 audit flagged it references no gateway market tools). NOTE: 'fear-greed-gauge' is NOT an agent — it is the not-yet-built get_vn_fear_gauge TOOL (IND-P1-FEAR-GREED, BACKLOG); it cannot be a consumer.",
  "generic_mandate": "For EACH flow in wiring_map: (1) RAW-verify (grep the flow .md tree) the existing analysis/indicator step + the gateway tools it already calls; (2) wire the recommended new P1 tool(s) into that step via the gateway call_tool wrapper (server='vn-market', BARE tool name) — additive only, mirror the P0 pattern already in market-watcher/flow/cycle.md Step '2. Market indicators'; (3) the flow's cycle OUTPUT must CITE the reading with direction + delta when material (e.g. 'RS rank rising +12 pct-ile 5d' / 'ROC momentum_factor_z=+1.4 (strong)' / '52w-proximity 3% below high' / 'foreign-accum z-rank top-decile, room_exhaustion=false'); (4) honest-NULL is the DESIGNED PASS state — these tools return null + null_reason / low_sample_warning:true when history is insufficient (the † tools need 252/273 bars; OHLCV backfill still accruing). The flow MUST degrade gracefully: log '[SKIP] <tool> unavailable' and continue, NEVER fabricate; (5) language boundary — Vietnamese for FB/MARKET output, English for internal work. wiring_map is a RECOMMENDATION — do NOT add a tool to a flow where it has no analytical purpose.",
  "acceptance": [
    "AC-1: each of the 4 P1 tools is called by >=1 helper flow (grep shows the bare tool name in the flow .md tree).",
    "AC-2: each wired flow's cycle output CITES the relevant momentum/RS reading with direction+delta when material (not fetched silently).",
    "AC-3: every wired call has a graceful honest-NULL / [SKIP] path — verified by reading the guard; no fabricated fallback value.",
    "AC-4: zero dead field names — every field the flow reads exists in the LIVE tool payload (probe the tool or read the Go/TS source).",
    "AC-5: additive-only diff (no behavior regression); each cowork flow still passes its own gate.",
    "AC-6 (closes umbrella AC6): success_metric 'each P1 indicator consumed by >=1 helper agent' is GREEN."
  ],
  "verification_gate": "PASS when AC-1..AC-6 all GREEN: router RAW-greps the 6 flow trees and confirms each of the 4 P1 tools appears in >=1 flow with (a) a graceful honest-NULL guard and (b) an output-citation with direction+delta; no fabrication; field names matched to LIVE payloads.",
  "notes": "Mirror the proven P0 pattern (IND-P1-CONSUMER-WIRING-AUDIT, done_verified 2026-06-30, commit 7832cc1f — 64ins/7del additive across 6 flows). These are cowork agent .md FLOW changes, not service code -> route through the cowork-refactory-expert / agent-md path, NOT a dev-* zone specialist. Status=BACKLOG: next PO planning tick (or dev-team triage) promotes backlog->ready; PO does NOT spawn the cascade here (plan-only)."
}) as $T

# --- M2 ranked next-wave sequence ------------------------------------------
| ({
  "recorded_by": "po",
  "recorded_at": $now,
  "method": "ranked by analytical value-per-effort: (a) distinct blind-surface coverage, (b) no-fake-data readiness / data-on-hand, (c) build risk & effort, (d) unblocks the composite. Source: docs/roadmaps/vn-market-indicator-roadmap.md §3-§4 + post-Sprint-0 OHLCV-backfill-LIVE state.",
  "next_wave_to_sprint": ["IND-P1-VN-YIELD-CURVE", "IND-P1-SECTOR-RRG", "IND-P1-FEAR-GREED"],
  "stretch_fourth": "IND-P1-VN30F-BASIS",
  "ranked": [
    {"rank": 1, "id": "IND-P1-VN-YIELD-CURVE", "effort": "M", "consumers": "MW·DP·CHEF·AC·TNB", "data_readiness": "TradingEconomics VN 10Y live + existing scraper +1 slug", "rationale": "Closes NAMED biggest-gap §2.4 (no domestic risk-free curve / true equity cost-of-capital + ERP). Cheapest real path, broadest consumer set (5). Highest value-per-effort."},
    {"rank": 2, "id": "IND-P1-SECTOR-RRG", "effort": "L", "consumers": "MW·CHEF·DP·TNB", "data_readiness": "pure T3 from now-backfilled OHLCV(126d)+sector map — no new fetch", "rationale": "Closes §2.3 (zero sector-rotation visibility today). Cleanest no-fake-data (data on hand). Biggest NEW analytical surface."},
    {"rank": 3, "id": "IND-P1-FEAR-GREED", "effort": "M", "consumers": "all", "data_readiness": "4/6 legs LIVE (RV pctile, breadth, foreign-outflow z, news z from P0)", "rationale": "Single 0-100 synthesis dial — highest leverage for ALL agents + frontend gauge. Ship PHASED now with honest-NULL on the 2 unbuilt legs (floor-lock=LIMIT-LOCK, VN30F basis), auto-enriches as they land. Roadmap says BUILD-LAST but it does NOT hard-depend on the missing legs (honest-caveat path)."},
    {"rank": 4, "id": "IND-P1-VN30F-BASIS", "effort": "M", "consumers": "AC·MW·CHEF·DP", "data_readiness": "NEW VnDirect dchart UDF fetch via VPS + roll handling", "rationale": "The ONLY listed-derivatives positioning/fear proxy (VN has no options). Distinct surface + a FEAR-GREED leg. Higher build risk (new fetch + roll)."},
    {"rank": 5, "id": "IND-P1-RISK-DECOMPOSITION", "effort": "M", "consumers": "DP·TNB·CHEF·AC", "data_readiness": "T1 OHLCV (backfilled)", "rationale": "Beta/downside-beta/correlation + effective-N concentration; rising systemic rho = panic precursor (distinct early-warning)."},
    {"rank": 6, "id": "IND-P1-LIMIT-LOCK", "effort": "S-M", "consumers": "AC·MW·CHEF", "data_readiness": "market-level from get_market_breadth on hand; per-stock needs new persisted ref/ceiling/floor series", "rationale": "Floor/ceiling lock ratio. Market-level leg is P0-cheap AND a FEAR-GREED leg — cheap win that unblocks the composite's floor-lock leg."},
    {"rank": 7, "id": "IND-P1-REGIONAL-DECOUPLING", "effort": "M", "consumers": "MW·DP·CHEF·AC", "data_readiness": "VN-Index local(T1)+Yahoo regional(T2); reuses correlationCalculator.ts", "rationale": "Rolling 60d beta/corr to S&P500/SHCOMP/Nikkei/MSCI-EM + decoupling score."},
    {"rank": 8, "id": "IND-P1-PROP-NET-FLOW", "effort": "M", "consumers": "MW·AC·CHEF", "data_readiness": "T2 HOSE prop report via VPS (reuses cafef.ts)", "rationale": "Proprietary (tu doanh) net flow — the third flow vector beyond foreign+retail."},
    {"rank": 9, "id": "IND-P1-PUTTHROUGH-FLOW", "effort": "M", "consumers": "NS·MW·AC", "data_readiness": "T2 VnDirect ptVolume/ptValue (same endpoint already hit)", "rationale": "Block/putthrough deal flow + putthrough_share. Low marginal fetch cost (endpoint already hit)."},
    {"rank": 10, "id": "IND-P1-CAP-TO-GDP", "effort": "M", "consumers": "DP·TNB·CHEF·MW", "data_readiness": "numerator=new exchange-wide cap fetch; denominator GSO quarterly parse-fragile", "rationale": "Buffett indicator VN-calibrated. Slower-moving macro context; denominator parse-fragility = build risk."},
    {"rank": 11, "id": "IND-P1-COMMODITY-COST", "effort": "M", "consumers": "CHEF·MW·BCTC·DP", "data_readiness": "PARTIAL (Brent/copper/FX live; HRC addable; naphtha/urea/coking-coal dropped)", "rationale": "Sector x commodity cost-pressure + negative-margin-trap flag. Ties to BCTC margin analysis."},
    {"rank": 12, "id": "IND-P1-RETAIL-PULSE", "effort": "low-M", "consumers": "DP·MW·TNB", "data_readiness": "T2 VSD monthly via CafeF/Vietstock HTML", "rationale": "New-account net + retail-intensity. Monthly cadence = low time-sensitivity -> lower urgency despite low effort."},
    {"rank": 13, "id": "IND-P2-TRIN", "effort": "M", "consumers": "AC·MW", "data_readiness": "watchlist UV/DV from daily_ohlcv on hand; exchange-wide direction-split UNSOURCEABLE", "rationale": "Up/Down-Volume + Arms index. Volume-confirmation of breadth BUT watchlist-scoped only (honest cap) -> modest. (User named TRIN; ranked here honestly — the exchange-wide version is non-buildable under no-fake-data.)"},
    {"rank": 14, "id": "IND-P2-ETF-FLOW", "effort": "high", "consumers": "MW·DP·AC", "data_readiness": "VanEck VNM+Fubon solid; DCVFM only if static HTTP; EXCLUDE Xtrackers (synthetic)", "rationale": "Passive-foreign leading proxy. High effort + partial coverage."},
    {"rank": 15, "id": "IND-P2-MARGIN-LEVERAGE", "effort": "L", "consumers": "all", "data_readiness": "per-broker BCTC via pdf-extractor + NEW Circular-210 parser; quarterly +30-45d lag; partial coverage", "rationale": "THE dominant VN crash mechanism BUT hardest data. Ship level+QoQ+coverage% ONLY (z-score band = fabrication, rejected §4). High value but highest build cost+fragility -> dedicated later spike, NOT this wave."},
    {"rank": 16, "id": "IND-P2-PARTICIPATION-BREADTH", "effort": "M", "consumers": "MW·CHEF·DP", "data_readiness": "BLOCKED on ~200-session OHLCV history (still accruing)", "rationale": "%>MA50/%>MA200. DEFER until OHLCV depth reaches 200 sessions; then small (pure aggregation)."}
  ]
}) as $RANKING

# --- apply M1 (id-guarded across all lanes) --------------------------------
| ([ .task_board | to_entries[] | select(.value|type=="array") | .value[]
     | select(type=="object") | .id ]) as $ids
| (if ($ids | index($T.id)) then .
   else .task_board.backlog += [$T] end)

# --- apply M2 (marker-guarded in-place annotation) -------------------------
| .task_board.backlog |= map(
    if (type=="object" and .id=="IND-ROADMAP-LEDGER" and (has("next_wave_ranking")|not))
    then . + {"next_wave_ranking": $RANKING}
    else . end)
