# Notebook — unified-agent
**Last updated:** 2026-05-11 (18:05 UTC) | **Sprint:** current

## Session Summary
Market cycle (Mon 01:00 UTC+7 trigger). System healthy — all 16 CBs clear. REGIME NEUTRAL unchanged. Market closed (pre-open). 4 open alerts (1 HIGH GAS oil/geopolitical, 3 LOW foreign net-sell cluster). Portfolio: FPT only at -10.5% unrealised; conviction MODERATE → GIẢM BỚT recommendation. No conviction shifts ≥0.3. WORK telegram sent.

## Patterns
- TradingEconomics source persistently down (79 consecutive failures) — regime extraction relying on cached/previous data only; no DXY or US10Y signals available until source restored
- vnstock RATE_LIMITED on GVR/VRE recurring each cycle; self-recovering but adds noise to system errors log
- get_sentiment_trend requires stock_code param — not callable as portfolio-wide scan; flow doc implies no-arg call → doc mismatch
- get_insider_signals requires code + outstandingShares — not a portfolio sweep tool; flow step 4 implies portfolio-level call → doc mismatch
- Unreviewed market messages response 78k chars — exceeds token limit at limit=50; needs smaller limit or pagination
- 94% of alerts unscored (news_mention/volume_spike/macro_deviation) — accuracy metric unreliable at current scoring coverage

## Carry-over
- FPT conviction watch at Mon market open (02:00 UTC); -10.5% position, GIẢM BỚT signal
- Foreign net-sell 4,300B VND/week — watch acceleration Mon
- VN-Index 1925 resistance key level for Mon 11/5 session
- Doc self-heal: market.md — note get_sentiment_trend/get_insider_signals require params (not portfolio-wide)
