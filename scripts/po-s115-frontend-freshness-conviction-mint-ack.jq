# po-s115-frontend-freshness-conviction-mint-ack.jq
#
# Single-pass PLAN-ONLY triage of the 8 NEW signal_queue.rows (project_anomaly_task_bridge):
#   M1  id-guarded MINT of 8 BACKLOG tasks (NEVER promoted to ready[]). 7 form the
#       "frontend-freshness-20260625" epic; 1 (conviction_history) is its own data-integrity task.
#       Each carries a "RAW-verify root cause LIVE before fix" generic_mandate
#       (corroboration gate: feedback_false_infra_failure_corroboration_gate / DETECT findings
#       can be false-positive). Dependency preserved: chef-synthesis-b blocked_by chef-synthesis-a.
#   M2  flip the 8 originating signal_queue.rows NEW->READ (not RESOLVED — open until the fix ships)
#       with a triaged_into anchor (minted backlog task id) + router_dup_of (signal id) self-anchor.
#
# Idempotent:
#   - mint guarded by id-presence across ALL board lanes (re-run mints 0)
#   - signal flip guarded by status=="NEW" (re-run flips 0)
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/po-s115-frontend-freshness-conviction-mint-ack.jq docs/data/orch/orch-state.json

def all_ids:
  [ .task_board.backlog[]?, .task_board.ready[]?, .task_board.in_progress[]?,
    .task_board.review[]?, .task_board.done[]?, .task_board.done_verified[]? ]
  | map(.id);

. as $root
| (all_ids) as $ids

# ── EPIC: frontend-freshness-20260625 ────────────────────────────────────────

# T1 — chef-synthesis (a) flow persist (HIGH -> P1) — ROOT of the epic, blocks T2
| ( if ($ids | index("GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST")) then {} else
    { id: "GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST",
      title: "GAP-CHEF-SYNTHESIS (a): CHEF (unified-agent) computes a TNB 6-layer synthesis (per-ticker conviction, sector phase, regime+confidence, known_gaps) every cycle but persists it ONLY to Telegram MARKET + the unified-agent.md notebook — never to a frontend-queryable store. Add a persist step to chef.md that writes docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json.",
      type: "FEATURE", priority: "P1", status: "BACKLOG",
      epic: "frontend-freshness-20260625",
      zone: "docs/agents/unified-agent/flow/chef.md", owner: "cowork/agent-md-factory",
      root_cause: "The CHEF 6-layer synthesis has no frontend-queryable sink; it is emitted to Telegram + notebook only — the one true capture-not-persisted gap from frontend-data-coverage-map.json row(cheb-synthesis).",
      generic_mandate: "RAW-verify the gap LIVE before any change (confirm a recent CHEF cycle produced the synthesis to MARKET + notebook but no docs/data/unified-agent-synthesis-*.json exists). Then add a persist step to chef.md AFTER synthesis / BEFORE end-cycle writing docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json (conviction calls, sector phases, regime+confidence, known_gaps — mirror the structure fb-market-poster already computes). MANDATORY: edit chef.md via the agent-md-factory skill (pre/post discipline for flow .md edits) — do NOT hand-edit; frontmatter on line 1; within size budget.",
      verification_gate: "After a CHEF cycle, docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json exists with non-empty conviction/sector-phase/regime/known_gaps fields matching that cycle's Telegram MARKET post.",
      blocks: ["GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD"],
      source_signal: "po-frontend-freshness-20260625-gap-chef-synthesis-a-flow",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY (project_anomaly_task_bridge): minted BACKLOG, NOT promoted to ready. memory feedback_agent_md_factory — edit flow .md via agent-md-factory skill."
    } end ) as $t1

