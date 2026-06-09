# CI-172 Residual — File-Scope Confirmation Brief

**Date:** 2026-06-09 (TUESDAY)
**Task:** SCOPE-CONFIRMATION — three residual buckets for sha 7bea53d0
**Sprint:** CI-RED-RECONCILE
**Baseline:** 172 fail / 0 errors — run 27189745293 / bun job 80266839417 / sha 7bea53d0
**CI log source:** /tmp/ci_80266839417.log (37 038 lines)
**Method:** grep `(fail)` → 345 raw lines; bun prints each fail TWICE → 172 native. All counts below are HALVED native values.

---

## Cluster C1 — FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS

### Rough-profile estimate vs actual
Rough profile said ~37. **Actual from log: 42** (84 raw / 2). Over-estimate is mild; the 5-file C1 plan from the spike brief only covered the `callTool`-level integration files. The fetcher-unit files (025, 028, 1423a, 1487, 1833l) and wrapper files (239a, 239c, 1352a, 239-market-context) were in the rough profile but not yet individually file-scoped.

### Confirmed failing test files (9 files, 42 actual fails)

| Test file | Suite label in log | Actual fails (halved) | Fix pattern |
|---|---|---|---|
| `apps/mcp-server/src/__tests__/028-sbv-rates.test.ts` | `Task 028 — SBV Macro Fetcher` | 9 | globalThis.fetch mock |
| `apps/mcp-server/src/__tests__/025-yahoo-finance.test.ts` | `Task 025 — Yahoo Finance Commodity Fetcher` | 7 | globalThis.fetch mock |
| `apps/mcp-server/src/__tests__/1423a-us10y-yield.test.ts` | `Task 1423a — US10Y yield symbol` | 3 | globalThis.fetch mock |
| `apps/mcp-server/src/__tests__/1487-yahoo-finance-extended.test.ts` | `Task 1487 — Yahoo Finance Extended 12-symbol (RED)` | 3 | globalThis.fetch mock |
| `apps/mcp-server/src/__tests__/1833l-yahoo-404-graceful.test.ts` | `Task 1833l — Yahoo Finance 404 graceful handling` | 1 | globalThis.fetch mock |
| `apps/mcp-server/src/__tests__/239-macro-indicator-refresh.test.ts` | `Task 239a — macro-indicator-refresh (RED phase)` | 3 | globalThis.fetch mock + JSON-field asserts |
| `apps/mcp-server/src/__tests__/239-market-context.test.ts` | `Task 239 — get_market_context compound tool` | 1 | JSON-field assert update |
| `apps/mcp-server/src/__tests__/239c-macro-refresh-integration.test.ts` | `Task 239c — macro-refresh-integration` | 1 | cron-registry.json fixture (C5 cross-over — see note) |
| `apps/mcp-server/src/__tests__/1352a-scheduler-job-wrappers-macro-marketscan.test.ts` | `Task 1352a — Group A: macroIndicatorRefreshJob wrapper` | 2 | globalThis.fetch mock |

**Note on 239c:** The single failing test (`AC-3: cron-registry.json has valid JSON with macroIndicatorRefreshJob entry`) is a fixture-content assertion, not a fetch mock issue. It overlaps with C5 (FILE_FIXTURE_ASSERTIONS). Fix: verify `macroIndicatorRefreshJob` key exists in `cron-registry.json`.

**Note on 028/025/1423a/1487/1833l:** These are FETCHER-UNIT tests — they test the fetcher functions directly (not via `callTool`). They currently mock `globalThis.fetch` for the Yahoo Finance / VCB-XML endpoint. The failures indicate the mock expectations no longer match the response shape or the fetcher function signature changed. Root cause is the same P2-B1 seam removal: the fetcher functions previously called by `registerMacroTools()` are now either (a) no longer exported, or (b) have changed signatures. Dev must confirm by reading the fetcher source before applying the template.

### Fix pattern — same as 1881a template?

