# dev-mcp-server -- Notebook

## 2026-06-09 · BATCH5-CI-C-AL — DONE

**Task:** BATCH5-CI-C-AL (arch-S25 verdict table) | Sprint: CI-RED-RECONCILE | Size: L | DJ: dev-mcp-server-S24
**Scope:** 20 files — PHASE A (15 REWRITE-STALE test-only), PHASE B (4 FIX-PROD + their test rewrites), PHASE C (1821a GREEN-in-isolation, no work).
**Root cause diagnosis:**
- DT-3 regex fires on "Doanh thu thuần" in non-IS sections → CROSS_STMT_REVENUE_CONTRADICTION BLOCK (HC-human-confirm DV-HC-8).
- SECTION_HEADERS parser expects "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH" not "BẢNG KẾT QUẢ..." (TRUST-RED TR-RED-5b).
- SQLite TEXT PK B-tree ordering (alphabetical) ≠ insertion order → wrong BB values assigned (1309 AC-8).
- `mock.module` doesn't intercept statically-imported symbols loaded before the mock → DI injection via `_telegramBugFn` param required (1792).
- `FIX-BCTC-MAGNITUDE-NORMALIZE` paths A/B override `totalAssets` from identity, defeating BS corruption in test data → use IS corruption (`operatingMargin > 5.0`) instead (1792 CORRUPT_BCTC_TEXT).
- `bctc-eval-routes` HTTP 500: missing `total_assets REAL` column in test DDL.
- VPT-1 stale detection uses real clock; inject `now=2026-06-09T06:00:00Z` (UTC 06<15 = in-publish-window).
- `newsHeadlinesRefreshJob.e2e` used `/news/bloomberg/headlines` route; actual routes are `/bloomberg/headlines`.
**Prod fixes (PHASE B):**
- `bbAlertScanJob.ts`: added `ORDER BY code` to watchlist query for deterministic alphabetical iteration.
- `balanceSheetExtractor.ts`: 3 `sbMap === null` guards on FIX-BCTC-MAGNITUDE-NORMALIZE paths A/B + magnitude inference; path with sbMap≠null sets `effectiveMultiplier=1`.
- `parseBctcReport.ts`: added `_telegramBugFn` DI param; made `storeReport` async; replaced fire-and-forget with awaited DI-or-dynamic-import send.
**Commits:** `ad55e240` (Phase A — 15 test files), `cb03b761` (Phase B — 4 prod files + 6 test files).
**Result:** 179 pass / 0 fail across all 20 target files (2.30s). tsc CLEAN. Mutex released.

---

## 2026-06-09 · BATCH1-CI-C-TH-TRANSPORT-HANG-REWRITE — REVIEW

**Task:** BATCH1-CI-C-TH-TRANSPORT-HANG-REWRITE | Sprint: CI-RED-RECONCILE | Size: M | DJ: dev-mcp-server-S23
**Scope:** 3 test files rewritten — InMemoryTransport+Client replaced with `_registeredTools` direct handler invocation.
- `MSG-1-market-foreign-flow.test.ts`: 8 pass / 0 fail (421ms). `registerMarketWideForeignFlowTool(server, db)` + module-level `_testDb`/`_testServer` + `beforeEach`/`afterEach`. 3 unit tests unchanged (query helpers called directly).
- `RAPID-A-get-company-profile-tool.test.ts`: 8 pass / 0 fail (204ms). `registerCompanyProfileTools(server, () => db)` + `callToolDirect(server, args)`. Tests 1–6 (unit) unchanged. Tests 7–8 (MCP) rewired via `_registeredTools`.
- `RAPID-H-insider-lookback.test.ts`: 4 pass / 0 fail (201ms). `registerInsiderTools(server, () => _testDb)` + module-level fixtures. Test 3 (math cap) unchanged. Tests 1,2,4 rewired via `_registeredTools`.
**Root cause:** InMemoryTransport+Client ~5000ms timeout on Bun 1.3.13/Ubuntu CI (TRANSPORT-HANG class). Files pass alone locally — CONTAMINATION verdict confirmed by spike brief.
**Result:** 20 total tests (8+8+4), all pass alone. tsc CLEAN. ZERO it() removed. ZERO prod code touched. projected_delta -15 (55→36). Status: REVIEW.

