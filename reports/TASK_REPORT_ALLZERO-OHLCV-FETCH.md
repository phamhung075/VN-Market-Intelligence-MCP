## Task Report ALLZERO-OHLCV-FETCH
changed: [apps/mcp-server/src/interface/mcp/tools/market-data/priceHistoryTools.ts:207-219, apps/mcp-server/src/scheduler/market-data/allzeroOhlcvBackfill.ts (NEW 148L), apps/mcp-server/src/__tests__/ALLZERO-OHLCV-FETCH.test.ts (NEW 247L)]
tests: 5 pass / 0 fail (targeted) | 12942 / 0 fail (full suite — Bun runtime OOM crash post-completion, pre-existing pattern) | tsc: 0 errors | ddd: PASS | security: PASS | mock-guard: PASS
verdict: APPROVED

impl_commit: 9088c052
verified_by: qa
verified_at: 2026-06-14T10:22:00Z
verify_note: 5/5 AC pass; tsc clean; generic purge (open=0 AND high=0 AND low=0 AND close=0, no ticker hardcode); idempotent (close<100 guard excludes normalized rows on re-run); no shell injection; no bctc regression; live: VCB 06-01 close=62200 confirmed, BB SHB=0.88%/VCB=1.92%/FPT=2.14% all <15%; FIX-FE-CHART-PRICE-DOMAIN unblocked.