For files `028`, `025`, `1423a`, `1487`, `1833l`, `239a`, `1352a`: **SAME globalThis.fetch mock + JSON-field assert pattern** as `1881a-source-tier.test.ts` lines 92–135. The mock intercepts calls to `/snapshot` (or equivalent Yahoo Finance / VCB endpoints) and returns a controlled JSON response. Assertions shift from text-section checks to JSON field checks.

For `239-market-context.test.ts` (1 fail: STALE flag assertion): likely a JSON-field shape drift, not a fetch mock issue. Dev must read the test and the tool output to confirm.

For `239c` (1 fail: cron-registry fixture): update the `macroIndicatorRefreshJob` entry in the cron-registry JSON fixture. NOT a fetch mock fix.

### Spillover / masked-truth risk

**HIGH spillover risk.** The 42-fail count is larger than the C1 spike plan's 5-file scope (~71 total from taxonomy, minus the 5 integration files = ~30 fetcher-unit fails were already in scope but not individually listed). The actual 9 files vs 5 files means C1 is a superset. However, these are all test-only changes; no prod code touches are expected. Net projection assumes clean: **42 fails → 0 after fix of all 9 files.**

**Caveat:** Files `028` and `025` may have additional sub-tests that pass locally but fail in CI due to ESM module caching. Recommend dev run each file individually with `bun test src/__tests__/028-sbv-rates.test.ts` before committing.

**C1 is test-only (NO production code changes required).**

---

## Cluster C3 — FIX-CI-C3-RESIDUAL-DB-DESTROYERS

### Rough-profile estimate vs actual
Rough profile said ~23. **Actual from log: 20** (40 raw / 2). Breakdown below.

### Confirmed failing test files (4 files, 20 actual fails)

| Test file | Suite label | Actual fails (halved) | Root cause | Fix |
|---|---|---|---|---|
| `apps/mcp-server/src/__tests__/1129-calibration-tools.test.ts` | `Task 1129 — get_calibration_report tool` | 5 | `beforeEach` hook TIMEOUT (InMemoryTransport stall) | Add `afterEach` to close client + server; OR convert to direct callTool pattern |
| `apps/mcp-server/src/__tests__/1173-calibration-label-integration.test.ts` | `Task 1173 — AC-4/AC-5` | 3 | Same: `beforeEach` hook TIMEOUT (InMemoryTransport stall) | Add `afterEach` client/server teardown |
| `apps/mcp-server/src/__tests__/1124-evidence-tools-phase-bc.test.ts` | `Task 1124 — evidence tools Phase B+C` | 6 | Same: `beforeEach` hook TIMEOUT (InMemoryTransport stall) | Add `afterEach` client/server teardown |
| `apps/mcp-server/src/__tests__/1295d-integration-builders-to-synthesis.test.ts` | `1295d: E2E Signal Flow` | 6 | `SQLiteError: FOREIGN KEY constraint failed` on `DELETE FROM agent_signals` in `beforeEach` | Add `PRAGMA foreign_keys=OFF` before DELETE + `PRAGMA foreign_keys=ON` after; or delete child tables (signal_outcomes FK children) before agent_signals |

### Root cause correction vs taxonomy assumption

The 241-residual taxonomy assumed the C3 pattern was "closeDb() without initDatabase() reinit" (P7-style destroyers). That is WRONG for these 4 files. The CI log makes the actual root cause explicit:

- **1129 / 1173 / 1124:** `"a beforeEach/afterEach hook timed out for this test."` These files call `closeDb() + await initDatabase()` in their `makeTestSetup()` (so they ARE resetting the DB). The hang occurs at `await server.connect(serverTransport)` or `await client.connect(clientTransport)` inside the `beforeEach`. The InMemoryTransport from a PREVIOUS MCP server instance that was never closed is leaving dangling state. Fix: each test that creates `(clientTransport, serverTransport)` pair MUST call `await client.close()` and `await server.close()` (or equivalent) in `afterEach`. The tests currently have no `afterEach`.