---

## 2026-06-09 · FIX-CI-C1282a-DATA-FRESHNESS-REWRITE — REVIEW

**Task:** FIX-CI-C1282a-DATA-FRESHNESS-REWRITE | Sprint: CI-RED-RECONCILE | Size: S | DJ: dev-mcp-server-S22
**Scope:** 2 files — prod seam (additive-only) + test freeze (REWRITE-STALE, not REMOVE)
- `dataFreshnessTools.ts`: added `now?: Date` 3rd param; `const now_: Date = now ?? new Date()`; 2 internal refs `now` → `now_`.
- `system-data-freshness.test.ts`: module const `frozenNow = new Date("2026-06-09T04:00:00Z")`; beforeEach `const now = frozenNow`; TC-1..TC-4 all receive `(db, undefined, frozenNow)`. Stale "15 minutes" / "10 minutes" comment fossils updated.
**Root cause:** TC-1/TC-2 fossilized static 10-min assumption; prod uses MARKET_HOURS_ONLY_SOURCES dynamic threshold — off-hours expands threshold, so 12-min fixture = hasBreach=false off-hours. Freeze to in-market (04:00Z = 11:00 VN) collapses ambiguity.
**Result:** 8 pass / 0 fail (366ms). tsc CLEAN. ZERO it() removed. ZERO prod logic changed. orch TODO→REVIEW. ci_absolute untouched (57).

---

## 2026-06-09 · FIX-CI-C235-1792-TELEGRAM-MOCK-RESTORE — REVIEW

**Task:** FIX-CI-C235-1792-TELEGRAM-MOCK-RESTORE | Sprint: CI-RED-RECONCILE | Size: S | DJ: dev-mcp-server-S19
**Scope:** TEST-FILE-ONLY — 1 file: `apps/mcp-server/src/__tests__/1792-conviction-debounce.test.ts`
- Added `afterAll` to the `bun:test` import line.
- Added cache-busted `_realMod1792` import BEFORE L28 mock.module (`?isolate=1792`).
- Added file-bottom `afterAll` block restoring real telegram module via `_realMod1792` (8 exports: sendTelegramWork/Market/Bug, sendTelegram, notifyTelegramAlert/Document, formatConvictionBlock, deleteTelegramBug).
- C5-CURE: ZERO new file-top mock.module(). L28 existing stub + afterEach(closeDb) UNCHANGED.

**Root cause (arch-S16):** 1792 (pos 103) installs file-top stubs with NO restore → re-poisons registry AFTER 1485's afterAll cure (pos 89) fires. sendTelegramBug stub returns boolean true (not message_id number) → Task 235 (pos 775) captures poisoned stubs.
**Result:** 1792 solo: 3/2 (pre-existing 2 fails UNCHANGED). 1792+235 joint (2-file local, NOT authoritative): 13 pass / 2 fail (10 Task 235 pass). tsc CLEAN.
**Expected CI delta:** Task 235: 3→0 or 6→0 fails (arch-S16 gate).
**Status:** REVIEW — router owns push + CI gate.

---

## 2026-06-09 · FIX-CI-C1485-TELEGRAM-MOCK-RESTORE — REVIEW

**Task:** FIX-CI-C1485-TELEGRAM-MOCK-RESTORE | Sprint: CI-RED-RECONCILE | Size: S
**Scope:** TEST-FILE-ONLY — 1 file: `apps/mcp-server/src/__tests__/1485-telegram-mock-isolation.test.ts`
- Added `afterAll` to the `bun:test` import (line 13).
- Added file-bottom `afterAll` block restoring real telegram module via `_realMod1485` (8 exports).
- C5-CURE: ZERO new file-top mock.module(). Two existing it()-scoped stubs UNCHANGED.

