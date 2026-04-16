# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 094 — Active

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1308 | TDD: write failing 1307-ta-alert-scan-job.test.ts (AC-1 through AC-9) | Dev | test | REQ-094 | task/1307-1308-ta-alert-scan-job | Review |
| 1307 | feat(scheduler): implement taAlertScanJob.ts + wire into jobs.ts | Dev | scheduler | 1308,1302 | task/1307-1308-ta-alert-scan-job | Review |

---

## Sprint 090 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1302 | feat(ta): implement technicalIndicators.ts domain service + TDD test | Done |
| 1303 | feat(ta): implement technicalIndicatorTools.ts MCP handler + registry | Done |

---

## Sprint 089 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1300 | fix(sector-dedup): remove legacy 'pharma' key from mcp.config.json referenceStocks | Dev | domain | — | — | Done |
| 1301 | fix(test-isolation): eliminate parallel SQLite state contamination in full suite run | Dev | test | 1300 | — | Done |
| — | [PM] Sprint plan tasks 1300+1301 per TECH_089.md | PM | — | — | — | Todo |
| 1207 | fix(cascade): non-watchlist confidence cap — rebase onto main (062 stale assertion) | Dev | domain | — | task/1207-non-watchlist-confidence-cap | Review |

| 1218 | VPS BCTC queue: populate source_hints with actual PDF URLs from listSscDocuments | Dev | infrastructure | — | — | Backlog |
| 1248 | BDI data staleness during supply chain crisis — fetch path needs geo-unblocked VPS route | Dev | infrastructure | — | — | Backlog |

**WIP:** 0 In Progress. 0 Review.

## Sprint 088 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1297 | fix(test-drift): update test 1190 schedulerFileCount assertion 28→29 | Done |
| 1298 | fix(test-drift): update test 313 VPS watchdog alert string Vultr→Vinahost | Done |
| 1299 | fix(test-drift): update test 137 Step E behavior — unconditional since Task 1255 | Done |

## Sprint 087 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1295 | fix(ssc): update test 1025 cases 7+8 to call `listSscDocumentsWithFlag` | Done |
| 1296 | fix(prediction): relax direction+expected_move_pct to optional in evidenceTools.ts | Done |

## Sprint 086 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1291 | fix(schema): systematic initDatabase() audit — add missing columns/tables | Done |
| 1292 | fix(kinh-dich): tickerJitter range drift — function returns 0.10/0.115, test asserts max 0.09 | Done |
| 1293 | fix(freshness): getDataFreshness() format drift — test 185 fails on 'Cu' label | Done |

## Sprint 085 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1289 | fix(cascade): test 062 Task 162 vs Task 1256 contract conflict | Done |
| 1290 | feat(scheduler): implement franceSummaryJob in jobs.ts — fixes test 1139 | Done |

## Sprint 084 — Complete

| ID | Title | Status |
|----|-------|--------|
| 1287 | fix(cascade): R09/R11 rule drift in predictionCascadeMapper | Done |
| 1288 | fix(pollNews): PollNewsResult shape mismatch in test 102 | Done |
| 1286 | fix(schema): add daily_ohlcv table to test DB setup | Done |

---

## Task Details (active tasks only)

### 1300 — fix(sector-dedup): remove legacy 'pharma' key from mcp.config.json referenceStocks

**Branch:** `task/1300-sector-dedup-pharma`
**Layer:** domain (config + data only — no TypeScript source change)
**Depends on:** none

**Root cause:** `mcp.config.json` contains both `pharma` (5 tickers: DHG, IMP, DMC, TRA, DBD) and `pharmaceutical` (7 tickers: DHG, IMP, DMC, DBD, PME, TRA, OPC) under `market.referenceStocks`. All `pharma` tickers are a subset of `pharmaceutical`. Test 1282 detects this duplicate and fails. The presence of both keys causes the sector alert system to potentially fire duplicate alerts for pharma tickers.

**Root cause confirmed:** `mcp.config.json` — two keys coexist: `pharma` and `pharmaceutical`.