# T2 — chef-synthesis (b) endpoint + card (HIGH -> P1) — DEPENDS ON T1
| ( if ($ids | index("GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD")) then {} else
    { id: "GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD",
      title: "GAP-CHEF-SYNTHESIS (b): make the captured CHEF synthesis queryable. dev-mcp-server adds GET /api/cheb-synthesis (or folds into /api/market-digest) reading docs/data/unified-agent-synthesis-<DATE>-<SLOT>.json with a data_asof/generatedAt field; dev-frontend adds a card surfacing conviction calls, sector phases, regime, known_gaps.",
      type: "FEATURE", priority: "P1", status: "BACKLOG",
      epic: "frontend-freshness-20260625",
      zone: "multi", owner: "dev-mcp-server (endpoint) + dev-frontend (card)",
      root_cause: "No GET endpoint nor frontend card exists for the CHEF synthesis JSON (gated on T1 producing the file).",
      generic_mandate: "RAW-verify LIVE before any change (confirm T1's docs/data/unified-agent-synthesis-*.json is being written with non-empty fields — the endpoint has nothing to serve until then). Architect to split mcp-server endpoint vs frontend card. Add a data_asof/generatedAt freshness field to the endpoint (reuse the sectorRotationHandler.ts generatedAt pattern).",
      verification_gate: "GET /api/cheb-synthesis returns the latest synthesis JSON with a non-null freshness field; the frontend card renders conviction/sector-phase/regime/known_gaps.",
      depends: ["GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST"],
      blocked_by: ["GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST"],
      blocked_reason: "endpoint has nothing to serve until the T1 flow persist step writes the synthesis JSON",
      source_signal: "po-frontend-freshness-20260625-gap-chef-synthesis-b-endpoint-card",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY: minted BACKLOG, NOT promoted. multi zone (architect splits). Gated on T1."
    } end ) as $t2

# T3 — L2 data_asof fields (MEDIUM -> P2)
| ( if ($ids | index("FIX-L2-FRESHNESS-DATAASOF-FIELDS")) then {} else
    { id: "FIX-L2-FRESHNESS-DATAASOF-FIELDS",
      title: "L2 freshness fields: /api/market-digest (marketDigestHandler), /api/quality-checklist (qualityChecklist), /api/vps-proxy-health (vpsProxyHealthHandler) return NO top-level data_asof/generatedAt. Add a freshness field to each, REUSING the sectorRotationHandler.ts (generatedAt/tradingDate) pattern. Also covers alerts/priceHistory generatedAt per update_mechanic.L2_asof.",
      type: "FIX", priority: "P2", status: "BACKLOG",
      epic: "frontend-freshness-20260625",
      zone: "apps/mcp-server/", owner: "dev-mcp-server",
      root_cause: "The 4 L2-status coverage-map rows have endpoints emitting no top-level freshness timestamp (asof:null).",
      generic_mandate: "RAW-verify LIVE before any change (jq each endpoint response, confirm data_asof/generatedAt is genuinely absent, not just nested). Then add the field reusing apps/mcp-server/src/interface/mcp/routes/sectorRotationHandler.ts (generatedAt/tradingDate) — no new tables.",
      reuse: "apps/mcp-server/src/interface/mcp/routes/sectorRotationHandler.ts (generatedAt/tradingDate pattern)",
      verification_gate: "jq over each L2 endpoint response shows a non-null top-level data_asof/generatedAt; coverage-map L2 rows flip to LIVE.",
      related_board: ["FACTORY-APP-dedup-date-freshness-helpers (centralize freshness helpers — coordinate, do not duplicate the helper home)"],
      source_signal: "po-frontend-freshness-20260625-l2-dataasof-fields",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY: minted BACKLOG, NOT promoted. Reuse sectorRotationHandler.ts; supplies data_asof that T4 badge consumes."
    } end ) as $t3

# T4 — L3 frontend auto-refresh + freshness badge (MEDIUM -> P2) — soft-depends T3
| ( if ($ids | index("FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE")) then {} else
    { id: "FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE",
      title: "L3 frontend auto-refresh + freshness badge: pages are SSR-only so an open tab shows stale data silently until manual reload. Add Remix useRevalidator on an interval driven by each row's sla_tier.refresh_ms + a per-card green/amber/red FreshnessBadge from data_asof vs max_staleness_min. Centralize as a shared hook + component; reuse safeFetch.",
      type: "FEATURE", priority: "P2", status: "BACKLOG",
      epic: "frontend-freshness-20260625",
      zone: "apps/frontend/", owner: "dev-frontend",
      root_cause: "SSR-only pages have no client-side revalidation and no freshness indicator; stale data is invisible to a user with an open tab.",
      generic_mandate: "RAW-verify LIVE before any change (confirm an open intraday page does NOT revalidate on its tier interval today). Then add a shared useRevalidator hook + FreshnessBadge component under apps/frontend/app/lib/ and app/components/, reuse safeFetch in app/lib/api/fetchUtils.ts, and read frontend-data-coverage-map.json sla_tiers as the refresh/staleness SSOT (realtime 60s / intraday 5min / daily+weekly none).",
      reuse: "apps/frontend/app/lib/api/fetchUtils.ts (safeFetch); frontend-data-coverage-map.json sla_tiers (refresh/staleness SSOT)",
      verification_gate: "An open intraday/realtime page revalidates on its tier interval without manual reload; each card shows a green/amber/red badge driven by data_asof vs its tier max_staleness_min.",
      depends_soft: ["FIX-L2-FRESHNESS-DATAASOF-FIELDS"],
      depends_soft_reason: "badge needs data_asof from L2 to color realtime/intraday cards; daily/weekly cards can render without it",
      source_signal: "po-frontend-freshness-20260625-l3-frontend-autorefresh-badge",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY: minted BACKLOG, NOT promoted. Shared hook+component, reuse safeFetch; soft-depends T3 for badge color source (not a hard block)."
    } end ) as $t4

