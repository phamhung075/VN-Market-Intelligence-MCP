# Sprint TASK-17 — PO Decision Journal

### STEP po-S1 · po · 2026-06-11T09:38:05Z
**task-id:** TASK17-FOREIGN-FLOW
**what-done:** Picked Foreign-flow net-buy/sell as the next TASK-17 page after live-probing all 4 candidate sources against the named volume `vn-market-intelligence-mcp_market_data` (DB_PATH=/app/data/market.db, the volume mcp-server actually mounts).
**what-considered:**
- Foreign-flow → table `vnstock_trading_stats`: 3369 rows, 635 non-zero foreign_volume, 91 rows dated TODAY 2026-06-11 (MAX fetched_at 08:59:55), directional (30 net-buy / 61 net-sell of 103 tickers). LIVE + FRESH + directional. WINNER.
- Events calendar → `vnstock_events`: 2603 rows but 0 future-dated (max event_date 2026-06-08, all past). A calendar with zero upcoming events = demo-over-empty. ELIMINATED.
- Sector rotation → NO sector/industry table exists at all. Source missing → dev task to build aggregation source first (zone apps/stock-price or apps/mcp-server), not a frontend task now. ELIMINATED-as-frontend.
- P3 (AGM plan-vs-actual `agm_plan` 323 / `agm_actuals` 2084; prediction_claims=7): viable but lower daily-analytical value than today's live foreign flow.
**why-decision:** Highest user value × source CONFIRMED live-healthy-fresh. Only foreign-flow satisfies the anti-demo invariant with same-day directional data a non-technical user can reason from ("nước ngoài đang bán ròng NVL/VPB hôm nay").
**why-change:** no change from plan ordering — invariant eliminated the 2 higher-listed candidates (events/sector) on empty/missing source, promoting foreign-flow.
