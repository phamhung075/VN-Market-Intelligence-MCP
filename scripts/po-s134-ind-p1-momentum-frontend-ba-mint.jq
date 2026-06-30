# scripts/po-s134-ind-p1-momentum-frontend-ba-mint.jq
# ---------------------------------------------------------------------------
# Single-mutation cascade-kickoff MINT (idempotent):
#   id-guarded MINT of BA-IND-P1-MOMENTUM-FRONTEND -> .task_board.ready[]
#   (status=READY, next_agent=ba, zone=multi, priority=high, user_prioritized:true,
#    type=SPRINT-M) covering frontend surfacing of the 4 P1 momentum indicators:
#   deliverable-1 = GET /api/momentum-indicators REST aggregator (dev-mcp-server,
#   mirror indicator-gauges, reuse clients.ts NOT the MCP tool layer); deliverable-2
#   = api.momentum-indicators.tsx proxy + dashboard.momentum.tsx cards + TopNav + tests
#   (dev-frontend). Architect SPLITs the multi-zone wave; pm decomposes into dev tasks.
#
# Originated 2026-06-30 (po-s134) folding in the router addendum after the user
# asked to "add to frontend new implement". RAW-grep (router + PO) confirmed 0
# P1 momentum surface in apps/frontend/app while the 5 P0 gauges are LIVE.
# USER-PRIORITIZED -> ready[] (leads the next-wave NEW-indicator backlog rows).
# Reusable pattern for "user asked to surface already-shipped backend tools on
# the dashboard -> mint ONE BA spec cascade-kickoff to ready[] (next_agent=ba,
# zone=multi) carrying the REST-aggregator + frontend-cards split + standing
# freshness/all-info/no-fake-data ACs; PO does NOT spawn — dev-team cron adopts".
#
# Idempotent: id-guarded across ALL lanes -> re-run mints 0.
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s134-ind-p1-momentum-frontend-ba-mint.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# ---------------------------------------------------------------------------

