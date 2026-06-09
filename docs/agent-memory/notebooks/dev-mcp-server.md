# dev-mcp-server -- Notebook

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
