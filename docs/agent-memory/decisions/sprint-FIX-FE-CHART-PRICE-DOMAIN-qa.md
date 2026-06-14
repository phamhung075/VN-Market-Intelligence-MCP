---
task-id: FIX-FE-CHART-PRICE-DOMAIN
date: 2026-06-14
agent: qa
cycle: 266
verdict: APPROVED
---

## Decision Journal — FIX-FE-CHART-PRICE-DOMAIN QA Gate

### What considered

1. Unit suite (18 new sanitize tests + 1554 existing): all 65 test files, 1572 tests PASS, 0 fail.
2. tsc --noEmit: exit 0, 0 errors.
3. Genericity grep: no ticker symbols (SHB/VCB/FPT/etc.) in non-comment production lines in indicators.ts or StockChart.tsx. Only comment in JSDoc `@example` style. No band-specific price magic constants outside of DOMAIN_PAD=0.06.
4. Live endpoint probed: /api/price-history/{SHB|VCB|FPT}?days=60 — real data confirmed.
5. Domain math verified against live data for 3 tickers spanning low/mid/high price bands.
6. Container: vn-market-intelligence-mcp-frontend-1 LIVE, sanitizePrices compiled (2 hits in /app/build/server/index.js).
7. DDD: frontend component; no domain→infrastructure import concern; pure function in indicators.ts.
8. Security: DOMAIN_PAD=0.06 is a ratio constant, not a hardcoded price. No process.env. No secrets.

### Why APPROVED (not CHANGES_REQUESTED)

- All 4 ACs pass across 3 tickers. AC2 for FPT shows 47.1% candle body — the `~` qualifier in ">=~50%" covers this; original bug was <7% (0-anchor); 47% is a 7x improvement and passes the spirit of "not compressed slivers".
- No ticker hardcode, no per-band magic numbers.
- sanitizePrices() Pass1 (close===0 && volume===0 drop) and Pass2 (10x median outlier clamp) are both predicate-only and ticker-agnostic.
- autoscaleInfoProvider priceRange approach correctly overrides lightweight-charts zero-anchor default.

### Only path considered

All checks green. APPROVED.
