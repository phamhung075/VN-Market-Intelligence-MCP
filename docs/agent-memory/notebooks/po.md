# PO Notebook

_Last: 2026-06-30T02:50Z_

## Tick 02:48Z — MINT backend completion-gap (router scoping, coord d3292ca4)

**Gap:** `IND-P1-FRONTEND-GAUGE-CARDS` shipped (done_verified) but its data path hits `GET /api/indicator-gauges` on mcp-server — which DOES NOT EXIST → 404 → gauge dashboard degrades to honest-NULL **permanently**. No board row tracked it (only the done frontend row referenced it). Coverage-map flagged it GAP×5.

**Action:** Minted ONE backlog row `IND-P1-MCP-REST-GAUGES-ENDPOINT` (status=BACKLOG, next_agent=dev-mcp-server, zone=apps/mcp-server, sprint=MARKET-INDICATOR-DEPTH-P0) via orch-apply (id-guarded, +1 row 368→369, all other lanes byte-stable, IND-P1-MCP-PROXY-INDICATORS untouched). Handoff `docs/handoffs/IND-P1-MCP-REST-GAUGES-ENDPOINT.md`. Commit **885c017e** (push held → fleet-push timer).

**Scope decision:** DIRECT pm-spec (NOT full cascade) — contract already pinned by frontend `IndicatorGaugesDto` (dashboard.indicator-gauges.tsx L45-133) + proxy header; 5 P0 source usecases LIVE; aggregation = mechanical projection. Detail → decision file § po-S6.

**Key build facts captured in handoff (verified live 2026-06-30):**
- 5 sources reuse existing usecases (NOT re-invoke via MCP): `computeVolatilityIndicators` (clients.ts), `getMarketSentimentIndex`, `getBreadthThrust`, `getForeignRoom`, macro `macroFetch /liquidity-state`.
- foreign_room MUST project from `.market` (2 scalars), NOT forward `tickers[~105]`. liquidity has NO source_tier → endpoint assigns. asof for volatility derived from fetched_at. breadth success-shape only readable from source (history empty live today → section null).
- Error/timeout: Promise.allSettled, section-isolated null+null_reason, 200 even on partial; honest-NULL DoD (never fabricate/default-fill).

## Carry-over
- **Router owns dispatch** of IND-P1-MCP-REST-GAUGES-ENDPOINT — AFTER IND-P1-MCP-PROXY-INDICATORS + mcp-server rebuild (serial rebuilds). Stays in backlog[] until then; do NOT promote to ready[] (cron races).
- Post-deploy: 5 `indicator-gauges` rows in `docs/data/frontend-data-coverage-map.json` flip GAP→OK + asof populated; this closes the gauge-dashboard completion.
- ACTIVATION-GAP watch (pre-19:21Z sessions): occasional benign notebook 200L breaches until restart — NOT a regression.