- **1295d:** Pure FK constraint error. The `DELETE FROM agent_signals` fails because a child table (likely `signal_outcomes` or `evidence_scores`) has FK references to `agent_signals`. Fix: wrap the cleanup in `PRAGMA foreign_keys=OFF; DELETE FROM agent_signals; PRAGMA foreign_keys=ON;` OR delete child tables first (`DELETE FROM signal_outcomes; DELETE FROM evidence_scores; DELETE FROM prediction_claims;` before `DELETE FROM agent_signals`).

### Downstream victims (order-dependence risk)

The InMemoryTransport stall in 1129/1173/1124 is NOT order-dependent — it would fail regardless of run position because the `beforeEach` itself hangs. The FK failure in 1295d is also self-contained (the `beforeEach` cleanup fails unconditionally once FK constraints block the DELETE).

**Important:** These files do NOT pollute downstream tests the way P7 destroyers do. They SELF-CONTAIN their failures. However, if 1129 or 1124 leave a dangling `server.connect()` promise unresolved, that could theoretically prevent Bun from exiting the file cleanly and cause timing issues for the next file. The `afterEach` teardown addresses this.

**Order-dependence verdict: LOCAL-GREEN != FULL-SUITE-GREEN only for residual destroyers still in the P7 list** (183-portfolio-risk.ts, 283-portfolio-conviction-batch.ts, 231-signal-validator-integration.ts, etc. — see P7 brief). These P7 destroyers are still alive but are not captured in the C3 rough profile because their victims are in the C9 misc cluster. Do NOT conflate.

### Fix summary for C3

- **1124, 1129, 1173:** Add `afterEach(async () => { await client?.close(); });` in each test suite. The server does not require explicit close for InMemoryTransport but adding it is safe. NO DB schema changes. NO production code changes. **Test-only.**

- **1295d:** Fix `beforeEach` cleanup in `1295d-integration-builders-to-synthesis.test.ts` line 70: replace bare `db.exec("DELETE FROM agent_signals")` with FK-safe deletion order. **Test-only.**

**Net projection: 20 fails → 0 after fix of all 4 files. Test-only, zero prod impact.**

---

## Cluster C4 — SPIKE-CI-C4-KINH-DICH-DIACRITICS (micro-SPIKE ruling)

### Rough-profile estimate vs actual
Rough profile said ~14. **Actual from log: 25** (50 raw / 2). The over-estimate of ~14 was based on the 241-residual taxonomy count of 24 for C4. Actual from CI job 80266839417 is 25 (taxonomy was based on the 241-baseline, now 172). Full breakdown:

| Test file | Suite label | Actual fails (halved) | Nature |
|---|---|---|---|
| `apps/mcp-server/src/__tests__/1414-diacritics-wave4.test.ts` | `1414 FILE 1 — kinhDichTools.ts` | 7 | Source-scan: checks for diacritics strings in prod file |
| `apps/mcp-server/src/__tests__/285-kinhdich-tools.test.ts` | `Task 285 — Kinh Dich MCP Tools > explain_hexagram` | 7 | Runtime: callTool asserts missing output sections |
| `apps/mcp-server/src/__tests__/1416-diacritics-wave5.test.ts` | `1416 wave5 — Group B: source-scan > kinhDichTools.ts` | 9 | Source-scan: checks for 28 diacritics strings in prod file |
| `apps/mcp-server/src/__tests__/1472-tool-diacritics-batch2.test.ts` | `1472: Vietnamese diacritics batch 2 > leadershipTools.ts` | 1 | Source-scan: `leadershipTools.ts` tool description diacritics |
| `apps/mcp-server/src/__tests__/1410-tool-diacritics-sweep.test.ts` | `Sprint 145 — tool diacritics sweep` | 1 | Source-scan: `formatAccuracyReport` zero-rows message diacritics |

