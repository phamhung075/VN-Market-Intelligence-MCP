---
sprint: CI-RED-RECONCILE
branch: fix/FIX-SCHEMA-DRIFT-P5-SELFHEAL
size: S
zone: apps/mcp-server/
depends_on: [FU-SCHEMA-DRIFT-P5]
blocks: []
---

## TLDR

Diagnose: bun test runs all 1033 files in ONE sequential process; module-level `_db` singleton is shared run-wide. Contract-A "singleton-killer" files call `closeDb()` in `afterAll` → nullify `_db`. Later `getDb()` calls in production modules (macroStatsStore.ts, positionTools.ts) receive fresh EMPTY `:memory:` db; catch-guards swallow "no such table" → return [] → downstream assertions fail. Fix: self-healing `getDb()` — when `_db = null`, synchronously call 8 init functions (not initFinancialReportsTables due to RISK-2 view compile). One file, one function, ~30m.

## [PM] Planning Context

- **Zone:** apps/mcp-server/ (test infrastructure — deployed to CI)
- **Acceptance Criteria:**
  - [ ] Modify EXACTLY ONE FILE: apps/mcp-server/src/infrastructure/db/schema.ts
  - [ ] Modify EXACTLY ONE FUNCTION: getDb()
  - [ ] In the `_db = null` branch, after PRAGMA setup, call in sequence: initMarketDataTables(_db), initAlertsTables(_db), initMacroTables(_db), initPortfolioTables(_db), initNewsTables(_db), initBriefingsTables(_db), initSystemTables(_db), initBacktestingTables(_db), initAgmPlanTables(_db)
  - [ ] DO NOT CALL initFinancialReportsTables() (RISK-2: view references period_quarter; risky outside full initDatabase())
  - [ ] DO NOT CALL migrateForeignFlowColumns() (async + migration-state-aware; only for initDatabase())
  - [ ] Run `bun test` locally on 002-db-schema.test.ts and per-file isolation (never full suite locally — host panic risk; CI is arbiter)
  - [ ] Run `bun tsc --noEmit` — must remain clean
  - [ ] Verification gate: native `bun test` summary `fail + errors` MUST DROP vs 629 absolute (baseline: fail=615+errors=14=629 per commit e442cf11)
  - [ ] Commit with pathspec ONLY (not -a/-am): `git commit -- apps/mcp-server/src/infrastructure/db/schema.ts`
  - [ ] Do NOT push; router owns push
  - [ ] Inline DJ-GATE-1 marker in commit message (see commit-convention.md)

- **Files to read first:**
  - docs/architecture-briefs/2026-06-09-ci-test-schema-fixture-spike.md § Addendum Phase 4 REVISED (lines 613–867) — full context on singleton pollution mechanism, why per-file isolation misses this, why self-heal is safe
  - apps/mcp-server/src/infrastructure/db/schema.ts (current getDb() function)
  - apps/mcp-server/src/infrastructure/db/schema-*.ts (to verify initXxxTables signatures are synchronous and use CREATE TABLE IF NOT EXISTS)

- **Files to create:** None

- **Files to modify:**
  - apps/mcp-server/src/infrastructure/db/schema.ts — add 8 initXxxTables() calls inside getDb() when `_db = null` branch

- **Dependencies:** FU-SCHEMA-DRIFT-P5 (architect spike — DONE)

- **Knowledge needed:**
  - docs/policies/dev-standards.md
  - docs/protocols/fail-loud-protocol.md
  - .claude/skills/commit-boundary/SKILL.md (RULE 1-3: explicit pathspec, verify git diff --cached, verify git show --name-only)
  - docs/policies/commit-convention.md (DJ-GATE-1 marker format)

## Why This Fix Works

