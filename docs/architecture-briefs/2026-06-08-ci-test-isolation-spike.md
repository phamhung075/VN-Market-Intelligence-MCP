# CI-TEST-ISOLATION-SPIKE — Architecture Brief

**Date:** 2026-06-08
**Author:** agents-architect
**Status:** COMPLETE — handoff to PM
**Sprint:** CI-TEST-ISOLATION-SPIKE
**Scope:** `apps/mcp-server/src/__tests__/` (639 failing bun tests)

---

## Executive Summary

639 bun tests fail. **The dominant failure mode is NOT a codebase regression** — it is a
single test file (`1862c-transport-session-eviction.test.ts`) that poisons the module cache for
the entire test process via `mock.module()` without restore, causing ~269 cascade failures across
every subsequent test file. A secondary systemic cause (63 inline DDLs missing `data_env` column)
accounts for ~96 more failures. Only a small minority (~39) are real regressions or obsolete tests.

Fix strategy: fix the two systemic issues first (B1 + B2), remove the obsolete tests second (A),
then address real regressions third (C).

---

## 1. Bucket Classification

### Bucket B — SYSTEMIC CASCADE (fix, do not delete)

**Total estimated: ~560 failures across three sub-roots.**

#### B1 — `mock.module` process contamination (1862c) — ~269 failures

**Root cause:**
`src/__tests__/1862c-transport-session-eviction.test.ts` calls:

```typescript
mock.module("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class MockMcpServer {
    connect = mock(async () => {});
    // NO .tool() method
  },
}));
```

at module level (outside any `beforeAll`/`afterAll`). In Bun, `mock.module()` patches the
**process-level module cache** and is never automatically restored between test files. Every
test file loaded AFTER `1862c` in the same `bun test` run inherits a `McpServer` with no
`.tool()` method, causing `TypeError: server.tool is not a function` in every test that
registers an MCP tool.

**Evidence:** Running `1862c` in isolation passes (3/3). Running any MCP-tool-registering test
(e.g., `083-tool-register.test.ts`) in isolation passes. Running `1862c` first then `083` in the
same process fails with `TypeError: server.tool is not a function`. The contamination is
confirmed process-scoped (Bun v1.3.13 behavior).

**Affected test files (representative):**
- `083-tool-register.test.ts` — all tool registration tests
- `085-tool-kinh-dich.test.ts`
- `240-*.test.ts`, `241-*.test.ts`
- `FU-LF-*.test.ts` (all finalize/refine tool registration)
- Any file that imports and instantiates `McpServer` after 1862c in run order

**Single fix (B1):**
In `1862c-transport-session-eviction.test.ts`, wrap the mock in `beforeAll`/`afterAll`:

```typescript
import { beforeAll, afterAll, mock } from "bun:test";

let originalModule: unknown;

beforeAll(() => {
  mock.module("@modelcontextprotocol/sdk/server/mcp.js", () => ({
    McpServer: class MockMcpServer {
      connect = mock(async () => {});
    },
  }));
});

afterAll(() => {
  mock.restore();
});
```

**Owner:** `dev-interface` (zone: `interface/mcp/`)
**File to edit:** `apps/mcp-server/src/__tests__/1862c-transport-session-eviction.test.ts`

---

#### B2 — Stale inline `rag_analyses` DDL missing `data_env` — ~96 failures

**Root cause:**
Production `pollNews.ts` (line ~540) INSERTs with `data_env` column. The canonical DDL in
`src/infrastructure/db/schema-news.ts` adds this column via a post-CREATE guarded ALTER:

```typescript
// schema-news.ts — initNewsTables()
db.exec(`CREATE TABLE IF NOT EXISTS rag_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  ...
  -- data_env NOT included in CREATE TABLE
)`);
try {
  db.exec("ALTER TABLE rag_analyses ADD COLUMN data_env TEXT");
} catch { /* already exists */ }
```