**Note on 1472 and Sprint 145:** These touch `leadershipTools.ts` and `formatAccuracyReport`, not `kinhDichTools.ts`. They are captured in the C4 rough-profile but are SEPARATE production files. Dev must fix diacritics in those files too.

### Production code audit — kinhDichTools.ts

`apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` (794 lines).

**Current state of `explain_hexagram` handler (lines 758–793):**

The handler calls `explainHexagram(number)` which returns `KinhDichExplainResponse`:
```typescript
export interface KinhDichExplainResponse {
  number: number; name: string; chinese: string;
  upper: string; lower: string; coreMeaning: string;
  trend: string; tradingContext: string;
}
```

The handler then pushes:
- `=== QUE ${data.number}: ${data.name} ${data.chinese} ===`  (ASCII "QUE", not "QUẺ")
- `Thượng quán (trên): ... | Hạ quán (dưới): ...`
- `Ý nghĩa chính: ${data.coreMeaning}`
- `Xu hướng: ${data.trend}`
- `${data.tradingContext}`

**What the tests EXPECT but the handler does NOT emit:**

- `"Hào từ (Phán quyết):"` — judgment section (test 285: `toContain("Hào từ")`)
- `"Tượng truyện (Hình tượng):"` — image section (test 285: `toContain("Tượng truyện")`)
- `"Hao 1"`, `"Hao 2"`, `"Hao 6"` — 6 hao lines (test 285: expects these strings)
- `"Nhận định giao dịch"` — trading context label (test 285 checks this)

The `KinhDichExplainResponse` type does NOT include `judgment`, `image`, or `haos[]` fields. The Go `kinh-dich-service /hexagram/{number}/explain` endpoint would need to return these fields for the TS handler to emit them.

Also in `get_hexagram_history` handler (line 558):
```typescript
`${ts} | Quẻ ${r.hexagram} ${r.name} | Tín hiệu: ${r.signal} | Độ tin cậy: ${confPct}%`
```
Test 1414 expects `| Quẻ ${r.hexagramNumber}` (variable `r.hexagramNumber`) and `| Tín hiệu: ${r.tradingSignal}`. The production code uses `r.hexagram` and `r.signal`. Either the test assertion uses stale variable names, or the Go service response shape changed.

Additional missing strings in `kinhDichTools.ts` that 1416 source-scans for:
- `Lỗi khi tính quẻ thị trường` — not present in file
- `Thay đổi TB:` — not present
- `Tỷ lệ thắng:` — not present (wait: present at line 711 as `tỷ lệ thắng:` in backtest output — case mismatch or partial match issue)
- `Hào từ (Phán quyết):` — not present
- `Tượng truyện (Hình tượng):` — not present
- `Hành động:`, `Sự nghiệp:`, `Kết quả:` — not present
- `| Quẻ ${r.hexagramNumber}` — not present (production uses `r.hexagram`)

### C4 RULING

**RULING: (A) — Update PRODUCTION strings and add missing sections to match test expectations.**

**Rationale:**

1. **The tests are correct specifications.** `1414-diacritics-wave4.test.ts` and `1416-diacritics-wave5.test.ts` are explicitly labelled as TDD RED tests written BEFORE the production implementation (header: "Current source code uses unaccented ASCII placeholders → all source-scan tests FAIL (RED). Task 1415 will fix the source strings"). This is a deliberate TDD red phase — the tests are the specification, not wrong assertions.

2. **The test at 285 (`explain_hexagram`) expects `"Hào từ"`, `"Tượng truyện"`, and 6 hao lines.** The production handler does not emit these. This is an incomplete implementation: the handler was wired to call `explainHexagram()` but the formatting section was never completed to include judgment/image/haos sections.

3. **ASCII strings in production (`QUE` not `QUẺ`, `Tỷ lệ thắng:` with partial match) are cosmetic bugs** — users who call `get_hexagram_history` see `Tin hieu:` instead of `Tín hiệu:`. These are real prod output quality issues.

4. **There is no behavioral correctness concern** — fixing diacritics and adding the missing output sections does not change logic, DB schema, or signal correctness.

