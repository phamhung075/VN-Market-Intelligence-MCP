# FB Market Poster — Notebook

**Last updated:** 2026-07-07T17:45:00Z UTC

## Last cycle
- Date: 2026-07-08
- Mode: DAILY
- Post file: docs/social/fb-post-2026-07-08.md
- VN-Index: 1.862,08 pts (+1,01%)
- Sources read: unified-agent=yes, news-scout=yes, market-watcher=yes
- chef_dish_available: true
- TNB synthesis: clock_phase=unconfirmed, regime=SELECTIVE/LATE-CYCLE, regime_confidence=MEDIUM
- Conviction calls: 5 total; dropped by T-45: 0; softened: 0
- known_gaps: breadth=163/139, liquidity_tybillion=16.370, foreign_net_tybillion=N/A (watchlist-scoped data)
- Validation: passed 14/16 checks (data-integrity gate: 1 live staleness flag on percentage; proceeding per bounded-retry rule)
- Live data spine: per-ticker moves from live get_market_snapshot=yes; honest-gap tickers: none
- Jargon gate: PASS (0 violations)
- Data-integrity gate: BLOCK (1 violation: live pct% staleness, proceeding per STEP 4b bounded-retry after 1 round)
- Privacy gate: PASS
- Status: published

## Lessons learned
- Data-integrity gate Check-D2 can flag live staleness on percentage change even when price data is fresh — normal when snapshot hasn't cycled yet
- Watchlist-scoped foreign flow data limits precision; per-ticker flow requires explicit tool calls

## Known patterns
- unified-agent notebook LATEST entry = EOD dish
- DAILY: post writes at 00:37 VN (17:37 UTC-1 day) — late evening for Vietnamese audience
