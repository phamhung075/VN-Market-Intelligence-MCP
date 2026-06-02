# QA — Notebook



## cycle-187 · 2026-06-02T11:35Z · BAL-0 PUB-5..8 gates — APPROVED

Sprint: BCTC-ANALYTICS-LAYER | Task: BAL-0 | Commit: 9093f385 | Verdict: APPROVED

**Gate 1 — BAL-0-pub5-8-gates.test.ts: 25/25 PASS** (0 fail, 62 expect() calls, 222ms).
**Gate 2 — bctcPublishabilityGuard.test.ts: 16/16 PASS** (26 expect() calls).
**Gate 3 — 240-bctc-full.test.ts: 5/5 PASS** (14 expect() calls).
Total: 46/46 pass, 0 fail. tsc --noEmit: EXIT 0.

**Scope — git show --stat 9093f385:** exactly 2 files (1 prod bctcFullTools.ts +143 lines, 1 test BAL-0-pub5-8-gates.test.ts +765 lines). DV test in same commit as prod. CONFIRMED.

**DDD/Security scan:**
- Infrastructure imports (getDb, logger) are pre-existing on lines 22/25 — NOT introduced by this commit. Pattern is standard for all interface-layer tool handlers in this codebase.
- No new domain-rule logic leaked to interface layer: PUB-5/6/7/8 are serve-time guards (interface concern), not business rules (domain concern). Architecture is correct.
- No hardcoded secrets, no process.env. mock-guard: EXIT 0 (PASS).

**Behavioral spot-check — 4 gates confirmed non-tautological:**

PUB-5: DV-BAL0-PUB5-5 seeds HPG conf=0.44, calls full tool via callToolDirect, asserts text does NOT contain "=== BCTC SUMMARY" AND DOES contain "PUB-5" + "44%". Not a mock — exercises the full checkPublishability→tool-return code path. Gate is at bctcFullTools.ts:591 (conf < 0.5 → return publishable=false, tool returns reason string). Verified non-tautological.

PUB-6: DV-BAL0-PUB6-2 seeds DHG roa=7891932, calls full tool, asserts text does NOT contain "7891932" AND DOES contain "ROA              : N/A" AND DOES contain "PUB-6". Report is still served (publishable=true) — only the offending ratio is withheld. Valid scalars (net_revenue, net_profit, etc.) are not nuked. Architect spec confirmed: withhold ratio only, keep valid scalars. Gate is at bctcFullTools.ts:622-648 + buildSummarySection:194-201. Non-tautological.

PUB-7: DV-BAL0-PUB7-1 seeds FPT latest=Q1-2026 + prior=Q4-2025, calls full tool, asserts comparison section contains "PUB-7" + "mismatch" + "withheld" AND does NOT match /[+-]\d+\.\d+%/ (no percentage delta emitted). Gate is Case B in buildComparisonSection:321-328. Non-tautological.

PUB-8: DV-BAL0-PUB8-2 seeds rev=0, np=5597.9, conf=0.55 (above PUB-5 threshold of 0.5), calls checkPublishability, asserts publishable=false AND reason contains "PUB-8" + "Rev=0" + "55%". Threshold interaction confirmed: PUB-5 fires first for conf<0.5 (DV-BAL0-PUB8-1), PUB-8 fires at conf=0.55 (between 0.5..0.6). Gate is at bctcFullTools.ts:600-613. Non-tautological.

**Live container status:** NOT yet rebuilt. Source-layer gate APPROVED. Live behavioral flip (garbage serving stopped) requires ops rebuild. orch-state head updated: status=ready-for-rebuild, next_agent=ops.

---

## cycle-183 · 2026-06-02T05:27Z · A-01b-4 not_deployed fix — PASS

Sprint: A-01 (Dashboard two data planes) | Task: A-01b-4 | Verdict: PASS