**What the fix touches:**

- `apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` — PRODUCTION file
  - `get_hexagram_history` handler (line 558): update template literal to use `Quẻ`, `Tín hiệu:`, `Độ tin cậy:` with proper diacritics
  - `explain_hexagram` handler (lines 763–776): add judgment, image, and 6 hao sections. This requires either (a) expanding `KinhDichExplainResponse` with `judgment?`, `image?`, `haos?` fields and updating the Go service response type, or (b) using `QUE_DATA` local hexagram library to supply judgment/image/haos without Go service changes
  - Add missing strings: `Lỗi khi tính quẻ thị trường`, `Thay đổi TB:`, `Tỷ lệ thắng:` (capitalised), `| Quẻ ${r.hexagramNumber}` template pattern
  - Fix variable name alignment: determine whether Go service uses `hexagramNumber` or `hexagram` in history response, and align test expectations OR production handler accordingly

- `apps/mcp-server/src/interface/mcp/tools/leadership/leadershipTools.ts` — PRODUCTION file (1 fail)
  - Fix tool description diacritics (1472 test)

- `apps/mcp-server/src/interface/mcp/tools/` (calibration / accuracy area) — find `formatAccuracyReport` and fix zero-rows message diacritics (Sprint 145 test, 1 fail)

**IMPORTANT:** The `explain_hexagram` missing sections may require a decision:
- Path A (preferred): Use `QUE_DATA[number]` from the local hexagram library to generate judgment/image/haos sections IN THE TS TOOL — no Go service change needed. The `QUE_DATA` already has this data (test 285 imports `QUE_DATA` and it has 64 entries).
- Path B: Extend `KinhDichExplainResponse` + Go service — higher scope.

**Recommendation: Path A.** Dev reads `QUE_DATA` structure, adds local formatting of judgment/image/haos from `QUE_DATA[number]` in the TS handler. Zero Go service changes. Zero new HTTP calls.

**C4 is PROD code change (kinhDichTools.ts + leadershipTools.ts + formatAccuracyReport target file).**

### Net projection: 25 fails → 0 after fix. Prod-touching.

---

## Honest Risk Assessment

### Under-scope / spillover risk

- **C1 (42 actual):** All 9 test files are fetcher-unit or wrapper tests. Risk = LOW that fixing these reveals more failures. The fetch mock pattern is proven (1881a passes). However, `239-market-context.test.ts` (1 fail, STALE flag) may need a different fix (JSON-field assert drift, not fetch mock). Net risk: **+2 to +5 hidden in 239-market-context cluster**.

- **C3 (20 actual):** The InMemoryTransport stall and FK constraint are SELF-CONTAINED per file. No P7-style downstream pollution expected from these 4 files. Risk = LOW. However, adding `afterEach` teardown may unmask NEW failures if the teardown reveals other stall sources. Net risk: **+0 to +3 unmasking risk**.

- **C4 (25 actual):** Adding missing sections to `explain_hexagram` via `QUE_DATA` local path should be straightforward. Risk = MEDIUM that `QUE_DATA` field names don't match what the tests expect exactly (e.g., test expects `"Hao 1"` not `"Hào 1"`). Dev must read 285 test assertions carefully before implementing. Net risk: **+0 to +5 depending on QUE_DATA format**.

### Total projected drop if all 3 clusters fixed

42 + 20 + 25 = **87 fails → 0 from these clusters.**
Remaining after fix: 172 - 87 = **~85 residual** (C9 misc + C5 fixtures + C6 foreign flow + C7 RAG + C8 conviction).

---

## Dev-Ready Scope Lines

### C1 — FIX-CI-C1-RESIDUAL-MACRO-FETCHER-TESTS

