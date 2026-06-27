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

---

### STEP qa-S3 · qa · 2026-06-27T23:45:00Z
**task-id:** CLEAN-STALE-BRANCH-CI-RED-FIX-BUNTEST
**what-done:** ABORTED stale-branch cleanup — worktree at scratchpad/ci-red-fix is dirty; cannot remove without discarding uncommitted changes.
**what-considered:**
- only: zero unique commits verified (`git log main..ci-red-fix-buntest --oneline` empty); branch is fully merged
- Worktree dirty state: D apps/mcp-server/data, M bun.lock, M docs/agent-memory/modules/tool-usage-stats.json, + 3 untracked session files (docs/agent-memory/sessions/2026-06-27-{developer,ops,qa}.md)
- Procedure is explicit: "if dirty, ABORT + report" — force-discard is forbidden when real uncommitted work may exist
**why-decision:** Worktree contains modified tracked files (a deleted path + 2 modified files) — these may carry work not captured in any commit; per procedure, discarding without review is forbidden.
**why-change:** Cannot proceed to worktree remove; manual inspection or agent session termination required before retry.

---

### STEP qa-S4 · qa · 2026-06-27T23:50:00Z
**task-id:** TASK-FFT-L4
**what-done:** APPROVED TASK-FFT-L4 — coverage-map-aware SLA self-policing second pass; all gate checks green.
**what-considered:**
- DDD INVARIANT (load-bearing): grep for fs/path/readFile/Bun.file in coverageMapFreshnessChecker.ts returned empty — zero filesystem imports; only `bun:sqlite` (type) + `./freshnessSlaChecker.js` (domain sibling). ARCH-RATIFY-FFT-3 satisfied.
- Additive guarantee: L4 try/catch block appended AFTER existing 12-signal path (lines 453–522 of freshnessSlaMonitorJob.ts); SC-1 test confirms breaches=0, recoveries=0, escalations=0 with empty injected rows and fresh ages. Existing path untouched.
- 25 new tests (CM-1..CM-10 + SC-1..SC-4): 25/25 PASS (live run). 115/115 across 7 freshness/SLA files PASS.
- tsc: EXIT 0 (clean). scheduleCron=79 (unchanged). toolCount=166 (unchanged — L4 commit only touched 3 files, zero mcp-tools).
- SLA thresholds: SLA_MAX_STALENESS_MIN matches coverage-map SSOT exactly (realtime=15, intraday=60, daily=1560, weekly=11520, event=1560, static=null). Field name `sla` (not `sla_tier`) matches actual JSON rows.
- Full suite: Bun 1.3.13 JIT C++ crash at exit (626s elapsed — same known class as cycles 326–328); exit code 0; targeted suites all green.
- mock-guard: PASS. Security: no process.env, no secrets. DDD: no infra imports in domain service.
**why-decision:** All 5 QA verification items satisfied via direct RAW inspection. APPROVED.
**why-change:** Work already on main (commit 1dd3c6d1); no branch to merge. DONE flip applied.

---

### STEP qa-S5 · qa · 2026-06-28T00:15:00Z
**task-id:** TASK-FFT-L3B
**what-done:** CHANGES_REQUESTED — 2 blocking issues in dashboard.analysis.tsx: baked loader timestamp + missing second badge for dual-element page.
**what-considered:**
- tsc EXIT 0; 1754/2 vitest (2 pre-existing QUE_DESCRIPTIONS last-touch d7167c0a, git show 9bcb828b confirms zero QUE file touches); 4/4 e2e PASS; DDD PASS; security PASS
- 33 of 34 routes PASS: bctc-inspect raw-proxy skip genuine (loader=`new Response(html)`, no export default); kinh-dich-reference STATIC text correct per FR-5; EC-8 confirmed (toLocaleTimeString removed, generatedAt not tradingDate); marketHoursOnly=true on alerts+foreign-flow; generatedAt-over-asOf substitution sound for 6 weekly routes
- BLOCKING-1: analysis.tsx:255 `fetchedAt: new Date().toISOString()` is baked loader-execution time. KinhDichMarket.timestamp IS available in `market` object. Badge at line 1756 always shows green on load — can't reflect KD data that was stale before loader ran.
- BLOCKING-2: analysis.tsx has 1 badge (intraday) for a 2-element page (coverage map rows: kinh-dich=intraday, watchlist=realtime). DoD: "each element has its own <FreshnessBadge>". useFreshnessRevalidator("realtime") missing → watchlist refreshes at 5-min cadence instead of 1-min.
- NON-BLOCKING: coverage map kinh-dich-reference l3b_status="WIRED" (incorrect — no badge wired, correct per FR-5, but docs inaccurate)
**why-decision:** Trust-feature DoD explicitly flags analysis as multi-element example requiring per-element badges; dev checked the box but implementation has 1 badge and baked timestamp. Rubber-stamp would ship a badge that always reads "green" on load regardless of source freshness.
**why-change:** From plan (APPROVED): 2 analysis.tsx DoD misses block.