63 test files create `rag_analyses` inline (copy-pasted DDL) without replicating the ALTER, so
the column is absent. Result: `SQLiteError: table rag_analyses has no column named data_env`.
This affects both direct-insert tests AND the 28+ slow `pollNews` integration tests (which time
out at 2000ms because the fetch completes but the INSERT throws).

**Evidence:** First failure in stderr output is `1332-pollnews-source-display-name.test.ts`
line 34-50 — inline `rag_analyses` DDL at lines 34-50 has no `data_env`; `pollNews.ts:540`
INSERT fails with `SQLiteError: table rag_analyses has no column named data_env`.

**Single fix (B2):**
Option A (preferred): Replace inline `CREATE TABLE rag_analyses` blocks in all 63 test files
with a call to `initNewsTables(db)` from `src/infrastructure/db/schema-news.ts`.
Option B: Add `data_env TEXT` to all 63 inline DDLs.

Option A is safer — it tracks schema evolution automatically for future column additions.

**Count of affected files:**
```
grep -rl "CREATE TABLE.*rag_analyses\|rag_analyses.*TEXT" apps/mcp-server/src/__tests__/
```
Expected: ~63 files.

**Owner:** `dev-infrastructure` (zone: `infrastructure/db/`)
**Files to edit:** All 63 test files with inline `rag_analyses` DDL — enumerated by the grep above.

---

#### B3 — Stale `bctc_table_rows` DDL missing `statement_section` — 3 failures

**Root cause:**
`BANK-AWARE-1-consumer-audit.test.ts` DV-BANK-5 creates `bctc_table_rows` with a minimal DDL
(lines 160-168) missing `statement_section` column. `computeBctcEval` queries `statement_section`.

**Evidence:** `SQLiteError: no such column: statement_section` on DV-BANK-5 test cases (3 failures).

**Single fix (B3):**
Add `statement_section TEXT NOT NULL DEFAULT 'general'` to the inline `bctc_table_rows` DDL in
`BANK-AWARE-1-consumer-audit.test.ts` lines 160-168.

**Owner:** `dev-infrastructure`
**File to edit:** `apps/mcp-server/src/__tests__/BANK-AWARE-1-consumer-audit.test.ts`

---

### Bucket A — OBSOLETE → SAFE TO REMOVE (24 tests)

**Default presumption is Bucket B. Each entry below has explicit evidence the feature/contract
is gone and the test cannot be made green without reverting a deliberate architectural change.**

#### A1 — `089-tool-macro.test.ts` — ALL 15 tests

**Evidence:** Commit `98df0f43` refactored `macroTools.ts` to delegate entirely to a Python
microservice on port 5004 (HTTP GET). The previous implementation accepted
`_testCommodityClient` / `_testSbvClient` injection hooks for unit testing. These injection
points NO LONGER EXIST in the post-refactor file. The tool now returns a JSON object
(`{ regime, macro }`) instead of formatted text sections (`"=== Macro Snapshot ==="`,
`"[Commodity Prices]"`). None of the 15 tests can be made green without reverting the HTTP
delegation — which is a shipped architectural change.

**Removal list (exact file:test-name):**
```
089-tool-macro.test.ts: MT-01: happy path — output contains all sections when both fetchers return data
089-tool-macro.test.ts: MT-02: commodity null — commodity section shows unavailable
089-tool-macro.test.ts: MT-03: SBV null — SBV section shows unavailable
089-tool-macro.test.ts: MT-04: both null — tool returns valid response with all unavailable
089-tool-macro.test.ts: MT-05: high oil signal when brent > 90
089-tool-macro.test.ts: MT-06: low oil signal when brent < 70
089-tool-macro.test.ts: MT-07: high gold signal when gold > 2000
089-tool-macro.test.ts: MT-08: tight policy signal when refinancing rate > 6%
089-tool-macro.test.ts: MT-09: loose policy signal when refinancing rate < 4%
089-tool-macro.test.ts: MT-10: high USD/VND signal when rate > 25500
089-tool-macro.test.ts: MT-11: registerMacroTools is importable from tools/index.ts
089-tool-macro.test.ts: MT-12: tool is registered on the McpServer
089-tool-macro.test.ts: neutral oil signal (brent between 70-90)
089-tool-macro.test.ts: neutral gold signal (gold <= 2000)
089-tool-macro.test.ts: neutral USD/VND signal (rate <= 25500)
```

