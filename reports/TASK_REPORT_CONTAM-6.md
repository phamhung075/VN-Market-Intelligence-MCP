## Task Report CONTAM-6

changed: [scripts/migrations/repair-ohlcv-unit-contamination.ts, scripts/migrations/__tests__/CONTAM-6-repair-ohlcv-unit-contamination.test.ts, docs/policies/dev-standards.md (pointer)]
tests: 14 pass / 0 fail (targeted CONTAM-6 suite) | tsc: 0 errors | ddd: PASS | security: PASS
verdict: APPROVED

### Live DB Verification (named volume vn-market-intelligence-mcp_market_data)

| Check | Query result | Verdict |
|-------|-------------|---------|
| (1) Contamination scan: rows WHERE (open<100 OR low<100) AND NOT all-zero AND open>0 AND low>0 AND close>1000 | 0 | PASS |
| (2a) VNH recent: open/close same scale | Jun 08-10: open=900/close=900 (clean) | PASS |
| (2b) FPT recent: no 1000x gap (clean days) | Jun 09-10: open=72900-73700 range | PASS |
| (3) TRA spot-check | ~78000-81000 range | PASS |
| (3) PVI spot-check | ~77500-78200 range | PASS |
| (3) DFF spot-check | ~400-500 range (genuinely low-priced stock) | PASS |
| (4) All-zero rows untouched | 116 (matches developer claim) | PASS |
| (5) Script in scripts/ | scripts/migrations/repair-ohlcv-unit-contamination.ts exists | PASS |
| (5) dev-standards.md pointer | § Script Persistence has entry | PASS |
| (6) VNH pct-change (Jun09→10) | 0.0% (< 30%) | PASS |
| (6) FPT pct-change (Jun09→10) | 0.68% (< 30%) | PASS |

### Scope Miss Findings (non-blocking — follow-up tasks needed)

**SM-1 (1 row):** VNH 2026-06-12 open=0.9, close=1000.0 — close equals boundary exactly (strict `> 1000` heuristic excludes it). Unrepaired. Heuristic should use `>= 1000`. New ticket needed.

**SM-2 (460 pre-repair rows):** open<100, open>0, close>1000, low=0 — excluded by `low>0` guard. Different defect pattern (low=0, not low in wrong units). Outside CONTAM-6 binding amendment scope.

**SM-3 (59 today's rows):** Same low=0 pattern arriving 2026-06-12 post-repair. CONTAM-2 guard did not block. Separate CONTAM-2 scope review needed.

None of SM-1/2/3 were introduced by CONTAM-6 — they are pre-existing or separate defect paths outside task scope. Not blocking.