**Files to read first:**
- `mcp.config.json` (find `market.referenceStocks` section — confirm both keys exist)
- `src/__tests__/1282-sector-classification-dedup.test.ts` (lines 88–95 — the failing assertion)

**Files to modify:**
- MODIFY: `mcp.config.json`

**Exact change:** Under `market.referenceStocks`, remove the entire `"pharma": [...]` entry. The `pharmaceutical` key with 7 tickers (DHG, IMP, DMC, DBD, PME, TRA, OPC) is the canonical sector and must remain untouched.

**Acceptance Criteria**

**Given** `bun test src/__tests__/1282-sector-classification-dedup.test.ts`
**When** the test runs
**Then**
- All 7 tests pass (was 6 pass / 1 fail)
- `bun tsc --noEmit` shows 0 errors
- No TypeScript source files modified — config change only
- `pharmaceutical` key still present with all 7 tickers intact

---

### 1301 — fix(test-isolation): eliminate parallel SQLite state contamination in full suite run

**Branch:** `task/1301-test-isolation-sqlite`
**Layer:** test infrastructure
**Depends on:** 1300

**Root cause:** Full suite (`bun test`) runs test files in parallel workers. Multiple test files open the same SQLite DB path (or use a shared in-memory DB alias), causing state contamination. Symptoms: tests that pass in isolation fail under parallel execution — particularly test files 137, 278, 1294 which use `intelligenceCycleJob` and share DB-backed alert state.

**Investigation steps:**
1. Read failing test files (137, 278, 1294) — check how each sets `DB_PATH` and whether they use `:memory:` or a shared file path.
2. Identify any test files that do NOT set `process.env["DB_PATH"] = ":memory:"` at the top.
3. Fix: every test file that touches the DB must set `process.env["DB_PATH"] = ":memory:"` as the very first line (before any imports), OR use a unique temp file path via `mktemp`.

**Files to read first:**
- `src/__tests__/278-*.test.ts` (check DB_PATH setup)
- `src/__tests__/1294-*.test.ts` (check DB_PATH setup)
- `src/__tests__/137-fix-alert-pipeline.test.ts` line 1 (confirm `:memory:` is set)
- Any test file referenced in the 22-failure full-suite run that does NOT have `DB_PATH = ":memory:"` as line 1

**Files to modify:**
- Any test file missing `process.env["DB_PATH"] = ":memory:";` as the first line

**Acceptance Criteria**

**Given** `bun test` (full parallel suite)
**When** the suite completes
**Then**
- Total failures ≤ 2 (only OCR e2e Bun crash may remain — that is a Bun version limitation, not a test isolation issue)
- Tests 137, 278, 1294 all pass in the parallel run
- `bun tsc --noEmit` shows 0 errors
- No production code modified

---

### 1297 — fix(test-drift): update test 1190 schedulerFileCount assertion 28→29

**Branch:** `task/1297-scheduler-count-drift`
**Layer:** test only — no production code change
**Depends on:** none

**Root cause:** `docs/data/cron-registry.json` `schedulerFileCount` was incremented to 29 (franceSummaryJob added in sprint 085, task 1290). Test 1190 hardcodes `expect(json.schedulerFileCount).toBe(28)` — assertion is now stale.

**Files to read first:**
- `src/__tests__/1190-pipeline-watchdog.test.ts` (line 281 — the failing assertion)
- `docs/data/cron-registry.json` (confirm `schedulerFileCount: 29`)

**Files to modify:**
- MODIFY: `src/__tests__/1190-pipeline-watchdog.test.ts`

**Exact change:**
- Line 281: `expect(json.schedulerFileCount).toBe(28)` → `expect(json.schedulerFileCount).toBe(29)`
- Update test description string on line 280 from `"schedulerFileCount === 28"` to `"schedulerFileCount === 29"` (the `it(...)` label)

**Acceptance Criteria**

**Given** `bun test src/__tests__/1190-pipeline-watchdog.test.ts`
**When** the test runs
**Then**
- All 16 tests pass (was 15 pass / 1 fail)
- `bun tsc --noEmit` shows 0 errors
- No production code modified