1. **Idempotent slices:** All initXxxTables() use CREATE TABLE IF NOT EXISTS. Calling them in getDb() when `_db = null` (after a Contract-A file's closeDb()) is harmless; in production DB the tables already exist, so init calls are DDL no-ops.
2. **Zero blast radius to Contract-B:** Isolated test files that use `new Database(":memory:")` directly never call getDb(), so they are completely unaffected.
3. **Production unchanged:** Server boot still calls initDatabase() (async, migration-safe). The self-heal calls are additive no-ops on top.
4. **Targeted:** Only fixes the 6 failing table classes (agent_signals, sbv_rates_history, positions, commodity_prices, commodity_prices_history, imf_indicators) — the ones missing from fresh `:memory:` db after singleton pollution. Not a mechanized sweep; not a blueprint for future injections.

## Verification

Baseline (commit e442cf11): 629 failures (615 fail + 14 errors)
Expected post-fix: significant drop (conservative estimate ~95 of the 629 attributable to this defect)

Local quick-check:
```bash
cd apps/mcp-server
bun test 002-db-schema.test.ts  # schema regression test — must pass
bun test <one pure-singleton test file>  # spot-check a file that was failing in full suite
bun tsc --noEmit  # type check
```

No local full-suite run (host panic risk at 16GB Mac with Docker capped 8GB).

---

## Commit Format

```
fix(infrastructure/db): Self-healing getDb() for full-suite singleton pollution

Phase 4 REVISED addendum: bun runs all 1033 test files in one process;
module-level _db singleton shared run-wide. Contract-A afterAll(closeDb())
nullifies _db, leaving later getDb() calls with fresh empty :memory: db.
Production modules (macroStatsStore, positionTools) catch "no such table"
and return [], causing 629 test failures only in full suite (per-file
isolation passes — no prior state to wipe). 

Fix: getDb() self-heals when _db=null by synchronously calling 8 init
slices (idempotent CREATE TABLE IF NOT EXISTS). One-function change,
zero blast radius to Contract-B tests (never call getDb()),
zero production impact (server boot unchanged).

Files: apps/mcp-server/src/infrastructure/db/schema.ts
Scope: getDb() function, _db=null branch
Verification: native bun test fail+errors must drop vs 629 baseline

DJ-GATE-1: architect spike FU-SCHEMA-DRIFT-P5 DONE ✓
```

---

## [Developer] Implementation Record
- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:** `apps/mcp-server/src/infrastructure/db/schema.ts` — added 22 lines in `getDb()`, fresh-db branch after PRAGMA setup
- **Tests written:** None — fix verified via existing 002-db-schema.test.ts (24/0) and 182-portfolio-risk.test.ts (10/0)
- **Git commits:** `541123b4` fix(infrastructure/db): Self-healing getDb() for full-suite singleton pollution
- **Type check:** clean (bun tsc --noEmit — no output)
- **bun test (isolation):** 002-db-schema 24 pass / 0 fail; 182-portfolio-risk 10 pass / 0 fail
- **089-tool-macro:** 2 pass / 15 fail — pre-existing live-data assertion failures (not table-missing; no "no such table" errors observed)
- **Tool count:** unchanged (no tool barrel changes)
- **Scheduler count:** unchanged (no scheduler changes)
- **Docs updated:** docs/handoffs/FIX-SCHEMA-DRIFT-P5-SELFHEAL.md (this record) | docs/agent-memory/notebooks/dev-mcp-server.md | docs/data/orch/orch-state.json (status TODO→REVIEW)
- **DJ-GATE-1:** inline in commit message — architect spike FU-SCHEMA-DRIFT-P5 DONE; fix bounded to 1 file 1 function
- **Graphify:** skipped (no architecture doc impacted)

**Zone health:** bun tsc --noEmit clean, schema regression 24/24 pass, 1 source file changed | HEALTHY

---

*Handoff created by: pm*
*Spike: FU-SCHEMA-DRIFT-P5 (architect, DONE)*
*Task: FIX-SCHEMA-DRIFT-P5-SELFHEAL (dev-mcp-server, REVIEW)*
