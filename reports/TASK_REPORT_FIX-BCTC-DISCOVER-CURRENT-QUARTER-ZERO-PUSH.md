## Task Report FIX-BCTC-DISCOVER-CURRENT-QUARTER-ZERO-PUSH
changed: [apps/mcp-server/src/__tests__/FIX-BCTC-PIPELINE.test.ts:187, apps/mcp-server/src/__tests__/BCTC-1943-queue-reset-and-retry.test.ts:261]
tests: 13204 pass / 45 fail / 42 skip | tsc: 0 errors | ddd: PASS (test-only change) | security: PASS (test-only change)
verdict: APPROVED

### Re-validation (cycle-293) — test contract fix only
Commit under review: 97546591
Production fix commit: 3eebf3bc (UNTOUCHED — git log -1 confirmed)
Scope: 2 test files + dev notebook + orch-state board flip. No production code.

New assertions verified first-hand:
- FIX-BCTC-PIPELINE.test.ts:187 — `expect(row.attempts).toBe(1)` on reached-source empty ([]). _fetchHsx returns [] = network-level discovery completes with 0 URLs → increment. CORRECT.
- BCTC-1943-queue-reset-and-retry.test.ts:261 — `expect(row?.attempts).toBe(1)` + status="pending" on all-mockFetchEmpty sources. All mocks reach source and return [] → increment; attempts=1 < MAX=5 → stays pending. CORRECT.

Discrimination verified: TERM-4 (ECONNREFUSED catch path = pre-network throw = no increment) is LEFT UNTOUCHED. test at FIX-BCTC-PIPELINE.test.ts:155 asserts only status="pending" not attempts, which is correct because mockFail throws before reaching source.

2-file targeted run: 24 pass / 0 fail.

Full suite 45 fails — all 17 failing files DISJOINT from commit 97546591's 4 changed files:
- Network timeout (5000ms+): 102-job-news-poll, 1146-insider-transactions, 1518-foreign-flow-ohlcv, TSU-DEV-U5, 1324-push-news-all-sources, 1892a-pushNewsHandler, 1898b-rss-degradation, 251-mcp-tools, RAPID-B2-get-market-cap — Chromium-absent/flaky-network
- Schema pre-existing (a42d0835 revert 2026-06-08): 1113-vps-proxy-health, VPT-1-vps-proxy-health-endpoint, 1193-push-prices-persist, 1858c-logvpspush-fix, 1405b-bctc-vps-fixes, 235-telegram-send-merge, 1875c-record-signal-outcome-routing
- Deprecated stale contract: 1302-technical-indicators (deprecated path)

Zero overlap with changed files. rebuild_required:true remains (ops must rebuild mcp-server container for production fix 3eebf3bc to take effect).
