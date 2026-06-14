# po-S52 — Chart price-range / sliver-candle bug triage (user BUG report 2026-06-14)
# Verdict: BOTH root causes real. DATA layer is PRIMARY/upstream, FRONTEND domain SECONDARY.
# Live-probed FPT/SHB/VCB get_price_history: every ticker carries a 2026-05-30 close=0,vol=0
#   non-trading-day gap stored as a real candle (ALLZERO class) -> poisons BB stdev (the ~±35k
#   right-third fan) AND zero-anchors the auto-domain (Min 0 in every stats line, header "Biên độ: 0 — …").
#   VCB additionally still serves 2026-06-01 close=62.2 (1000x scale outlier, "+98935.37%") -> UNIT-CONTAM
#   regression despite CONTAM-2..7 DONE.
# Frontend confirmed in code: apps/frontend/app/components/charts/StockChart.tsx feeds raw `closes`
#   (incl. the 0 / 62.2 poison) straight into candle.setData + computeBB(closes); lightweight-charts
#   default autoScale then includes 0 -> sliver candles, and computeBB over the 0-window -> the fan.
#
# Mutations (scoped — touch ONLY the two target board entries + _updated_*; no whole-object rewrite):
#   (1) DATA-FIRST: promote existing ALLZERO-OHLCV-FETCH backlog->ready, scope to the chart-poison angle,
#       generic acceptance (no per-ticker hardcode), record UNIT-CONTAM regression cross-ref.
#   (2) FE-SECOND: append NEW FIX-FE-CHART-PRICE-DOMAIN, depends:[ALLZERO-OHLCV-FETCH], dev-frontend zone.
# Idempotent: skip the FE append if the id already exists in ANY board array.

  ($now) as $now
| (([.task_board[] | objects, arrays[]? | objects | .id?] | map(select(. != null)))
     | index("FIX-FE-CHART-PRICE-DOMAIN")) as $fe_exists
| .task_board._updated_at = $now
| .task_board._updated_by = "po-S52"

# (1) ALLZERO-OHLCV-FETCH: BACKLOG -> READY, scope to chart poison, generic acceptance
| .task_board.backlog = (.task_board.backlog | map(
    if .id == "ALLZERO-OHLCV-FETCH" then
      . + {
        "status": "READY",
        "priority": "high",
        "owner": "dev-technical-analysis",
        "zone": "apps/mcp-server/",
        "promoted_by": "po-S52",
        "promoted_at": $now,
        "scope": "GENERIC across ALL tickers — no per-ticker hardcode. Stop the non-trading-day gap (e.g. 2026-05-30) being written/served as a 0/0/0/0 candle in daily_ohlcv. Find the bulk-fetch emitter that stamps the all-zero row + guard it (skip-write on vol=0/open=0 non-trading day, NOT a real bar). Backfill: purge/forward-fill existing all-zero rows so every served price series (get_price_history, get_technical_indicators, chart loader) is gap-free. This is the UPSTREAM cause of (a) the absurd ±~35k Bollinger fan — a 0 inside the 20-period window detonates stdev — and (b) the chart Min=0 / zero-anchored Y-domain. Fixing here cleans BB/MA for the chart AND the alert pipeline at once.",
        "acceptance": "Probe >=3 tickers across the price spread (low: SHB ~13.8k, mid: VCB ~61.6k, high: FPT ~73.5k) via get_price_history: NO row with close=0 on a non-trading day; stats line shows Min within the real band (not 0). BB upper/mid/lower (served + chart computeBB) within a believable σ of price (band width well under ±15% for these low-vol large-caps, NOT ±47%).",
        "regression_note": "[po-S52 2026-06-14] LIVE-PROBE found UNIT-CONTAM REGRESSION alongside the all-zero rows: VCB still serves 2026-06-01 close=62.2 (should be ~62000 — 1000x scale, '+98935.37%' jump) despite CONTAM-2..7 all DONE. The repair migration (CONTAM-6) WHERE-excluded all-zero rows and may have missed this row, OR fresh re-contamination after the writer guards shipped. dev-technical-analysis to re-run the unit-guard normalize (×1000) over the residual outliers AS PART of this backfill — same daily_ohlcv write boundary."
      }
    else . end
  ))

# (2) NEW frontend task, depends on the data fix (sequence DATA-FIRST -> FE-SECOND)
| if $fe_exists == null then
    .task_board.ready += [{
      "id": "FIX-FE-CHART-PRICE-DOMAIN",
      "type": "FIX",
      "owner": "dev-frontend",
      "status": "READY",
      "size": "S",
      "zone": "apps/frontend/",
      "priority": "high",
      "sprint": "BACKLOG",
      "depends": ["ALLZERO-OHLCV-FETCH"],
      "title": "Price-pane Y-domain is zero-anchored + over-wide -> candles render as unreadable slivers (GENERIC all tickers)",
      "root_cause": "apps/frontend/app/components/charts/StockChart.tsx feeds raw `closes` into candle.setData (line ~81) and computeBB(closes) (line ~118) with NO outlier sanitation. lightweight-charts default autoScale then spans the full data incl. the 0-poison row -> domain anchored at 0 (header 'Biên độ: 0 — 77.900', y-grid 0->120000) while the real ~68k-80k band occupies a thin strip (~85% wasted vertical). The same 0 inside computeBB's 20-window also produces the ±~35k BB fan on the right third.",
      "scope": "GENERIC — no per-ticker hardcode. TWO parts: (a) Sanitize the series BEFORE setData/computeMA/computeBB: drop or forward-fill non-trading-day rows (close===0 && volume===0) and clamp obvious 1000x scale outliers, so the chart never plots poison even if a residual reaches it (defense-in-depth behind the upstream ALLZERO fix). (b) Stop relying on lightweight-charts default autoScale: compute the price-pane domain from the ACTUAL visible band = min/max over (candle high/low ∪ MA20 ∪ MA50 ∪ BB+ ∪ BB-), then domain = [min*(1-pad), max*(1+pad)] with pad ~0.05-0.08, NEVER forced to 0. Apply via priceScale autoscaleInfoProvider (or explicit min/max) on the candle series.",
      "acceptance": "On >=3 tickers across the spread (SHB ~13.8k, VCB ~61.6k, FPT ~73.5k): (1) Y-domain is NOT zero-anchored — header 'Biên độ' starts near the data min, not 0; (2) candles fill a reasonable vertical fraction (visible band >= ~50% of pane height, not a sliver); (3) over CLEAN data (post-ALLZERO) BB+/BB-/BBmid sit within a believable σ of price (band width well under ±15% for these low-vol large-caps); (4) no candle/MA/BB plotted from a close=0 or 1000x-scale row.",
      "sequence_note": "DATA-FIRST: ALLZERO-OHLCV-FETCH must complete first so this fix domains over CORRECT data — a pure frontend clamp alone would only HIDE wrong BB, not correct it. Frontend sanitation here is defense-in-depth, not a substitute for the upstream fix.",
      "files": [
        "apps/frontend/app/components/charts/StockChart.tsx",
        "apps/frontend/app/components/charts/indicators.ts",
        "apps/frontend/app/routes/api.price-history.$ticker.tsx",
        "apps/frontend/app/routes/dashboard.technical.tsx"
      ],
      "baseline_pass": "pnpm --filter frontend check + typecheck green before handoff",
      "evidence_source": "User BUG report 2026-06-14 + PO live get_price_history probe FPT/SHB/VCB (all carry 2026-05-30 close=0; VCB also 2026-06-01 close=62.2).",
      "created_at": $now,
      "created_by": "po-S52"
    }]
  else . end
