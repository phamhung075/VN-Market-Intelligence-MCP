# po-s55-health-recheck-wave2-triage.jq
# Single-pass triage of the 2026-06-13..15 stale health-recheck backlog (dev-team Step-1 PO).
# Mutations (all id-guarded / idempotent):
#   1. Enrich FIX-FB-POSTER-NOARG-MARKET-TOOLS backlog row (was bare NEW) with owner/zone/scope/priority.
#   2. Mint FIX-VNSTOCK-TRADINGSTATS-CRASH into backlog[] if absent (vnstockTradingStatsRefresh 50% crash).
#   3. Mint FIX-ALERT-OPEN-ZERO-PRICE-RACE into backlog[] if absent (HELD — overlaps RSI gate 2026-06-16).
#   4. Promote the 4 dispatchable IDs backlog->ready (HNX, FB-POSTER, MARKET-HEXAGRAM, VNSTOCK-TRADINGSTATS).
#      FIX-ALERT-OPEN-ZERO-PRICE-RACE stays in backlog (deferred hold past the RSI gate).
# Conservation: every backlog row either stays in backlog or moves to ready — no entry lost/duplicated.
# Usage: jq --arg now "$NOW" -f scripts/po-s55-health-recheck-wave2-triage.jq docs/data/orch/orch-state.json
#        (atomic temp -> [ -s ] -> jq empty -> conservation -> rename; commit orch-state by EXPLICIT PATH).

def has_id($id): [.. | objects | select(.id? == $id)] | length > 0;

# ---- promote set (backlog -> ready) ----
( ["FIX-HNX-UPCOM-PRICE-SOURCES-DEAD",
   "FIX-FB-POSTER-NOARG-MARKET-TOOLS",
   "FIX-MARKET-HEXAGRAM-TOOL-MISSING",
   "FIX-VNSTOCK-TRADINGSTATS-CRASH"] ) as $promote
|
# ---- 1. enrich fb-poster row in place ----
.task_board.backlog |= map(
  if .id == "FIX-FB-POSTER-NOARG-MARKET-TOOLS" then
    . + {
      owner: "fb-market-poster",
      zone_owner: "cross-service/",
      priority: "P1",
      type: "FIX",
      status: "TODO",
      scope: "fb-market-poster calls get_foreign_flow({}) (flow/main.md:78) + get_ticker_intelligence({}) (flow/main.md:81) with no `code` arg -> live schema requires code:string -> silent crash to notebook fallback every cycle. FIX: switch both to the no-arg market-wide variant get_market_foreign_flow({}) (LIVE-verified no-arg, returns real watchlist foreign flow) for flow + agent-doc package; correct package/fb-market-poster.md '(none required)' rows. Agent-doc + flow edit, NOT mcp-server code.",
      source: "health-recheck BUG-NEW-01/02 (3170..3179); report 3180 'RESOLVED' is FALSE-POSITIVE (flow file still no-arg at HEAD).",
      user_impact: "MEDIUM — daily FB post foreign-flow + movers section data-blind every cycle."
    }
  else . end
)
|
# ---- 2. mint FIX-VNSTOCK-TRADINGSTATS-CRASH ----
( if (. | has_id("FIX-VNSTOCK-TRADINGSTATS-CRASH")) then .
  else .task_board.backlog += [{
    depends: [],
    id: "FIX-VNSTOCK-TRADINGSTATS-CRASH",
    type: "FIX",
    owner: "dev-mcp-server",
    zone_owner: "apps/mcp-server/",
    priority: "P1",
    status: "TODO",
    title: "FIX-VNSTOCK-TRADINGSTATS-CRASH — vnstockTradingStatsRefresh CRASHED (50% success rate, 45min avg run) -> sector/market-cap data unreliable.",
    scope: "Same crash family as the now-fixed FIX-FUNDAMENTALS-REFRESH-CRON-DEAD: syncVnstockData.ts subprocess has no per-ticker timeout/back-off guard, so a slow/rate-limited ticker blows the 45min run and the job exits ~50%. Add subprocess timeout guard + per-ticker back-off in the tradingStats path (mirror the fundamentals fix). PLAN-ONLY at PO layer.",
    source: "health-recheck BUG-1 2026-06-15T10:07Z (3180); M6 monitor (3149) escalated to crash.",
    user_impact: "MEDIUM — sector rotation + market-cap weighting stale/unreliable.",
    created_at: $now
  }]
  end )
|
# ---- 3. mint FIX-ALERT-OPEN-ZERO-PRICE-RACE (HELD in backlog) ----
( if (. | has_id("FIX-ALERT-OPEN-ZERO-PRICE-RACE")) then .
  else .task_board.backlog += [{
    depends: ["FIX-ALERT-ENGINE-RSI-SINGLEDIGIT"],
    id: "FIX-ALERT-OPEN-ZERO-PRICE-RACE",
    type: "FIX",
    owner: "dev-mcp-server",
    zone_owner: "apps/mcp-server/",
    priority: "P1",
    status: "HELD",
    hold_reason: "Overlaps FIX-ALERT-ENGINE-RSI-SINGLEDIGIT behavioral gate at 2026-06-16T01:00Z briefing (review[]). Same market-open zero-data window. Do NOT dispatch until after that gate observes the 02:00Z open — avoid double-touching the alert-engine open path.",
    title: "FIX-ALERT-OPEN-ZERO-PRICE-RACE — bbAlertScanJob/taAlertScanJob fire giá=0 BB-breakout + single-digit RSI (3.7-11.9) at 02:00-02:15Z market open, self-normalizing to RSI 35-48 by 06:08Z.",
    scope: "Zero-data race: at 02:00Z open the alert-scan jobs read candles whose intraday price is not yet populated (giá=0 / partial-window RSI) -> emit false ta_oversold/ta_bb_breakout WARNINGs that vanish once prices fill. Guard: skip/defer alert emission when latest candle price<=0 or window incomplete for the session. Distinct mechanism from FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (scale corruption) but same symptom surface -> sequence AFTER the 06-16 RSI gate.",
    source: "health-recheck BUG-3/BUG-4 (3177/3178 2026-06-15T04:08-06:08Z).",
    user_impact: "MEDIUM — false oversold/breakout WARNING alerts spam MARKET-adjacent surface at every open.",
    created_at: $now
  }]
  end )
|
# ---- 4. promote dispatchable set backlog -> ready ----
( [ .task_board.backlog[] | select(.id as $i | $promote | index($i)) | (.status = "READY") ] ) as $moved
| .task_board.ready += $moved
| .task_board.backlog |= map(select(.id as $i | ($promote | index($i)) | not))
|
.task_board._updated_at = $now
| .task_board._updated_by = "po-s55-health-recheck-wave2-triage"