# T5 — L4 SLA monitor self-policing (MEDIUM -> P2)
| ( if ($ids | index("FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING")) then {} else
    { id: "FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING",
      title: "L4 SLA monitor: extend the EXISTING freshnessSlaMonitor cron (apps/mcp-server/src/scheduler/**, */30) + system-auditor Tier-2 to read frontend-data-coverage-map.json as SSOT and emit a signal_feedback row when ANY element exceeds its tier SLA (max_staleness_min, market-hours-aware). Makes 'all data must update' self-policing.",
      type: "FIX", priority: "P2", status: "BACKLOG",
      epic: "frontend-freshness-20260625",
      zone: "multi", owner: "dev-mcp-server (cron) + system-auditor (flow)",
      root_cause: "No automated SLA gate reads the frontend coverage map; freshness breaches are caught only by manual/DB sweeps.",
      generic_mandate: "RAW-verify LIVE before any change (confirm freshnessSlaMonitor */30 runs and does NOT today read frontend-data-coverage-map.json). Then extend the EXISTING cron + system-auditor Tier-2 to read the coverage map SSOT and emit exactly one signal_feedback row (per signal-dashboard skill) per breach. HEED feedback_auditor_freshness_threshold_market_hours_blind — gate thresholds on market hours (02:00-08:59 UTC Mon-Fri) so weekend/off-hours by-design STALE_RISK rows do NOT false-fire.",
      reuse: "existing freshnessSlaMonitor */30 cron + system-auditor Tier-2 + signal-dashboard skill; coverage-map sla_tiers (market hrs 02:00-08:59 UTC Mon-Fri)",
      verification_gate: "Inject a synthetic over-SLA element -> monitor emits exactly one signal_feedback row to the signal bus; zero false-fire for by-design market-hours-only STALE_RISK rows off-hours.",
      related_board: ["DS-OBS-01-FIX (freshnessSlaMonitor source-level WORK/BUG alert — distinct: data-source stale_threshold, NOT frontend-element coverage)", "FW-FRESH-01-FIX (freshnessSlaMonitor running + no false-positive — distinct test)", "FACTORY-DOMAIN-extract-sla-config (DEFAULT_SLA_CONFIG home — coordinate, do not fork SLA config)"],
      source_signal: "po-frontend-freshness-20260625-l4-sla-monitor",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY: minted BACKLOG, NOT promoted. Net-new (frontend-coverage-map SSOT) vs source-level DS-OBS-01/FW-FRESH-01; market-hours-aware to avoid false-fire."
    } end ) as $t5

# T6 — DEPTH_THIN (a) price-history retention >=10d (LOW -> P3)
| ( if ($ids | index("FIX-DEPTHTHIN-A-PRICE-HISTORY-RETENTION-10D")) then {} else
    { id: "FIX-DEPTHTHIN-A-PRICE-HISTORY-RETENTION-10D",
      title: "DEPTH_THIN (a): market_prices_history is only ~2 trading days deep -> /api/sector-rotation runs in only1dAvailable=true mode. Backfill/retain market_prices_history to >=10 trading days by fixing the retention WRITER.",
      type: "FIX", priority: "P3", status: "BACKLOG",
      epic: "frontend-freshness-20260625",
      zone: "apps/stock-price/", owner: "dev-stock-price",
      root_cause: "market_prices_history retention/writer keeps only ~2 trading days, forcing sector-rotation into only1dAvailable mode.",
      generic_mandate: "RAW-verify LIVE before any change (query named-volume market_prices_history depth; confirm ~2-day depth is persistent). Then fix the retention WRITER, NOT a one-shot backfill that a startup purge/seeder re-defeats (HEED feedback_ohlcv_startup_purge_defeated_by_backfill_seeder). Verify depth is STABLE across a restart with NO flat-seed (O=H=L=C zero-vol) rows.",
      verification_gate: "market_prices_history holds >=10 distinct real trading days, STABLE across an mcp/stock-price restart, with zero flat-seed rows; sector-rotation exits only1dAvailable mode.",
      source_signal: "po-frontend-freshness-20260625-depthThin-a-history-retention",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY: minted BACKLOG, NOT promoted. Fix WRITER not residue; stable-across-restart + no-flat-seed gate per OHLCV-purge lesson."
    } end ) as $t6

