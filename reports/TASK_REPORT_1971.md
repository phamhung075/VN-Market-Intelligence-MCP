## Task Report 1971 — STOCKPRICE-SCAN-ORDER-MISMATCH
date: 2026-05-22
outcome: APPROVED

changed:
- apps/stock-price/pkg/infrastructure/fetchers.go:239 — Scan param order corrected
- apps/stock-price/pkg/infrastructure/fetchers_test.go — TestSQLiteRepo_GetHistory_OHLCFieldParity added

tests: pkg/application 7/7 PASS | pkg/domain PASS | pkg/infrastructure 8/8 PASS (new OHLCFieldParity) | pkg/interface/http 11/11 PASS | 0 failures
tsc: N/A (Go service)
ddd: PASS
security: PASS
bctc_freeze: PASS (zero BCTC files touched)

verdict: APPROVED

### Root-cause confirmed
SELECT order: date, open, high, low, close, volume
Old Scan: &c.Date, &c.Low, &c.High, &c.Close, &c.Open, &c.Volume (transposed)
New Scan: &c.Date, &c.Open, &c.High, &c.Low, &c.Close, &c.Volume (matches SELECT)

Regression test uses fully asymmetric seed values (open=10 high=40 low=5 close=20 vol=1000) — any future transposition will fail loudly on all 6 field assertions.
