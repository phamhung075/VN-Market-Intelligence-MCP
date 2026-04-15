# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 087 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1295 | fix(ssc): update test 1025 cases 7+8 to call `listSscDocumentsWithFlag` | Dev | infrastructure (test) | — | task/1295-ssc-listdocs-flag | Review |
| 1296 | fix(prediction): relax direction+expected_move_pct to optional in evidenceTools.ts | Dev | interface | — | — | Todo |
<!-- TECH_087.md approved — both tasks independent, ready for Dev implementation -->

| 1218 | VPS BCTC queue: populate source_hints with actual PDF URLs from listSscDocuments | Dev | infrastructure | — | — | Backlog |
| 1248 | BDI data staleness during supply chain crisis — fetch path needs geo-unblocked VPS route | Dev | infrastructure | — | — | Backlog |

**WIP:** 0 In Progress. 0 Review.

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