# T7 — DEPTH_THIN (b) gateway /ta path-rewrite (LOW -> P3)
| ( if ($ids | index("FIX-DEPTHTHIN-B-GATEWAY-TA-PATH-REWRITE")) then {} else
    { id: "FIX-DEPTHTHIN-B-GATEWAY-TA-PATH-REWRITE",
      title: "DEPTH_THIN (b): dashboard.technical OHLCV candles render but TA indicators (MA/RSI/MACD) are MISSING — the api-gateway /ta path-rewrite is a TODO so technical-analysis indicators never reach the frontend. Wire the gateway /ta path-rewrite; also add generatedAt to /api/price-history.",
      type: "FIX", priority: "P3", status: "BACKLOG",
      epic: "frontend-freshness-20260625",
      zone: "multi", owner: "dev-mcp-server (gateway path-rewrite) / dev-technical-analysis (indicators)",
      root_cause: "api-gateway /ta path-rewrite is an unimplemented TODO, so technical-analysis MA/RSI/MACD never route to the frontend (candles use a separate path).",
      generic_mandate: "RAW-verify the ROOT LIVE before any change — distinguish THIS routing gap (gateway /ta path-rewrite TODO) from the SEPARATE indicator-computation bug FIX-TA-INDICATORS-TIER3-ROUTING (get_technical_indicators returns source_tier:3 ALL-N/A, raw-calc path lacks candles). Confirm whether wiring the gateway path alone surfaces MA/RSI/MACD, OR whether the indicators are empty at source (then FIX-TA-INDICATORS-TIER3-ROUTING is the real root — do NOT duplicate that work). Then wire the gateway /ta path-rewrite and add generatedAt to /api/price-history.",
      verification_gate: "dashboard.technical shows MA/RSI/MACD sourced from technical-analysis via the gateway /ta path; /api/price-history returns generatedAt.",
      related_board: ["FIX-TA-INDICATORS-TIER3-ROUTING (indicator-computation root — N/A at source; RAW-verify which layer is the real cause before fixing)", "FACTORY-TECHANALYSIS-reconcile-ta-contract (TA contract refactor — coordinate)"],
      source_signal: "po-frontend-freshness-20260625-depthThin-b-ta-path-rewrite",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY: minted BACKLOG, NOT promoted. RAW-verify routing-vs-computation root before fix to avoid duplicating FIX-TA-INDICATORS-TIER3-ROUTING."
    } end ) as $t7

# ── STANDALONE: data-integrity ───────────────────────────────────────────────