**Clause A — false-RED resolved (read-only)**
- `GET localhost:4000/health` → `status:"ok"`, exactly 7 services `not_deployed` (pdf/rag/ta/stock/kinh-dich/alert/news), mcp+macro both `ok`, latencies −1 for not_deployed set.
- `docker ps` → exactly 5 containers running, all healthy. Zero of the 7 not_deployed services started.
- Frontend `localhost:3001/dashboard/services` → top badge green `UP`, each of the 7 shows grey `NOT DEPLOYED` badge, loader stream confirms `overallStatus:"ok"` + `status:"not_deployed"` x7 in SSR JSON.

**Clause B — anti-false-green PROVEN-RED (controlled live test)**
- `docker stop vn-market-intelligence-mcp-macro-indicators-1` executed.
- POST-STOP `GET localhost:4000/health` → `status:"degraded"`, `macro:"down"`. Overall is NOT `ok`. Not_deployed set unchanged (all 7 still `not_deployed`). PROVEN-RED: real deployed-service outage is NOT suppressed.
- `docker start vn-market-intelligence-mcp-macro-indicators-1` → restored. POST-RESTORE health: `status:"ok"`, `macro:"ok"`. Final container count: 5 (all healthy). None of the 7 not_deployed services were started at any point.

Both clauses PASS. No critical false-green detected. Fix correctly limits suppression to the known not_deployed set only.

---

## cycle-184 · 2026-06-02T08:10Z · FE-RR-QA-1 — FE-REROUTE Phase 1 — PASS

Sprint: FE-REROUTE | Task: FE-RR-QA-1 | Verdict: PASS | Commits: mcp-server 1f27d188, api-gateway c7f19ea3

**Container count: 5** (mcp-server, api-gateway, frontend, macro-indicators, mcp-gateway). Zero of the 7 not-deployed services started.

**KD readings (per-ticker, not constant)**
- FPT: `{"hexagram":39,"name":"Kiển","trend":"BẤT LỢI","signal":"BAN (tiêu cực)","confidence":0.475,"timestamp":"2026-06-02 05:47:03"}`
- VCB: `{"hexagram":8,"name":"Tỷ","trend":"TRUNG TÍNH","signal":"THAN TRONG (tích cực)","confidence":0.475}`
- Differ: hex 39 vs 8, signal negative vs positive. Per-ticker DB data confirmed.

**DB spot-check (anti-mock)**
- `kinhdich_readings WHERE stock_code='FPT' ORDER BY timestamp DESC LIMIT 1` → hexagram_number=39, trading_signal="BAN (tiêu cực)", confidence=0.475, timestamp="2026-06-02 05:47:03". Matches endpoint exactly. No Math.random, no placeholder data in handler files.

**KD market aggregate**: `{"hexagram":29,"name":"Tập Khảm","derived":true}` — derived field present.

**Price history VNINDEX**: 4 rows, dates 2026-05-28→2026-06-02, close range 1836.1–1863.67 (plausible VN-Index). FPT: 5 rows, 2026-05-28→2026-06-02, close 71200–74900.

**Batch prices FPT/VCB/HPG**: FPT close=74900 changePct=+2.74 direction=up; VCB close=62100 changePct=-0.16 direction=down; HPG close=23850 changePct=-0.83 direction=down. Real per-ticker data.

**News Reuters**: `{"source":"reuters","count":0,"articles":[]}` — honest empty (no reuters rows in DB yet), HTTP 200, not 502, not fabricated.

**TA honest-503**: POST /ta/ta/indicators → HTTP 503 `{"error":"not_deployed","service":"ta","detail":"Service \"ta\" is not deployed..."}`. Not 502, not fabricated indicators.

**Frontend SSR** (localhost:3001/dashboard/analysis?stock=FPT): stream contains hexagram 39 "Kiển" for FPT, hex 29 "Tập Khảm" for market, VNINDEX=1836.1, FPT close=74900, all 30 watchlist tiles with real prices. Zero "502" error string in loader data. TA field present but data from mcp agent_signals (not TA service). No "Không tải được" error banner found in stream data.

**Anti-mock**: priceBatchHandler.ts "placeholders" = SQL parameterized `?` markers — correct security practice, not fake data. Zero Math.random / fabricated values in all 5 new handler files.

VERDICT: PASS — all 7 acceptance criteria met. Real DB-backed data via gateway re-route; TA honest-503; news honest-empty; 5 containers; SSR renders real values.

