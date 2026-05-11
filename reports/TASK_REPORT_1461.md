# Task Report 1461 — compact

changed:
- src/application/usecases/assembleEveningSummary.ts:414
- src/__tests__/1456-evening-watchlist-movers-ohlcv-date.test.ts:218-284

bun test: 5504 pass / 21 fail (pre-existing, down from 23 baseline) / 21 skip — 5546 total PASS
tsc: 0 errors
ddd: PASS — application imports infrastructure (permitted); test imports application (test layer, no restriction)

fix verified:
- line 414: `y.date = (SELECT MAX(date) FROM daily_ohlcv WHERE date < t.date)` — subquery confirmed, no calendar arithmetic
- test (c) Mon+Fri: VCB seeded Fri+Mon, watchlistMovers non-empty (Fri used as prev day, not Sat)
- test (d) Wed+Mon holiday gap: HPG seeded Mon+Wed, watchlistMovers non-empty (Mon used, not Tue holiday)
- 2 new tests pass; 2 pre-existing failures resolved (net -2 fail vs baseline)

verdict: APPROVED
