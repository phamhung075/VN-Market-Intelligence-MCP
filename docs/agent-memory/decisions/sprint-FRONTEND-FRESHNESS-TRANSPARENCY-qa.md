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

---

### STEP qa-S2 · qa · 2026-06-27T23:10:00Z
**task-id:** TASK-FFT-L3A
**what-done:** APPROVED TASK-FFT-L3A — FreshnessBadge component + useFreshnessRevalidator hook; all gate checks green.
**what-considered:**
- 46 new tests (34 FreshnessBadge + 12 useFreshnessRevalidator): 46/46 PASS (verified live via `npx vitest run`)
- Full suite: 1754 pass / 2 fail — 2 failures are QUE_DESCRIPTIONS in `QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx` (last-touch d7167c0a, predates L3A commit afbb0c99; L3A commit touches zero QUE files — confirmed via `git show --stat afbb0c99 | grep que` returning empty)
- tsc: EXIT 0 (no output)
- RISK-5/EC-1 null-guard: `if (dataAsof === null)` short-circuits at FreshnessBadge.tsx:146 BEFORE any `<ClientTimeString>` call; 3 dedicated B-section tests prove it including explicit `not.toThrow()` test; also EC-4 static path fires first at line 137 (before null check — `dataAsof=null` + `static` tier → "Nội dung tĩnh", not "Chưa có dữ liệu")
- SLA thresholds: baked at module level per D1 (no runtime fetch). Values cross-checked against coverage-map SSOT (`docs/data/frontend-data-coverage-map.json` § sla_tiers) — all 6 tiers match exactly (realtime=[15,60000], intraday=[60,300000], daily=[1560,null], weekly=[11520,null], event=[1560,300000], static=[null,null])
- Hook cleanup: useFreshnessRevalidator.ts line 77 `return () => clearInterval(id)` — cleanup is the useEffect return function; test C ("NFR-A2: cleanup on unmount") verifies: (1) clearInterval called, (2) no new calls after unmount, (3) setInterval never called for passive tiers
- DDD: PASS (exit 1 on grep — no infrastructure/application imports)
- Security: PASS (no process.env, no secrets/tokens in production files)
- mock-guard: EXIT 0 — "[mock-guard] PASS — no fabricated-data patterns found in production source"
- No arch concern: pure Interface layer (React component + hook), no new MCP tool, no cross-service HTTP, no domain service
**why-decision:** All 5 QA requirements from handoff verified directly. No rubber-stamping of dev claims — ran tests live and cross-checked each critical path (null-guard, SLA SSOT alignment, cleanup). APPROVED.
**why-change:** Work already on main (commit afbb0c99 on main); no branch to merge. DONE flip unblocks TASK-FFT-L3B.