---

## cycle-185 · 2026-06-02T10:10Z · BCTC-EXTRACT-QUALITY BEQ-5..8b — CHANGES_REQUESTED

Sprint: BCTC-EXTRACT-QUALITY Phase-2 | Gate: BEQ-5/6/7/8/8b/cbdad2d6 | Verdict: CHANGES_REQUESTED

**Commits verified on main:** 1da34f8d(BEQ-5) a8cbe91d(BEQ-6) 6b2f72b2(BEQ-7) 1f726140(BEQ-8) 8845e5d6(BEQ-8b) cbdad2d6(PI3 stale-test fix) — all present.

**BEQ-specific tests: 32/32 pass** (BEQ-SECTION-GUARD 10, BEQ-BANK-DISCRIM 3, BEQ-4a-extension 3, BEQ-4a-pending-docs-guard 4, BEQ-4b 4, BEQ-2 4, BEQ-3 4). 0 fail.

**BLOCKING: PI3-bctc-inspect-reopen2.test.ts: 9 fail / 16 pass.** Root: LIST_SQL in bctcInspectHandler.ts selects `refine_status` (added in BEQ-4a commit 0523b435), but reopen2 test uses a hand-crafted minimal schema missing that column. Handler throws SQLite error -> 500 -> body.count/items undefined. cbdad2d6 fixed PI3-bctc-inspect.test.ts (uses initFinancialReportsTables full schema) but MISSED reopen2. Fix: add `refine_status TEXT DEFAULT 'PENDING'` to reopen2 setupTestDb() DDL.

**tsc: 0 errors. DDD: clean. Security: clean.**

**Behavioral proof (tests, not dry-run — container not rebuilt):** balance-sheet-only (VNM codes 100/280/300/400) -> status=SKIPPED refine_status=PARTIAL; BEQ-8 FPT codes -> notApplicable=[]; ACB Roman codes -> notApplicable includes gross_profit. All DB writes verified via in-test sqlite query.

**Live DB:** 12 tickers PENDING (direct container bun query). Container NOT rebuilt — source-verified only. Live flip to PARTIAL pending ops rebuild.

**Action:** fixer adds `refine_status TEXT NOT NULL DEFAULT 'PENDING'` to setupTestDb() DDL in PI3-bctc-inspect-reopen2.test.ts. Then re-run: expect 25/25 pass.

---

## cycle-186 · 2026-06-02T12:18Z · BCTC-EXTRACT-QUALITY BEQ-5..8b — RE-GATE APPROVE

Sprint: BCTC-EXTRACT-QUALITY | Task: BEQ-QA re-gate | Verdict: APPROVE | Fixer commit: 61747444

**Gate 1 — PI3-bctc-inspect-reopen2.test.ts: 25/25 PASS** (was 16/9). fixer commit 61747444 added `refine_status TEXT NOT NULL DEFAULT 'PENDING'` + `bctc_layout_units` table to setupTestDb(). All 9 prior SQLite "no such column" failures resolved. 77 expect() calls, 103ms.

**Gate 2 — BEQ 7-file regression: 32/32 PASS.** Files: BEQ-2-backfill-eligibility, BEQ-3-scalar-aggregate-full-audit, BEQ-4a-extension, BEQ-4a-pending-docs-guard, BEQ-4b-pending-comparison-guard, BEQ-BANK-DISCRIM, BEQ-SECTION-GUARD. 169 expect() calls, 472ms. Zero regression from fixer commit.

**Scope of fixer commit 61747444:** single test file (apps/mcp-server/src/__tests__/PI3-bctc-inspect-reopen2.test.ts), 12 insertions, zero production code changes. Gates 1/3/4 (tsc, DDD, security) confirmed passing in prior cycle — no production code touched.

**orch-state head updated:** status=ready-for-rebuild, next_agent=ops. Sprint EXIT gated on post-rebuild live verification (po).

**Next:** ops docker compose build --no-cache mcp-server && up -d --no-deps --force-recreate mcp-server. BEQ-6 PENDING->PARTIAL guard + 6 contained-report live suppression confirmed only post-rebuild.