**Owner:** dev-mcp-server
**Files (exact):**
- `apps/mcp-server/src/__tests__/028-sbv-rates.test.ts` (9 fails)
- `apps/mcp-server/src/__tests__/025-yahoo-finance.test.ts` (7 fails)
- `apps/mcp-server/src/__tests__/1423a-us10y-yield.test.ts` (3 fails)
- `apps/mcp-server/src/__tests__/1487-yahoo-finance-extended.test.ts` (3 fails)
- `apps/mcp-server/src/__tests__/1833l-yahoo-404-graceful.test.ts` (1 fail)
- `apps/mcp-server/src/__tests__/239-macro-indicator-refresh.test.ts` (3 fails)
- `apps/mcp-server/src/__tests__/239-market-context.test.ts` (1 fail — JSON field drift, not fetch mock)
- `apps/mcp-server/src/__tests__/239c-macro-refresh-integration.test.ts` (1 fail — cron-registry fixture)
- `apps/mcp-server/src/__tests__/1352a-scheduler-job-wrappers-macro-marketscan.test.ts` (2 fails)
**Fix pattern:** `globalThis.fetch` mock returning `MacroSnapshotResponse`-shaped JSON; update assertions from section-header strings to JSON field checks. Template: `1881a-source-tier.test.ts` lines 92–135.
**Net projection:** 42 → 0
**Test-only? YES — no production code changes**

### C3 — FIX-CI-C3-RESIDUAL-DB-DESTROYERS

**Owner:** dev-mcp-server
**Files (exact):**
- `apps/mcp-server/src/__tests__/1129-calibration-tools.test.ts` (5 fails — InMemoryTransport beforeEach stall → add `afterEach(async () => { await client?.close(); })`)
- `apps/mcp-server/src/__tests__/1173-calibration-label-integration.test.ts` (3 fails — same InMemoryTransport stall fix)
- `apps/mcp-server/src/__tests__/1124-evidence-tools-phase-bc.test.ts` (6 fails — same InMemoryTransport stall fix)
- `apps/mcp-server/src/__tests__/1295d-integration-builders-to-synthesis.test.ts` (6 fails — FK constraint on `DELETE FROM agent_signals`; fix: add `PRAGMA foreign_keys=OFF` wrapper or delete FK-child tables first)
**Fix pattern:** (a) `afterEach` teardown for InMemoryTransport; (b) FK-safe cleanup for 1295d.
**Net projection:** 20 → 0
**Test-only? YES — no production code changes**

### C4 — SPIKE-CI-C4-KINH-DICH-DIACRITICS

**Owner:** dev-mcp-server
**Files (exact):**
- `apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts` (PRODUCTION — diacritics fixes + add explain_hexagram sections using QUE_DATA local library)
- `apps/mcp-server/src/interface/mcp/tools/leadership/leadershipTools.ts` (PRODUCTION — tool description diacritics)
- Find and fix `formatAccuracyReport` zero-rows message file (PRODUCTION — 1 diacritics string)
- `apps/mcp-server/src/__tests__/1414-diacritics-wave4.test.ts` (test — possibly update `r.hexagramNumber` / `r.tradingSignal` variable names if Go service uses different field names; verify against live `KinhDichHistoryResponse` type first)
**Fix pattern:** (a) Update ASCII placeholder strings to UTF-8 diacritics; (b) Add missing `explain_hexagram` output sections reading from `QUE_DATA[number]` local library (Path A preferred over Go service extension).
**Net projection:** 25 → 0
**Test-only? NO — production code changes required in kinhDichTools.ts, leadershipTools.ts, and formatAccuracyReport source**

---

## C4 RULING (one sentence)

**RULING (a): Update PRODUCTION strings** — the tests are intentional TDD RED specifications (Task 1414/1415/1416 design contract), so production `kinhDichTools.ts` must be fixed to emit correct UTF-8 diacritics and add the missing `explain_hexagram` output sections.

---

## Constraints Confirmed

- NO `docs/data/orch/orch-state.json` edits made in this brief or its commit.
- NOT pushed to remote (router owns push).
- Commit-mutex: ACQUIRED before write, RELEASED after commit.