---

### 1298 — fix(test-drift): update test 313 VPS watchdog alert string Vultr→Vinahost

**Branch:** `task/1298-vps-watchdog-string-drift`
**Layer:** test only — no production code change
**Depends on:** none

**Root cause:** Production code in `vpsProxyWatchdogJob.ts` was updated to reference "Vinahost VN price pushes stopped" (provider renamed from Vultr to Vinahost). Test 313 still asserts `.toContain("Vultr price pushes stopped")`.

**Files to read first:**
- `src/__tests__/313-vps-proxy-watchdog.test.ts` (find the failing `.toContain("Vultr...")` assertion)
- `src/scheduler/vpsProxyWatchdogJob.ts` (confirm exact new alert string)

**Files to modify:**
- MODIFY: `src/__tests__/313-vps-proxy-watchdog.test.ts`

**Exact change:** Replace `"Vultr price pushes stopped"` with the actual string fragment used in the production alert message. Read `vpsProxyWatchdogJob.ts` to confirm exact wording before making change.

**Acceptance Criteria**

**Given** `bun test src/__tests__/313-vps-proxy-watchdog.test.ts`
**When** the test runs
**Then**
- All tests pass (0 fail)
- `bun tsc --noEmit` shows 0 errors
- No production code modified

---

### 1299 — fix(test-drift): update test 137 Step E behavior — unconditional since Task 1255

**Branch:** `task/1299-step-e-drift`
**Layer:** test only — no production code change
**Depends on:** none

**Root cause:** Task 1255 made Step E (send HIGH/CRITICAL alerts to Telegram) unconditional — it runs regardless of market hours. Test 137 case "Step E is skipped outside market hours" was written before that change; it sets `isMarketHoursFn: () => false` and asserts `readCalled === false`. After Task 1255 that expectation is wrong — `readUnnotifiedAlertsFn` IS called even outside market hours.

**Files to read first:**
- `src/__tests__/137-fix-alert-pipeline.test.ts` (lines 430–456 — the failing case)
- `src/scheduler/intelligenceCycleJob.ts` (lines 791–810 — Step E unconditional comment, confirm current behavior)

**Files to modify:**
- MODIFY: `src/__tests__/137-fix-alert-pipeline.test.ts`

**Exact change:** In the "Step E is skipped outside market hours" test case:
- Update test description to: `"Step E runs unconditionally (even outside market hours)"`
- Change assertion from `expect(readCalled).toBe(false)` to `expect(readCalled).toBe(true)`
- `expect(result!.telegramAlertsSent).toBe(0)` should still hold (no alerts returned by mock)

Also check if the other two timeouts (30s each) in test 137 are caused by the same drift — if the first two cases time out because of mock interaction changes, fix those too.

**Acceptance Criteria**

**Given** `bun test src/__tests__/137-fix-alert-pipeline.test.ts`
**When** the test runs
**Then**
- All 3 previously-failing cases pass within 5s each (no 30s timeouts)
- `bun tsc --noEmit` shows 0 errors
- No production code modified

---

### 1295 — fix(ssc): update test 1025 cases 7+8 to call `listSscDocumentsWithFlag`

**Branch:** `task/1295-ssc-listdocs-flag`
**Layer:** infrastructure (test only — no production code change)
**Depends on:** none
**Spec:** `docs/TECH_087.md`

**Root cause:** `listSscDocuments()` reads `mcpConfig.features.disableSscPolling` which defaults to `true` in production, so test cases 7 and 8 always skip the SSC portal path regardless of mock HTTP responses. `listSscDocumentsWithFlag` (already exported from `ssc.ts` line 972) accepts the flag as a parameter and is the correct testable entry point.

**Files to read first:**
- `src/__tests__/1025-ssc-adf-pdf-discovery.test.ts` (lines 22–26 import block, lines 232 and 256 call sites)
- `src/infrastructure/ssc/ssc.ts` (line 972 — confirm `listSscDocumentsWithFlag` export)

**Files to modify:**
- MODIFY: `src/__tests__/1025-ssc-adf-pdf-discovery.test.ts`

