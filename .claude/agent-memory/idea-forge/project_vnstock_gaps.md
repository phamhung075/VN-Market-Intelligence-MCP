---
name: VNStock Unused API Gap Analysis
description: Strategic upgrade map — 7 vnstock data sources not yet wired into the pipeline, ranked by investment alpha potential
type: project
---

7 vnstock data gaps identified on 2026-04-03, ranked Critical → Medium:

1. **CRITICAL — Intraday ticks** (`quote.intraday()`): volume spike detection currently runs on 15-min OHLCV; intraday ticks enable sub-minute institutional accumulation detection during market hours (09:00–15:30). No table or fetcher exists yet.

2. **CRITICAL — Order book** (`quote.price_depth()`): bid/ask depth reveals institutional buying pressure vs retail panic. No table or fetcher exists yet.

3. **HIGH — Corporate events** (`company.events()`): dividend ex-dates, AGM, share issuance are NOT tracked as structured data. `earningsCalendar.ts` handles BCTC deadlines only (hard-coded). Events feed the catalyst calendar.

4. **HIGH — Foreign net flow delta** (derive from trading_stats snapshots): `vnstock_trading_stats` stores point-in-time `foreign_volume` but never computes day-over-day delta. Foreign net buy/sell is the single most-watched "smart money" signal in VN retail market.

5. **HIGH — Balance sheet + Cash flow quarterly** (`finance.balance_sheet()`, `finance.cash_flow()`): `vnstock_financials` only stores income statement + ratios. Full three-statement model requires these two. PDF path exists but SSC upload can lag 30 days.

6. **MEDIUM — Company news** (`company.news()`): would add a 6th news source, company-specific, reducing latency vs generic RSS. Not wired into `pollNews.ts`.

7. **MEDIUM — ratio_summary + profile** (`company.ratio_summary()`, `company.profile()`): sector P/E comparison and company overview (founding date, charter capital, industry code). Currently `compare_stocks` shows individual ratios but no sector benchmark.

**Why:** User wants institutional-grade edge as retail investor in VN market. Foreign net flow and order book are the two signals professional VN traders watch daily.

**How to apply:** When planning new sprints, prioritize these in order. Intraday + order book need new cron slots (every 5 min during market hours). Foreign flow delta needs only a store-layer change (no new fetcher call).