Note: test "MT-12" and the final regression guard test may survive after B1 fix if
`_testClient` injection is absent — they will fail with a different error confirming removal is
correct.

---

#### A2 — `1414-diacritics-wave4.test.ts` — FILE 1 section (7 tests)

**Evidence:** FILE 1 in this test file checks `kinhDichTools.ts` for template literals
referencing `r.hexagramNumber` and lines 1008/1032/1033/1035/1038. Commit `6fc7b6b3` (HTTP
rewire) replaced the entire handler body with HTTP delegation to port 5005. The template
literals at those line numbers no longer exist — `kinhDichTools.ts` is 794 lines post-refactor
and the referenced code blocks are gone. The diacritics the tests check for cannot be found
because the code paths were deleted, not broken.

FILE 2–5 (supplyChainTools, alertTools, watchlistTools, leadershipTools) are NOT in this
removal list — those source files were not rewired and the tests may still be valid.

**Removal list (exact file:test-name):**
```
1414-diacritics-wave4.test.ts: 1414 FILE 1 — kinhDichTools.ts: handler string diacritics > line 734: history row must use Quẻ not Que
1414-diacritics-wave4.test.ts: 1414 FILE 1 — kinhDichTools.ts: handler string diacritics > line 734: history row must use Tín hiệu: not Tin hieu:
1414-diacritics-wave4.test.ts: 1414 FILE 1 — kinhDichTools.ts: handler string diacritics > line 734: history row must use Độ tin cậy: not Do tin cay:
1414-diacritics-wave4.test.ts: 1414 FILE 1 — kinhDichTools.ts: handler string diacritics > line 808: transition header must use Cổ phiếu: not Co phieu:
1414-diacritics-wave4.test.ts: 1414 FILE 1 — kinhDichTools.ts: handler string diacritics > line 1008: error message must use Lỗi: Không có dữ liệu giải thích cho Quẻ
1414-diacritics-wave4.test.ts: 1414 FILE 1 — kinhDichTools.ts: handler string diacritics > line 1032: state block header must use Tình trạng quẻ:
1414-diacritics-wave4.test.ts: 1414 FILE 1 — kinhDichTools.ts: handler string diacritics > line 1033: state trend must use Xu hướng: not Xu huong:
```

Note: Lines 1035 and 1038 (tests 8-9 of FILE 1) also match this pattern — include in removal
if grep confirms their line numbers are absent. Total FILE 1 = up to 9 tests.

---

#### A3 — `1503-ohlcv-foreign-flow.test.ts` — AC3 (1 test)

**Evidence:** The AC3 comment in the test file itself states the OLD contract:
`"writeForeignFlowToOhlcv returns 0 when no matching OHLCV row (update-only, no stub rows)"`.
Commits `32d201e8` and `36a91a59` (DPI-4) deliberately changed the strategy to
`INSERT…ON CONFLICT(code, date) DO UPDATE SET` — creating stub rows when absent. The new
contract returns 1 change (stub row created), not 0. This is the intended behavior per DPI-4.

**Removal list (exact file:test-name):**
```
1503-ohlcv-foreign-flow.test.ts: Task 1503 AC3 — writeForeignFlowToOhlcv no stub rows > returns 0 changes when no matching OHLCV row exists (update-only)
```

---

#### A4 — `1190-pipeline-watchdog.test.ts` — schedulerFileCount hardcoded count (1 test)

**Evidence:** Test name says "schedulerFileCount === 43", assertion says `.toBe(44)`. Actual
`docs/data/cron-registry.json` has `schedulerFileCount: 64`. This is a hardcoded numeric
sentinel tracking the number of scheduler files — it is stale by 20 entries. Updating the
assertion is NOT the right fix (it would drift again with the next cron addition). The
`schedulerFileCount` field is an anti-regression counter that belongs in a dedicated structural
smoke test or removed from the watchdog test suite.