**Root cause (arch-S15):** 1485 (pos 89 in full CI) installs `notifyTelegramAlert: async () => ({ ok: true })` inside two `it()` bodies with NO restore → leaks into process-global ESM registry → poisons 047 frozen captures (pos 315), 235 (pos 775), 1328e (pos 941).
**Result:** 1485 solo 2/0; 1485+1328e joint 14/0; 1485+235 joint 12/0. tsc CLEAN.
**Expected CI delta:** 1328e -10, 235 -3 = -13 floor from 68 absolute.
**Status:** REVIEW — router owns push + CI gate.

---

## 2026-06-09 · FIX-CI-C1328E-047-CONTAM-STUB — DONE-SUPERSEDED

**Task:** FIX-CI-C1328E-047-CONTAM-STUB | arch-S14. Fixed 047 contaminator (extended stub + afterAll restore). Side-wins: 1352a 4→2, 047 hygiene. Root cause re-triaged by arch-S15 to 1485 (SECOND CONTAMINATOR). Status = DONE-SUPERSEDED. Superseded by FIX-CI-C1485-TELEGRAM-MOCK-RESTORE.

---

## 2026-06-09 · FIX-CI-C1129-CALIBRATION-TEST-REWRITE — REVIEW

**Task:** FIX-CI-C1129-CALIBRATION-TEST-REWRITE | Size: S. Rewrote 1129 to `_registeredTools` direct handler invocation. Removed InMemoryTransport+Client. 5/0 local. tsc CLEAN. Expected -10 CI fails.

---

## 2026-06-09 · FIX-CI-C1134-FOREIGN-FLOW-TEST-REWRITE — REVIEW

**Task:** FIX-CI-C1134-FOREIGN-FLOW-TEST-REWRITE | Size: S. Rewrote 1134 direct handler pattern. AC-4 Zod bypass adapted; AC-6 explicit days:10 for default path. 6/0 local. tsc CLEAN. Expected -12 CI fails.

---

## 2026-06-09 · FIX-CI-C1124-EVIDENCE-TESTS-REWRITE — REVIEW

**Task:** FIX-CI-C1124-EVIDENCE-TESTS-REWRITE | Size: M. Replaced InMemoryTransport+Client with `_registeredTools` direct invocation (1117 pattern). 12/0 local (933ms). tsc CLEAN. Expected -24 CI fails.

---

## 2026-06-09 · FIX-CI-C5-UNMOCKED-HTTP-FETCHES — RE-DISPATCH REVIEW

**Task:** FIX-CI-C5-UNMOCKED-HTTP-FETCHES | Size: M | Baseline: 135.
3 files: 083 (removed 3 mock.module + DI seam), 123 (removed 3 mock.module + DI seam), analysis.ts (PROD: added 3 z.any().optional() Zod params). 083=16/0, 123=27/1skip/0. tsc CLEAN. Projected 135→~113.

---

## 2026-06-09 · FIX-CI-C3-DB-SINGLETON-SIGNAL-OUTCOMES — DONE

**Task:** FIX-CI-C3-DB-SINGLETON-SIGNAL-OUTCOMES | Size: XS. Fixed 1945b mock.module live-binding + ZERO_STRUCT contamination. Stable snapshot refs + afterAll _digestImpl restore. 74/0 across 7 files. tsc CLEAN.

---

## 2026-06-09 · FIX-CI-MCP-SDK-MOCK-CONTAM — DONE

**Task:** FIX-CI-MCP-SDK-MOCK-CONTAM | Size: XS. Extended MockMcpServer in 1862c with `.tool()`, `.registerTool()`, `_registeredTools`, `.server`, `.close()`, `.isConnected()`. 1862c=5/0; joint 26/0, 52/0, 7/0. tsc CLEAN.