**Exact changes:**
1. Import block (lines 22–26): add `listSscDocumentsWithFlag` to the existing import from `ssc.ts`. Remove `listSscDocuments` if no other case in the file uses it after the fix.
2. Case 7 (line 232): replace `listSscDocuments("VCB", "quarterly", 2025, mockClient)` with `listSscDocumentsWithFlag("VCB", "quarterly", 2025, false, mockClient)`
3. Case 8 (line 256): replace `listSscDocuments("VCB", "quarterly", 2025, mockClient)` with `listSscDocumentsWithFlag("VCB", "quarterly", 2025, false, mockClient)`

**Acceptance Criteria**

**Given** test 1025 with mocked HTTP client
**When** cases 7 and 8 call `listSscDocumentsWithFlag(..., false, mockClient)`
**Then**
- Case 7: `hoseFetched` is `true` (SSC returns JS shell, fallback fires correctly)
- Case 8: `hoseFetched` is `false` (SSC returns full HTML, no fallback)
- `bun test src/__tests__/1025-ssc-adf-pdf-discovery.test.ts` passes with 0 failures
- `bun tsc --noEmit` shows 0 errors
- Production behavior of `listSscDocuments()` is unchanged

---

### 1296 — fix(prediction): relax direction+expected_move_pct to optional in evidenceTools.ts

**Branch:** `task/1296-prediction-schema-optional`
**Layer:** interface
**Depends on:** none
**Spec:** `docs/TECH_087.md`

**Root cause:** `create_prediction_claim` tool schema added `direction` and `expected_move_pct` as required zod fields. Test 1124 (written before these fields) does not supply them — tool now rejects those calls with `-32602 Input validation error`. Fix makes both fields optional and guards the handler.

**Files to read first:**
- `src/interface/mcp/tools/evidenceTools.ts` (lines 360–415 — `create_prediction_claim` schema + handler)
- `src/__tests__/1124-evidence-tools-phase-bc.test.ts` (failing cases)
- `src/__tests__/1194-agent08-tools.test.ts` (regression — passes `direction:"bullish"`, must stay green)

**Files to modify:**
- MODIFY: `src/interface/mcp/tools/evidenceTools.ts`

**Exact schema changes (zod, in `create_prediction_claim` tool definition):**
- `direction`: `z.enum(["bullish", "bearish"])` → `z.enum(["bullish", "bearish"]).optional()`
- `expected_move_pct`: `z.number().min(0.001).max(0.5)` → `z.number().min(0.001).max(0.5).optional()`

**Exact handler changes (inside `create_prediction_claim` async handler):**
- Step 3 (lines 365–368): replace target price ternary with:
  ```typescript
  const targetPrice: number | null =
    direction != null && expected_move_pct != null
      ? direction === "bullish"
        ? Math.round(creationPrice * (1 + expected_move_pct))
        : Math.round(creationPrice * (1 - expected_move_pct))
      : null;
  ```
- Step 5 (line 380) `insertPredictionClaim` call: change `direction` arg to `(direction ?? null) as ClaimDirection`
- Step 7 (line 407) direction line: `direction ? \`Direction: ${direction}\n\` : ""`
- Step 7 (line 410) move line: `expected_move_pct != null ? \`Expected move: ${(expected_move_pct * 100).toFixed(1)}%\n\` : ""`

**Acceptance Criteria**

**Given** `create_prediction_claim` called without `direction` or `expected_move_pct`
**When** tool handler processes the request
**Then**
- No `-32602` validation error — call succeeds
- `target_price` stored as `null` in DB
- `direction` stored as `null` in DB
- `bun test src/__tests__/1124-evidence-tools-phase-bc.test.ts` — all 5 previously-failing cases pass
- `bun test src/__tests__/1194-agent08-tools.test.ts` — still green (passes `direction:"bullish"` and `expected_move_pct:0.05`, both still function when provided)
- `bun test src/__tests__/1025-ssc-adf-pdf-discovery.test.ts` — unaffected (no shared code)
- `bun tsc --noEmit` shows 0 errors