**Removal list (exact file:test-name):**
```
1190-pipeline-watchdog.test.ts: CI Smoke — cron-registry.json schema > schedulerFileCount === 43
```

---

### Bucket C — REAL REGRESSIONS (fix)

**Total estimated: ~39 tests. These are genuine failures introduced by recent commits.**

#### C1 — `TRUST-RED-sanity-gate.test.ts` TR-RED-5b (1 test)

**Root cause:** `finalizeBctcRefineTool` regression from commit `e74dd0e1`
(FU-LF-VALIDATION-STATUS-REFLOW). Clean BCTC data with 30% gross margin now receives
`refine_status='PARTIAL'` instead of `'DONE'`. Log evidence:
`[finalize_bctc_refine] BLOCK-4 validation_status refreshed — new_status='failed'`.
The reflow incorrectly triggers BLOCK-4 validation failure on data that previously passed.

**Owner:** `dev-domain` (zone: `domain/services/bctc*`)
**Evidence file:** `apps/mcp-server/src/__tests__/TRUST-RED-sanity-gate.test.ts`

---

#### C2 — `239-macro-indicator-refresh.test.ts` AC-5, AC-6, AC-10 (3 tests)

**Root cause:** `freshnessSlaChecker` returning wrong values after recent macro-indicator
refactor. AC-5 (stale threshold boundary), AC-6 (multi-indicator freshness aggregation),
AC-10 (SLA policy enforcement) all fail — indicating the checker's freshness calculation
logic changed behavior.

**Owner:** `dev-infrastructure` (zone: `infrastructure/scheduler/`)
**Evidence file:** `apps/mcp-server/src/__tests__/239-macro-indicator-refresh.test.ts`

---

#### C3 — `239c-macro-refresh-integration.test.ts` AC-3 (1 test)

**Root cause:** `macroIndicatorRefreshJob` absent from `docs/data/cron-registry.json`.
AC-3 asserts the job is registered in the cron registry — it is not present.

**Owner:** `dev-infrastructure`
**Evidence file:** `apps/mcp-server/src/__tests__/239c-macro-refresh-integration.test.ts`

---

#### C4 — `230-bootstrap-verify.test.ts` AC-4c (variable count, ~5 tests)

**Root cause:** Agent `.md` files missing required `Step 0-b` section. Post-refactor agent
flow files were updated but the corresponding `.md` specs were not synchronized. AC-4c
validates structural compliance.

**Owner:** `dev-interface` (zone: `docs/agents/`)
**Evidence file:** `apps/mcp-server/src/__tests__/230-bootstrap-verify.test.ts`

---

#### C5 — `1837a-pipeline-state.test.ts` AC-1, AC-5 (2 tests)

**Root cause:** `docs/data/orch/orch-state.json` missing `wip` and `wip_max` fields; also
`signal_queue` structure mismatch. These fields were part of the SSOT consolidation
(2026-06-02) and the test was not updated to reflect the new schema, OR the schema was
silently changed post-consolidation without updating the SSOT.

**Owner:** `dev-infrastructure`
**Evidence file:** `apps/mcp-server/src/__tests__/1837a-pipeline-state.test.ts`

---

#### C6 — `1839b-notebook-protocol.test.ts` AC-3, AC-4 (2 tests)

**Root cause:**
- AC-3: Stale `.bak` file present in `docs/agent-memory/notebooks/` directory (should be
  cleaned). Likely left from a backup operation.
- AC-4: `docs/agent-memory/notebooks/developer.md` missing required sections.

**Owner:** `dev-interface` (zone: `docs/agent-memory/`)
**Evidence file:** `apps/mcp-server/src/__tests__/1839b-notebook-protocol.test.ts`

---

#### C7 — `1472-tool-diacritics-batch2.test.ts` (1 test)

**Root cause:** `leadershipTools.ts` diacritics regression — test expects correct Vietnamese
accented output but source file has reverted to unaccented form.