---

## 2026-06-09 · FU-SCHEMA-DRIFT-P7-IMPL — DONE

**Task:** FU-SCHEMA-DRIFT-P7-IMPL | Size: M. Added `afterAll(closeDb + initDatabase)` to 7 close-no-init destroyer files (103, 1076, 1291, 182, 1869b, 231, 283). All 7 pass isolation: 62 total. tsc CLEAN. Expected 85-95% fail reduction (629→<50).

---

## 2026-06-09 FIX-CI-DEAD-REUTERS-TESTS + FIX-CI-DATA-SYMLINK-ENOENT — DONE

Cluster 5: deleted 2 deprecated reuters test files (Cannot find module errors). Cluster 2: setup.ts symlink guard (lstatSync+isSymbolicLink+unlink if broken). 125-e2e=39/0, 012-lancedb=6/0, 101-morning=14/0. tsc CLEAN.

---

## 2026-06-09 · FIX-SCHEMA-DRIFT-P5-SELFHEAL — REVIEW

**Task:** FIX-SCHEMA-DRIFT-P5-SELFHEAL | Size: S. getDb() self-heal: 9 init slices after PRAGMA. 002-db-schema=24/0; 182-portfolio-risk=10/0. tsc CLEAN. Target: fail+errors < 629.

---

## 2026-06-09 SPIKE-CI-C4-KINH-DICH-DIACRITICS (CI-RED-RECONCILE)

**C4:** kinhDichTools.ts — explain_hexagram rewired to QUE_DATA; get_hexagram_history alias fix; backtest line. leadershipTools.ts description. 1416 REMOVE (dead handler); 1410 REWRITE (AccuracyReport .text). 258/0 combined. tsc CLEAN. Status: REVIEW.

---

## 2026-06-09 FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS + FIX-CI-C3-RESIDUAL-DB-DESTROYERS

**Baseline:** 172 fail, 0 errors (sha 7bea53d0).
C1 (4 files, ~42 fails): 239 country VN→vietnam; 239-market getText JSON.parse; 239c schedule regex; 1352a getMacroExternal + FRED fetch mock + A-3 .rejects.
C3 (4 files, ~20 fails): 1295d FK + PRAGMA; 1124/1129/1173 afterEach client close.
88/0 + 42/0. tsc CLEAN. Both REVIEW.

## 2026-06-09 BATCH0-CI-C-DV-DELIBERATE-VIOLATION-CLEANUP — REVIEW

**BATCH0** (-4 native fails: 55→51). Three DV test fixes, test-only, no prod code.
A) 1331a TEST-2 REMOVED — require() to Go-only alert-engine src/ (no TS layer, path unresolvable). TEST-1 (SQLITE_BUSY structural) intact: 3/0.
B) DWF-is-trading-day AC-P0-3-6 → it.failing() — Tết DV control preserved as executable spec. 13/0 (was 12/1).
C) DWF-coordination-phase2 DV-P2-4 CONFIG-DRIFT rewrite: added SLOT_CLAIM_FILE + LEADER_LOCK_FILE constants; DV block REMOVED; test 1 reads slot-claim.md (ttl_seconds:180 confirmed); test 3 reads leader-lock.md (ttl_seconds:1800 confirmed). 32/0 (was 30/3). tsc CLEAN.

## 2026-06-09 FIX-CI-TELEGRAM-STUB-AFTERALL-SWEEP

C5-cure (cache-bust + afterAll restore) applied to ALL 6 telegram mock.module contaminator files in __tests__/.
PRIMARY (no afterAll): FIX-1290 (sendTelegramMarket), 1424a (noop stubs), 1345b (noop+capture stubs).
AUDIT (frozen-capture → cache-bust): 047, 1352a (full surface), 1356a (partial→full surface).
5/0 + 6/0 + 10/0 + 9/0 + 7/1(pre-exist) + 8/0. tsc CLEAN. Task REVIEW.
