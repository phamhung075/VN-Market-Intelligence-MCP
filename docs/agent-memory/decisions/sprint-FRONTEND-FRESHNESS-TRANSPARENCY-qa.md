# Decision Journal — Sprint FRONTEND-FRESHNESS-TRANSPARENCY · qa

**Sprint goal:** Add data_asof freshness contract to 5 MCP-server handler responses
**Agent:** qa
**Started:** 2026-06-27T20:25:00Z

---

### STEP qa-S1 · qa · 2026-06-27T20:35:00Z
**task-id:** TASK-FFT-L2
**what-done:** APPROVED TASK-FFT-L2 — 5-handler data_asof contract; all checks green.
**what-considered:**
- Spec column deviations (3 columns): verified each real column EXISTS in live DB via PRAGMA table_info probe (`sent_at` in `market_messages`, `triggered_at` in `alerts`, `updated_at` in `daily_ohlcv`, `pushed_at` in `vps_push_log`)
- Full suite: Bun 1.3.13 JIT C++ crash (Elapsed 494s) — same URL and known class (cycle-326 baseline); targeted runs clean (20/0 new, 34/0 alerts regression, tsc exit 0)
- Empty-table/sentinel paths: test matrix covers (b) empty-table per handler; priceHistory unique: 404 on no-rows (data_asof absent on 404, correct), empty-string sentinel guard returns null → fallback confirmed
**why-decision:** All 4 schema columns verified live; no hardcoded values (live DB returns real timestamps); 20/20 new tests + 34/34 regression pass; tsc clean; DDD + security + mock-guard all PASS; toolCount 166 unchanged; coverage-map rows_no_asof 8→2 accurate.
**why-change:** Work already on main (no branch — per NO-BRANCH policy); merge step N/A; DONE flip replaces merge.