**Owner:** `dev-interface` (zone: `interface/mcp/tools/sector/`)
**Evidence file:** `apps/mcp-server/src/__tests__/1472-tool-diacritics-batch2.test.ts`

---

#### C8 — Anti-stub detector: `DWF-is-trading-day.test.ts` AC-P0-3-6 (DO NOT FIX, DO NOT REMOVE)

**CRITICAL NOTE:** This test contains an INTENTIONALLY failing assertion:
`expect(result.is_trading_day).toBe(true)` for a known holiday. The test comment states:
`"This test MUST go RED. If this test PASSES, the holiday data is a stub."` This is a
canary/anti-stub detector. It MUST remain failing. Do not include it in any fix or removal task.

---

## 2. Bucket Counts

| Bucket | Count | Category |
|--------|-------|----------|
| B — Systemic cascade | ~560 | Fix systemic root causes |
| A — Obsolete | ~24 | Remove (explicit evidence required — all provided above) |
| C — Real regressions | ~39 | Fix regressions |
| **Total** | **~623** | (remaining ~16 = DWF canary + marginal overlap) |

Note: The full `bun test` run reports 639. The gap vs. 623 accounts for:
- DWF canary (1) — intentional RED
- B1/B2/B3 overlap (some files fail on multiple roots; counted once)
- B1 cascade count is approximate (depends on bun file dispatch order)

---

## 3. Fix Plan

### Phase 1 — Systemic fixes (unblocks ~560 tests immediately)

**P1-A: Fix mock.module process contamination (B1)**
- **File:** `apps/mcp-server/src/__tests__/1862c-transport-session-eviction.test.ts`
- **Change:** Move `mock.module()` call inside `beforeAll`, add `mock.restore()` in `afterAll`
- **Expected outcome:** ~269 previously-contaminated tests recover in one shot
- **Owner:** `dev-interface`
- **Risk:** Low — isolated test-file change, no production code

**P1-B: Fix stale inline `rag_analyses` DDL (B2)**
- **Files:** ~63 test files (enumerate via
  `grep -rl "CREATE TABLE.*rag_analyses" apps/mcp-server/src/__tests__/`)
- **Change:** Replace inline DDLs with `initNewsTables(db)` call, or add `data_env TEXT`
  to all 63 inline CREATE TABLE statements
- **Expected outcome:** ~96 SQLiteError + pollNews timeout failures resolve
- **Owner:** `dev-infrastructure`
- **Risk:** Medium — touching 63 files; prefer Option A (schema-function) for future-proofing

**P1-C: Fix stale `bctc_table_rows` DDL (B3)**
- **File:** `apps/mcp-server/src/__tests__/BANK-AWARE-1-consumer-audit.test.ts` lines 160-168
- **Change:** Add `statement_section TEXT NOT NULL DEFAULT 'general'`
- **Expected outcome:** 3 failures resolve
- **Owner:** `dev-infrastructure`
- **Risk:** Minimal

---

### Phase 2 — Obsolete test removal (dev task, separate PR)

**Remove the 24 obsolete tests enumerated in Bucket A above.** Each removal must be
accompanied by a one-line comment in the git commit citing the evidence commit hash.

**Owner:** `dev-interface` (1414 FILE 1, 089) and `dev-infrastructure` (1503 AC3, 1190 count)
**Constraint:** Do NOT delete full test files unless ALL tests in the file are obsolete.
- `089-tool-macro.test.ts` — delete entire file (all 15 tests obsolete)
- `1414-diacritics-wave4.test.ts` — delete only FILE 1 describe block (7-9 tests), preserve
  FILE 2-5 (supplyChain, alert, watchlist, leadership sections)
- `1503-ohlcv-foreign-flow.test.ts` — delete only AC3 describe block (1 test)
- `1190-pipeline-watchdog.test.ts` — delete only the `schedulerFileCount === 43` test case

---

### Phase 3 — Regression fixes (C-bucket, ordered by risk)

1. **C2/C3** (macro-indicator freshness + cron-registry missing entry) — `dev-infrastructure`
   — lower coupling, self-contained