({
  "id": "BA-IND-P1-MOMENTUM-FRONTEND",
  "tier": "P1",
  "title": "BA spec — Frontend surfacing of the 4 P1 momentum indicators: GET /api/momentum-indicators REST aggregator (mcp-server) + dashboard.momentum cards (frontend). USER-PRIORITIZED (user asked 'add to frontend new implement' 2026-06-30). The 4 P1 momentum tools (get_roc_momentum / get_relative_strength / get_52w_proximity / get_foreign_accum_rank) have ZERO frontend surface (router RAW-grep + PO RAW-grep both confirmed 0 hits in apps/frontend/app) while the 5 P0 gauges are already LIVE.",
  "owner": "ba",
  "next_agent": "ba",
  "zone": "multi",
  "priority": "high",
  "user_prioritized": true,
  "status": "READY",
  "type": "SPRINT-M",
  "plan_only": false,
  "sprint": "MARKET-INDICATOR-DEPTH-P0",
  "roadmap_ref": "docs/roadmaps/vn-market-indicator-roadmap.md",
  "created_by": "po",
  "created_at": $now,
  "promoted_at": $now,
  "promoted_by": "po",
  "parallel_with": "IND-P1-MOMENTUM-CONSUMER-WIRING (DISJOINT surface: this = user-facing dashboard via dev-mcp-server REST + dev-frontend; that = cowork agent .md consumption). Both close the 'tools shipping != consumed' gap on different consumer surfaces.",
  "gap_finding": "PO RAW-grep 2026-06-30: grep roc/relative-strength/52w/foreign-accum across apps/frontend/app = 0 hits. P0 gauges ARE live (dashboard.indicator-gauges.tsx + api.indicator-gauges.tsx + TopNav + coverage-map LIVE). The 4 P1 tools are LIVE-callable (clients.ts roc-momentum/relative-strength/52w-proximity/foreign-accum-rank confirmed) but UNSURFACED to the user.",
  "spec_scope": {
    "deliverable_1_rest_endpoint": {
      "zone": "apps/mcp-server",
      "dev_agent": "dev-mcp-server",
      "what": "GET /api/momentum-indicators REST aggregator, mirroring the indicator-gauges pattern (server.ts dispatch ~:2157 + indicatorGaugesHandler.ts). REUSE the 4 P1 client functions in infrastructure/microservices/clients.ts (roc-momentum / relative-strength / 52w-proximity / foreign-accum-rank) DIRECTLY — do NOT re-invoke through the MCP tool layer. Promise.allSettled section-isolation (4 sections, one per tool). ALWAYS HTTP 200 even if all 4 upstreams fail. Honest-NULL passthrough with null_reason / low_sample_warning preserved per section. source_tier + fetched_at stamped per section.",
      "ref_pattern": "apps/mcp-server/src/interface/mcp/routes/indicatorGaugesHandler.ts"
    },
    "deliverable_2_frontend": {
      "zone": "apps/frontend",
      "dev_agent": "dev-frontend",
      "what": "api.momentum-indicators.tsx (Remix proxy route -> GET /api/momentum-indicators) + dashboard.momentum.tsx (cards, one per P1 indicator) + TopNav entry + tests. Mirror dashboard.indicator-gauges.tsx + api.indicator-gauges.tsx exactly.",
      "ref_pattern": "apps/frontend/app/routes/dashboard.indicator-gauges.tsx + api.indicator-gauges.tsx"
    }
  },
  "acceptance": [
    "AC-1 (NO FAKE DATA): honest-NULL rendered with explicit null_reason / 'Chưa có dữ liệu' marker — NEVER default-fill a value. The † momentum tools return null when history insufficient (252/273 bars; OHLCV still accruing) — the DESIGNED PASS state.",
    "AC-2 (FRESHNESS): per-card 'Cập nhật lúc' freshness badge; SSOT = frontend-data-coverage-map.json — NEVER a baked or client-now time. Mirror FreshnessBadge + useFreshnessRevalidator (TASK-FFT-L3B) on the gauge cards.",
    "AC-3 (ALL-INFO): source-link + detail dropdown per card (standing 'all info: source-link + dropdown' rule).",
    "AC-4 (COVERAGE-MAP): add the new momentum page rows to frontend-data-coverage-map.json as GAP (plan-only); flips to LIVE at the QA gate when the page renders real/honest-NULL data on HTTP 200.",
    "AC-5 (REST CONTRACT): GET /api/momentum-indicators returns HTTP 200 with 4 section objects; Promise.allSettled isolation (one failing section never 500s the page); honest-NULL + null_reason preserved.",
    "AC-6 (TESTS): vitest for the frontend route(s) + bun test for the REST handler; tsc 0 errors; mock-guard PASS."
  ],
  "cascade": "PO->BA->Architect(SPLIT multi -> dev-mcp-server REST + dev-frontend cards)->PM(decompose into dev tasks)->dev->QA. Full gate IN EFFECT (genuinely-new user-facing feature).",
  "standing_rules": "No fake data (honest-NULL only). Vietnamese for card UI text (user-facing), English for internal work/code. Freshness SSOT = coverage-map. Frontend consumes backend via the REST aggregator — never calls MCP tools directly.",
  "notes": "USER-PRIORITIZED — sequence AHEAD of the next-wave NEW-indicator build rows (IND-ROADMAP-LEDGER.next_wave_ranking: VN-YIELD-CURVE/SECTOR-RRG/FEAR-GREED). Those build MORE tools; this surfaces ALREADY-SHIPPED tools to the user who explicitly asked. PO does NOT spawn the cascade — dev-team cron adopts this ready[] row (claims + spawns ba) on next tick. Plan-only board mutation."
}) as $T

| ([ .task_board | to_entries[] | select(.value|type=="array") | .value[]
     | select(type=="object") | .id ]) as $ids
| (if ($ids | index($T.id)) then .
   else .task_board.ready += [$T] end)