# T8 — conviction_history EOD backfill/reconciliation (MEDIUM -> P2)
| ( if ($ids | index("FIX-CONVICTION-HISTORY-EOD-BACKFILL")) then {} else
    { id: "FIX-CONVICTION-HISTORY-EOD-BACKFILL",
      title: "conviction_history is MISSING two trading days (06-22 Mon, 06-25 Thu) with NO backfill path = permanent data loss. Written ONLY by live scanMarket Step 5c (scanMarket.ts:571-574, vnNow-stamped); daily_ohlcv HAS all four days (06-22=764/06-23=708/06-24=877/06-25=897) so VPS price-ingestion is healthy — the gap is conviction-specific. Add an EOD reconciliation/backfill path + a zero-row observability signal.",
      type: "FIX", priority: "P2", status: "BACKLOG",
      zone: "apps/mcp-server/", owner: "dev-mcp-server",
      root_cause: "conviction_history.date is stamped from vnNow and written ONLY inside live scanMarket Step 5c (upsertConvictionHistory); there is NO backfill/EOD reconciliation, so any session that misses a trading day (scan never ran OR ran but Step 5c short-circuited before upsert) loses that day permanently.",
      generic_mandate: "RAW-verify the gap LIVE before any change (re-read named-volume conviction_history newest date + present/missing trading days vs daily_ohlcv on the named volume). CONFIRM-BEFORE-BLAME: mcp-server restarted ~19:00Z; logs reach back only to 19:00Z and do NOT cover the 06-25 VN window (02:00-08:00Z), so scan-never-ran vs Step-5c-short-circuited CANNOT be distinguished from logs — the durable fix is identical either way; dev-team must NOT over-claim the sub-cause. Then: (1) add an EOD reconciliation/backfill writer that recomputes conviction for any trading day with daily_ohlcv but no conviction_history row (self-heals a missed live scan); (2) instrument scanMarket Step 5c to emit an observability signal (agent_signals/signal_queue) when it writes ZERO conviction rows on a CONFIRMED trading day, so the gap is caught same-day.",
      verification_gate: "LIVE: after fix, a trading day present in daily_ohlcv but absent from conviction_history is self-healed by the EOD reconcile path (row count matches a full scan ~36 rows); a synthetic zero-write on a confirmed trading day emits exactly one observability signal; RAW-verify against the named-volume DB.",
      cross_ref: "FIX-VNINDEX-CACHE-STARTUP-PURGE — SAME genre (off-hours restart loses data) but DIFFERENT table/mechanism (vn_index_cache startup-purge vs conviction_history no-backfill). DISTINCT task, do NOT merge.",
      source_signal: "router-dbsweep-20260625T2202Z-conviction-history-no-backfill",
      router_verified: true,
      minted_by: "po", minted_at: $now,
      note: "PLAN-ONLY: minted BACKLOG, NOT promoted. Standalone data-integrity (not part of frontend-freshness epic). Net-new (dedup-scanned conviction|backfill|reconcil|scanMarket = 0 prior rows)."
    } end ) as $t8

# ── M1 apply: append non-empty mints to backlog ──────────────────────────────
| .task_board.backlog += ([$t1,$t2,$t3,$t4,$t5,$t6,$t7,$t8] | map(select(. != {})))

# ── M2 apply: flip the 8 NEW signal rows -> READ ─────────────────────────────
| .signal_queue.rows |= map(
    if .status == "NEW" and (.id | (startswith("po-frontend-freshness-20260625") or startswith("router-dbsweep-20260625T2202Z-conviction-history-no-backfill"))) then
      .status = "READ"
      | .triaged_at = $now
      | .triaged_by = "po-s115"
      | .router_dup_of = .id
      | .triaged_into = (
          if   .id == "po-frontend-freshness-20260625-gap-chef-synthesis-a-flow"        then "GAP-CHEF-SYNTHESIS-A-FLOW-PERSIST"
          elif .id == "po-frontend-freshness-20260625-gap-chef-synthesis-b-endpoint-card" then "GAP-CHEF-SYNTHESIS-B-ENDPOINT-CARD"
          elif .id == "po-frontend-freshness-20260625-l2-dataasof-fields"               then "FIX-L2-FRESHNESS-DATAASOF-FIELDS"
          elif .id == "po-frontend-freshness-20260625-l3-frontend-autorefresh-badge"    then "FIX-L3-FRONTEND-AUTOREFRESH-FRESHNESS-BADGE"
          elif .id == "po-frontend-freshness-20260625-l4-sla-monitor"                   then "FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING"
          elif .id == "po-frontend-freshness-20260625-depthThin-a-history-retention"    then "FIX-DEPTHTHIN-A-PRICE-HISTORY-RETENTION-10D"
          elif .id == "po-frontend-freshness-20260625-depthThin-b-ta-path-rewrite"      then "FIX-DEPTHTHIN-B-GATEWAY-TA-PATH-REWRITE"
          else                                                                               "FIX-CONVICTION-HISTORY-EOD-BACKFILL"
          end )
      | .po_decision_triage = ("MINTED BACKLOG " + .triaged_into + " (PLAN-ONLY, NOT promoted to ready). RAW-verify root cause LIVE before fix (corroboration gate). po-s115.")
    else . end )

# ── metadata bump ────────────────────────────────────────────────────────────
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "po-s115"