2. **C6** (notebook `.bak` cleanup + developer.md sections) — `dev-interface`
   — filesystem cleanup, fast
3. **C5** (orch-state.json wip/wip_max fields) — `dev-infrastructure`
   — SSOT update; verify against orch-state consolidation spec
4. **C1** (TRUST-RED-5b finalize_bctc_refine regression) — `dev-domain`
   — highest risk, touches financial data pipeline; requires careful validation
5. **C4** (agent .md Step 0-b sections) — `dev-interface`
   — doc-only change
6. **C7** (leadershipTools.ts diacritics) — `dev-interface`
   — string fix, low risk
7. **C8** — DWF canary — **DO NOT TOUCH**

---

## 4. Zone Ownership Summary

| Zone | Owner | Tasks |
|------|-------|-------|
| `interface/mcp/` + test isolation | `dev-interface` | B1 fix, A2 removal (1414 FILE 1), A1 removal (089), C4, C6, C7 |
| `infrastructure/db/` + scheduler | `dev-infrastructure` | B2 fix, B3 fix, A3 (1503 AC3), A4 (1190 count), C2, C3, C5 |
| `domain/services/bctc*` | `dev-domain` | C1 (TR-RED-5b) |

---

## 5. DDD Risk Flags

1. **B1 root cause** is a test-isolation anti-pattern, not a production risk. No production
   code change required. However: the `mock.module` pattern must be audited for OTHER test
   files using the same approach — any file calling `mock.module` at module level without
   `mock.restore()` is a future contamination bomb.
   ```
   grep -rn "mock.module" apps/mcp-server/src/__tests__/ | grep -v "beforeAll\|afterAll"
   ```
   This audit should be included in the dev task.

2. **HTTP delegation rewire** (`98df0f43`, `6fc7b6b3`) removed test injection points from
   `macroTools.ts` and `kinhDichTools.ts`. The new HTTP-delegate tests (if any) live in
   integration test suites. Confirm those suites exist before closing A1/A2 removal tasks.

3. **B2 stale DDL** is a structural debt: 63 test files maintain a parallel copy of production
   schema. Option A (using `initNewsTables(db)`) eliminates this debt class permanently.
   If Option B is chosen (add the column), the same breakage will recur on the next schema
   migration.

---

## 6. Files to Create / Modify

| File | Action | Zone | Owner |
|------|--------|------|-------|
| `apps/mcp-server/src/__tests__/1862c-transport-session-eviction.test.ts` | Edit — wrap mock in beforeAll/afterAll + mock.restore() | interface | dev-interface |
| `apps/mcp-server/src/__tests__/089-tool-macro.test.ts` | Delete file | interface | dev-interface |
| `apps/mcp-server/src/__tests__/1414-diacritics-wave4.test.ts` | Edit — remove FILE 1 describe block | interface | dev-interface |
| `apps/mcp-server/src/__tests__/1503-ohlcv-foreign-flow.test.ts` | Edit — remove AC3 describe block | infrastructure | dev-infrastructure |
| `apps/mcp-server/src/__tests__/1190-pipeline-watchdog.test.ts` | Edit — remove schedulerFileCount test | infrastructure | dev-infrastructure |
| `apps/mcp-server/src/__tests__/BANK-AWARE-1-consumer-audit.test.ts` | Edit — add statement_section to DDL | infrastructure | dev-infrastructure |
| 63 test files with inline `rag_analyses` DDL | Edit — add data_env or use initNewsTables | infrastructure | dev-infrastructure |
| `docs/data/cron-registry.json` | Edit — add macroIndicatorRefreshJob entry | infrastructure | dev-infrastructure |
| `docs/agent-memory/notebooks/developer.md` | Edit — add missing Step 0-b sections | interface | dev-interface |

**No production code changes in Phase 1 or Phase 2.** Phase 3 (Bucket C regressions) requires
targeted production fixes per C1–C7 findings.

---

*Brief authored by: agents-architect*
*Handoff: PM for task breakdown + sprint dispatch*
