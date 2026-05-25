---
title: "Phase 1 Task Plan — mcp-server (RUN-SOLO, SCHEDULE-LAST)"
date: "2026-05-25"
author: "architect"
pilot: "mcp-server"
phase: "1"
status: "READY-FOR-DISPATCH — pending PO sequencing signal"
zone: "apps/mcp-server/"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-charter.md"
canonical_goals_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-brownfield.md"
language: "TypeScript"
runtime: "bun"
owner: "dev-mcp-server"
wip_limit: 1
schedule_constraint: "RUN-SOLO — zero other scale terminals active. LAST after all other service pilots complete."
risk: "HIGHEST"
---

# Phase 1 Task Plan — `mcp-server` (RUN-SOLO / HIGHEST-RISK)

**Generated:** 2026-05-25 by architect (Phase 0)  
**Zone:** `apps/mcp-server/` ONLY  
**Owner:** `dev-mcp-server` specialist  
**Language:** TypeScript / Bun (locked — not a rewrite candidate)  
**WIP:** 1 task at a time, SOLO terminal, throughout entire Phase 1  
**Status:** READY-FOR-DISPATCH — awaiting PO sequencing signal (schedule LAST)

---

## CRITICAL SCHEDULING CONSTRAINT — READ BEFORE DISPATCHING

This service runs **LAST** and **SOLO**. No other scale terminal may be active while any mcp-server phase is in progress. This is non-negotiable per the charter. Rationale:

1. **Shared-substrate write surface.** mcp-server writes `docs/signals/`, `docs/data/`, the scheduler state, and `market.db`. Other active terminals writing the same paths produce concurrent-commit-race + SSOT-duplicate-key class failures.
2. **132-tool blast radius.** Any barrel edit can silently break many tools. The QA gate covers all 132 tools after each wave.
3. **73-cron-job coupling.** Scheduler job registrations are import-coupled to every subdirectory. A broken import in any scheduler subdirectory silences that cron without a startup error.

**PO must emit a sequencing signal confirming all other service pilots are DONE (or at minimum all active scale terminals are stopped) before dispatching P1-A.**

---

## GIT DISCIPLINE RULES — BINDING FOR EVERY COMMIT IN THIS ZONE

These rules are non-negotiable. Violations in this zone have caused 26-file over-staging incidents.

1. **Explicit-file staging ONLY.** `git add <exact-path>` per file. NEVER `git add -A`, `git add .`, or `git add -am`. NEVER use flags that auto-stage all changes.
2. **Pre-commit diff review.** Always run `git diff --cached` and verify ONLY the intended files appear before committing.
3. **Acquire commit-mutex** (kind='sprint-task', key='commit-mutex:main') before staging. Release after commit. This prevents concurrent-commit-race with any parallel terminals.
4. **No --force, --no-verify, --no-gpg-sign.**
5. **All work on main.** No branches.
6. **SOLO terminal.** Confirm no other scale terminal is active before each commit.

---

## Phase 1 Overview

Phase 1 has two equal-weight tracks:

**Track A — Barrel Decomposition (dominant work):**  
Shrink `domain/services/index.ts` (139L, 84-file surface, Priority-1 violation) into bounded sub-barrels. Each wave is a safe, QA-gated split that reduces the mega-barrel without breaking any of the ~132 tool handlers that import from it.

**Track B — G5-Inverse Routing Verification:**  
Audit every tool handler file that imports from `domain/services/` and verify whether the import is: (a) legitimate domain logic that stays, (b) dead migrated code to delete, or (c) integration glue that needs a routing decision. Produce a verified routing map.

Phase 1 does NOT:
- Activate the architecture fence (Phase 2)
- Delete any files (Phase 2)
- Add new primitive packages (Phase 2)
- Start G4/G5/G10/G11 goals (Phase 2)

Phase 1 DOES:
- Shrink the Priority-1 barrel violation
- Document the G5-inverse routing map
- Verify all cron job imports survive each barrel change
- Add sandbox runner scaffolding (P1-A1, enables G1 in Phase 2)
- Establish the three-level dashboard stub (P1-B, enables G6 in Phase 2)
- Add bug-inventory baseline entry (P0-MCP-3 — part of this Phase 0/1 cycle)

---

## Pre-Revert Tags

These tags are created by `dev-mcp-server` at the relevant task boundary. None exist yet.

| Tag | Created at | Purpose |
|---|---|---|
| `mcp-server-pre-barrel-wave1` | Start of P1-C | Rollback anchor before first barrel split |
| `mcp-server-pre-barrel-wave2` | Start of P1-D | Rollback anchor before second barrel split |
| `mcp-server-pre-barrel-wave3` | Start of P1-E | Rollback anchor before third barrel split |
| `mcp-server-pre-ci` | Phase 2, P2-A | G4 fence freeze anchor before `eslint.config.mjs` |
| `mcp-server-pre-delete` | Phase 2, P2-G5a | G5 rollback anchor before `_deprecated/` moves |
| `mcp-server-pre-inject` | Phase 2, QA task | G10 rollback anchor before bug injection |

---

## G12 Streak Tasks (3-Task Streak Definition)

G12 requires 3 consecutive tasks where dev-mcp-server demonstrates dashboard-green-before-DONE discipline. For Phase 1, the streak tasks are:

1. **P1-B** (dashboard stub) — streak task #1
2. **P1-C** (barrel wave 1 with full-tool-suite QA gate) — streak task #2
3. **P1-D** (barrel wave 2 with full-tool-suite QA gate) — streak task #3

The G12 DoD rule for mcp-server: do not mark task DONE until (a) `bun test` passes all existing tests, and (b) sandbox tool count matches pre-task tool count (no tool silenced by broken import).

---

## Task Ledger

| ID | Name | Deps | Owner | Est | WIP order |
|---|---|---|---|---|---|
| P0-MCP-3 | Bug-inventory baseline entry | none | architect | done | 0 (this cycle) |
| P1-A1 | Sandbox runner scaffolding (mcp-server tier) | P0-MCP-3 | dev-mcp-server | 3h | 1 |
| P1-B | Three-level dashboard stub | P1-A1 | dev-mcp-server | 4h | 2 |
| P1-C | Barrel wave 1 — domain/services alert + financial-reports sub-barrels | P1-B | dev-mcp-server | 5h | 3 |
| P1-D | Barrel wave 2 — domain/services market-analysis + sector sub-barrels | P1-C | dev-mcp-server | 5h | 4 |
| P1-E | Barrel wave 3 — domain/services macro + news/sentiment + portfolio sub-barrels | P1-D | dev-mcp-server | 5h | 5 |
| P1-F | Barrel wave 4 — domain/services thematic + utility + VPS sub-barrels | P1-E | dev-mcp-server | 4h | 6 |
| P1-G | G5-inverse routing audit — produce verified tool routing map | P1-C | dev-mcp-server | 4h | 7 (parallel with P1-D allowed, same terminal sequential) |
| P1-H | KinhDich domain residual ruling — route or keep glue (2 callers) | P1-G | dev-mcp-server | 2h | 8 |
| P1-J | Macro domain sub-module audit — verify scheduler jobs route via HTTP | P1-G | dev-mcp-server | 2h | 9 |
| P1-K | DDD layer migration — move rateLimiter/resilientFetcher/vpsHealthPoller to infrastructure | P1-F, P1-J | dev-mcp-server | 3h | 10 |

**Total estimated Phase 1:** ~37h (1.5-2 sprints at RUN-SOLO pace)  
**WIP=1 throughout.** No task starts until prior task is DONE (QA-gated, not just "submitted").

---

## Detailed Task Specifications

---

### P0-MCP-3 — Bug-Inventory Baseline Entry

**Owner:** architect (completed in this Phase 0 cycle)  
**Output:** `mcp_server_baseline` entry added to `docs/data/bug-inventory.json`

See §Bug-Inventory Entry in this document and the companion signal.

**ACs:**
- AC-1: `docs/data/bug-inventory.json` has a `mcp_server_baseline` root key.
- AC-2: `baselineCycleCount` = 2.5 (estimated from mcp-server-attributed bugs in inventory: `1960-DAILYDASH-ENOENT`, `A-21c`, `1974-DAILYDASH-HOST-VISIBILITY`, `1965d-JANITOR-PATHFIX`, `1958a-alertDigestJob-catchup`, `1955b-zombie-cron-rows`; average fix cycles 2-3, rounded to 2.5).
- AC-3: G10 target for mcp-server: ≤2 cycles (must beat baseline).
- AC-4: Zero duplicate root keys in the JSON file (python3 verify).

---

### P1-A1 — Sandbox Runner Scaffolding

**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/sandbox/` (NEW directory)  
**Deps:** P0-MCP-3

This task creates the sandbox runner harness for the mcp-server trust tier. The mcp-server sandbox is distinct from the Go/Python service sandboxes — it tests domain service functions in isolation, not HTTP endpoints.

**Context:** The mcp-server sandbox runner verifies pure-function domain services (the candidates that will become primitives in Phase 2). It DOES NOT exercise HTTP routes or the full MCP server. The runner reads scenario JSON, calls a domain function, compares output to expected, writes trace JSON.

**Files to create:**
- `apps/mcp-server/src/sandbox/runner.ts` — scenario loader + dispatch
- `apps/mcp-server/src/sandbox/types.ts` — `ScenarioInput`, `TraceOutput` interfaces
- `apps/mcp-server/src/sandbox/scenarios/` — directory for scenario JSON files
- `apps/mcp-server/src/sandbox/scenarios/sparkline-golden-happy.json` — first scenario (use `sparkline.ts` pure function)
- `apps/mcp-server/src/sandbox/scenarios/sparkline-golden-empty.json` — edge case
- `apps/mcp-server/src/sandbox/scenarios/sparkline-failure-null.json` — failure case
- `apps/mcp-server/dashboard/index.html` — scaffold (three-panel stub, no data yet)

**Bun run command:** `bun run src/sandbox/runner.ts --scenario=src/sandbox/scenarios/sparkline-golden-happy.json`

**Security clause (mandatory):** The sandbox runner MUST have zero DB credentials and zero external API keys in its process environment. Verify: `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty when running the sandbox runner in isolation. The runner uses ONLY pure-function domain services — no infrastructure imports allowed inside `src/sandbox/runner.ts`.

**ACs:**
- AC-1: `src/sandbox/runner.ts` created. Imports ONLY from `src/domain/services/` (pure functions, no I/O). ZERO infrastructure imports.
- AC-2: 3 scenario JSON files created for `sparkline` (happy + edge + failure). All pass.
- AC-3: `bun run src/sandbox/runner.ts --scenario=<file>` exits 0 for happy/edge; exits non-zero for failure scenario with expected output matched.
- AC-4: `env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD"` returns empty in sandbox runner context.
- AC-5: Existing `bun test` suite passes (no regressions).
- AC-6: `git diff --cached` before commit shows ONLY the new sandbox files.

**G12 gate:** Not yet effective (streak starts at P1-B).

---

### P1-B — Three-Level Dashboard Stub

**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/dashboard/index.html` (NEW)  
**Deps:** P1-A1

Extend the dashboard stub to show three panels: Primitives (linked to sandbox scenario traces), Module (stub — no module yet), Microservice (overall tool health summary — count of green/red from last scenario run).

**Context:** This is a STUB — no live data in Phase 1. The dashboard reads from static `traces/` JSON files that the sandbox runner writes. The microservice panel shows a static "awaiting Phase 2" placeholder.

**Files to create/modify:**
- `apps/mcp-server/dashboard/index.html` — three-panel stub
- `apps/mcp-server/dashboard/traces/` — directory (sandbox runner writes here)
- `apps/mcp-server/src/sandbox/runner.ts` — add `--emit-traces` flag that writes trace JSON to `dashboard/traces/`

**Dashboard must NOT use any `dot-*` CSS classes or `.category-chip` patterns** (dash-check conventions carried from Go services). Use safe CSS class namespace: `.mcp-*`.

**ACs:**
- AC-1: `dashboard/index.html` opens via file:// URL in a browser. Three panels visible.
- AC-2: Panel-1 (Primitives) shows at least 1 sparkline scenario card (from trace JSON).
- AC-3: Panel-2 (Module) shows "Phase 2 — not yet extracted" placeholder. No JavaScript errors.
- AC-4: Panel-3 (Microservice) shows "~132 tools registered" static count.
- AC-5: `bun run src/sandbox/runner.ts --emit-traces` writes trace JSON to `dashboard/traces/`. Dashboard reloads and shows the new trace.
- AC-6: No JavaScript console errors on file:// open.
- AC-7: `bun test` passes.

**G12 gate (streak #1):** Task DONE only after dashboard shows green for all 3 sparkline scenarios. Screenshot of three-panel dashboard pasted into handoff before RETURN.

---

### P1-C — Barrel Wave 1: Alert + Financial-Reports Sub-Barrels

**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/domain/services/`  
**Deps:** P1-B  
**Pre-revert tag:** `mcp-server-pre-barrel-wave1` (create before any file edit)

**Rationale for this wave first:** The alert services (9 files) and financial-reports sub-folder (9 files) are the most naturally bounded groups in the mega-barrel. They already have a partial `financial-reports/` subdirectory. Splitting these out reduces the 139L barrel by approximately 30-35 lines without touching market-analysis or cross-cutting utilities.

**What to do:**
1. Create `src/domain/services/_barrels/alerts.ts` — re-export ONLY the alert service files (`alertCooldown`, `alertDedup`, `alertGenerator`, `alertGrouper`, `alertMuteChecker`, `alertPolicyChecker`, and the selective exports for `alertOutcomeScorer` and `alertBatchGrouper`).
2. Create `src/domain/services/_barrels/financial-reports.ts` — re-export ONLY the financial-reports sub-folder files.
3. Update `src/domain/services/index.ts` to import from `_barrels/alerts.js` and `_barrels/financial-reports.js` instead of listing each file.
4. Run `bun tsc --noEmit` — must pass.
5. Run `bun test` — must pass.
6. Run full-tool-suite smoke test: start the server (`bun run src/index.ts`) and verify `GET /health` returns 200. Do NOT run `bun run start` in the container (this is a dev verification).

**ACs:**
- AC-1: `src/domain/services/_barrels/alerts.ts` created.
- AC-2: `src/domain/services/_barrels/financial-reports.ts` created.
- AC-3: `src/domain/services/index.ts` updated. Line count reduced by ≥25 lines.
- AC-4: `bun tsc --noEmit` exits 0.
- AC-5: `bun test` passes (all existing tests).
- AC-6: `bun run src/index.ts` starts without import errors. Log line `[bootstrap] Database ready` appears.
- AC-7: Tool count probe: `grep -r "server.tool\|server.addTool" src/interface/mcp/tools/ | wc -l` — count matches pre-task count (no tool silenced).
- AC-8: `git diff --cached` before commit shows ONLY `src/domain/services/index.ts` + 2 new barrel files. No scheduler files, no tool handlers, no infra files.

**G12 gate (streak #2):** Task DONE only after AC-4 through AC-8 all pass. Evidence pasted into handoff before RETURN.

---

### P1-D — Barrel Wave 2: Market-Analysis + Sector Sub-Barrels

**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/domain/services/`  
**Deps:** P1-C  
**Pre-revert tag:** `mcp-server-pre-barrel-wave2`

**What to do:**
1. Create `src/domain/services/_barrels/market-analysis.ts` — re-export signal detection, cascade, chain, intraday, order book, price alerts, conviction, decision note, signal class weighter, volatility (selective, PricePoint collision), performance attribution (selective).
2. Create `src/domain/services/_barrels/sector.ts` — re-export correlation, sectorPeers, sectorRotation, sectorValuation.
3. Update `src/domain/services/index.ts` to import from `_barrels/market-analysis.js` and `_barrels/sector.js`.

**ACs:**
- AC-1 through AC-7: Same pattern as P1-C (tsc, bun test, server start, tool count probe, git diff).
- AC-8: `src/domain/services/index.ts` line count now ≤ 90 lines.

**G12 gate (streak #3):** Task DONE only after all ACs pass. Streak complete. G12 evidence: three handoffs (P1-B + P1-C + P1-D) each show dashboard/test-green before DONE.

---

### P1-E — Barrel Wave 3: Macro + News/Sentiment + Portfolio Sub-Barrels

**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/domain/services/`  
**Deps:** P1-D  
**Pre-revert tag:** `mcp-server-pre-barrel-wave3`

**What to do:**
1. Create `src/domain/services/_barrels/macro.ts` — re-export `macroIndicatorScorer`, `macroOutlierGuard`, `macroThresholds`, `predictionCascadeMapper`, `predictionSignalDetector`, `forecastConfidenceScore`, `baseRateComputer`.
2. Create `src/domain/services/_barrels/news-sentiment.ts` — re-export `newsNormalizer`, `sentimentClassifier`, `sentimentTrend`, `recencyWeighter`, `vnRelevanceFilter`, `embeddingTextBuilder`.
3. Create `src/domain/services/_barrels/portfolio.ts` — re-export `portfolioPnlCalculator`, `portfolioRiskCalculator`, `rebalancingCalculator`, `stopLossComputer`.
4. Update `src/domain/services/index.ts`.

**ACs:** Same QA pattern as P1-C/D. Target: `index.ts` ≤ 60 lines after this wave.

---

### P1-F — Barrel Wave 4: Thematic + Utility + VPS Sub-Barrels

**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/domain/services/`  
**Deps:** P1-E

**What to do:**
1. Create `src/domain/services/_barrels/thematic.ts` — re-export `bondMaturityTracker`, `catalystCalendar`, `customAlertEvaluator`, `earningsCalendar`, `reputationScorer`, `sourceHealthTracker`, `stockAliases`, `stockSearch`, `tradeRelationships`, plus all selective thematic exports (climateImpactMapper, creditFlowAnalyzer, crisisPatternDetector, energyMarketAnalyzer, foreignFlowAnalyzer, leadershipSignal, legalRiskDetector, pharmaEventMapper, policyImpactMapper, supplyChainAnalyzer, supplyChainEventDetector).
2. Create `src/domain/services/_barrels/utils.ts` — re-export `rateLimiter`, `sparkline`, `timeConstants`, `tradingWindow`, `vnNumberParser`, `priceBackfillService`.
3. Create `src/domain/services/_barrels/vps-sla.ts` — re-export `vpsHealthPoller`, `freshnessSlaChecker` selective.
4. Update `src/domain/services/index.ts`. The macro sub-module (`kinhDich/index.js`, `kinhDich/kinhDichWrapper.js`, `macro/index.js`) remains as-is (ruling deferred to P1-H/J).

**Target:** `domain/services/index.ts` ≤ 30 lines (just sub-barrel re-exports + KD/macro sub-module re-exports + comment header).

**ACs:** Same QA pattern. Add: run `grep -c "cron.schedule" src/scheduler/startScheduler.ts` — count must match pre-task count (68). Scheduler imports must not be affected.

---

### P1-G — G5-Inverse Routing Audit

**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/interface/mcp/tools/` (read-only audit)  
**Deps:** P1-C (barrel wave 1 done, imports stabilized)

**What to do:**
Systematically audit all 101 tool handler files. For each file that imports from `../../../../domain/services/`:
- Classify the import as: ROUTE (should go via HTTP service), KEEP (legitimate local domain logic), GLUE (integration helper that wraps service call), or DEAD (migrated to microservice, can delete).
- Produce a routing map document.

**Output:**
- `docs/architecture-briefs/2026-05-22-refactor/scale/mcp-server-tool-routing-map.md` — table of all 101 handlers, import classification, recommended action.

This is a READ-ONLY audit. No file changes in this task. The routing map is the Phase 2 input for G5-inverse deletions.

**Key items to audit:**
- `market-data/marketTools.ts` — imports `kinhDichWrapper.appendKinhDich` (line 26). GLUE or ROUTE?
- `news-analysis/analysis.ts` — imports `kinhDichWrapper.appendKinhDich` (line 22). GLUE or ROUTE?
- `portfolio/portfolioTools.ts` — imports `QUE_META` from `hexagramLibrary.ts`. KEEP (static data) or move to reference file?
- `macro/macroTools.ts` — verify HTTP-routed (confirmed); document as ROUTE.
- All `sector/` tool handlers — many import directly from domain services (thematic functions). Audit each.

**ACs:**
- AC-1: `mcp-server-tool-routing-map.md` created and committed.
- AC-2: All 101 tool handler files appear in the map.
- AC-3: Each handler classified as ROUTE / KEEP / GLUE / DEAD.
- AC-4: Summary counts: how many DEAD (candidates for Phase 2 G5 delete), how many GLUE (need routing decision).
- AC-5: No file edits — this is analysis only.

---

### P1-H — KinhDich Domain Residual Ruling

**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/` (analysis + minimal change)  
**Deps:** P1-G

**What to do:**
Based on P1-G routing map, make the architectural ruling for the two `kinhDichWrapper` callers:
- `market-data/marketTools.ts` — appends kinh-dich reading to market scan output. Does this routing make sense via the kinh-dich-service HTTP endpoint, or is it appropriate integration glue?
- `news-analysis/analysis.ts` — same pattern.

If the ruling is ROUTE: update callers to use `clients.ts getKinhDichReading()` instead of the local wrapper.  
If the ruling is KEEP GLUE: document the decision and add a `// GLUE: intentional — not a G5 violation` comment.

**ACs:**
- AC-1: Ruling documented (either as code comment or in routing map).
- AC-2: If ROUTE: callers updated, `kinhDichWrapper.ts` marked as `// DEPRECATED — use kinh-dich-service HTTP endpoint`.
- AC-3: `bun tsc --noEmit` passes.
- AC-4: `bun test` passes.

---

### P1-J — Macro Domain Sub-Module Audit

**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/domain/services/macro/` (read-heavy, possible minor changes)  
**Deps:** P1-G

**What to do:**
Audit `domain/services/macro/` (10 files: `carryTradeSignal`, `computeFedLiquiditySpread`, `investmentClock`, `ismRegimeSignal`, `macroCalendar`, `macroIndicatorFetcher`, `marketEarningYield`, `pyramidTier`, `yieldSpreadSignal`, plus `index.ts`).

Key question: does `macroIndicatorFetcher.ts` still fetch external APIs directly, or does it delegate to the macro-indicators microservice? If it fetches directly: is it called by `macroIndicatorRefreshJob.ts` in the scheduler? If so, this is a G5-inverse violation — the scheduler bypasses the microservice.

Verify:
1. `grep -n "from.*domain/services/macro" apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts`
2. `grep -n "from.*infrastructure/microservices/clients" apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts`

Expected: macro scheduler jobs use `clients.ts getMacroSnapshot/getMacroExternal`. Confirm or flag.

**ACs:**
- AC-1: Audit result documented in routing map (append to `mcp-server-tool-routing-map.md`).
- AC-2: If direct-fetch bypass found: flag as HIGH-priority Phase 2 G5-inverse task.
- AC-3: If already HTTP-routed: confirm and document.
- AC-4: No file changes required if routed correctly.

---

### P1-K — DDD Layer Migration: Infrastructure Utilities Out of Domain

**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/domain/services/` → `src/infrastructure/`  
**Deps:** P1-F, P1-J (barrel waves complete, macro audit done)

**What to do:**
Move three misplaced files from `domain/services/` to `infrastructure/`:
- `domain/services/rateLimiter.ts` → `infrastructure/rateLimiter.ts`
- `domain/services/resilientFetcher.ts` → `infrastructure/resilientFetcher.ts`
- `domain/services/vpsHealthPoller.ts` → `infrastructure/vpsHealthPoller.ts`

Update all import paths that reference these files. Since these are re-exported from the domain barrel, the barrel must be updated too.

**ACs:**
- AC-1: Files moved (not copied). Original paths do not exist.
- AC-2: Domain barrel `index.ts` updated — no longer exports these three.
- AC-3: All callers updated to import from `infrastructure/`.
- AC-4: `bun tsc --noEmit` passes.
- AC-5: `bun test` passes.
- AC-6: Scheduler import count probe: `grep -c "cron.schedule" src/scheduler/startScheduler.ts` = 68 (unchanged).

---

## QA Gate — Per-Wave Full-Tool-Suite Verification

After each barrel wave (P1-C, P1-D, P1-E, P1-F), QA (or dev-mcp-server acting as QA) must run:

```bash
# Gate 1: TypeScript check
bun tsc --noEmit

# Gate 2: Full test suite
bun test

# Gate 3: Server startup check
bun run src/index.ts &
sleep 5
curl -s http://localhost:3000/health
kill %1

# Gate 4: Tool count probe (no tool silenced)
grep -rc "server.tool\|addTool" apps/mcp-server/src/interface/mcp/tools/ | awk -F: '{sum+=$2} END {print sum}'
# Count must match pre-wave baseline

# Gate 5: Scheduler count probe
grep -c "cron.schedule" apps/mcp-server/src/scheduler/startScheduler.ts
# Must be 68
```

Only when all 5 gates pass is the wave task DONE. Gate failures trigger rollback to the pre-wave tag and a Phase 2 rethink.

---

## Scheduler / Cron Verification Protocol

This protocol applies to any task that modifies files under `src/scheduler/` or any file imported by scheduler jobs.

After each barrel split, check that scheduler imports resolve:
```bash
# Verify no broken imports in scheduler
bun build src/scheduler/startScheduler.ts --target=bun --no-bundle 2>&1 | grep -E "error|Cannot find"
```
Must return 0 errors.

Additionally, for cron-critical jobs (those with highest-frequency or user-visible outputs):
- `foreignFlowFetch` (1-min interval): verify `src/scheduler/market-data/foreignFlowFetcherJob.ts` still imports correctly.
- `vnIndexRefresh` (5-min interval): verify `src/scheduler/market-data/vnIndexRefreshJob.ts`.
- `intelligenceCycle` (15-min interval): verify `src/scheduler/news-analysis/intelligenceCycleJob.ts`.

---

## Dashboard Circular Dependency Protocol

After any barrel wave that changes import paths, verify the 5 served dashboards still function:

```bash
# Server startup and dashboard health
curl -s http://localhost:3000/api/bctc-inspect | head -5       # should return HTML
curl -s http://localhost:3000/dashboards/news-fetch/ | head -5  # should return HTML
curl -s http://localhost:3000/api/news-fetch/live?source=all\&limit=1  # should return JSON
```

If any returns 500 or empty, the barrel change broke a dashboard route handler import. Rollback to pre-wave tag.

---

## Phase 2 Scope Preview (Not Phase 1 Work)

Phase 2 begins only after Phase 1 is QA-gated complete. Phase 2 deliverables:
- G4: Architecture fence (`eslint-plugin-boundaries`) activated in CI
- G5: G5-inverse deletions (per routing map from P1-G): remove dead migrated domain code
- G1: Promote 4+ candidates from barrel sub-modules to `packages/primitives/`
- G2: Module package under `packages/modules/mcp-core/`
- G10: QA bug injection into a primitive; dev-mcp-server fixes in ≤2 cycles
- G11: Regression alarm bell proof
- G9: User verifies mcp-server trust dashboard (user verbal confirmation)

---

## Bug-Inventory Entry (P0-MCP-3)

This entry is written to `docs/data/bug-inventory.json` as part of the Phase 0 commit.

```json
"mcp_server_baseline": {
  "service": "mcp-server",
  "baselineCapturedAt": "2026-05-25T00:00:00Z",
  "windowDays": 60,
  "baselineCycleCount": 2.5,
  "g10Target": 2,
  "notes": "Estimated from mcp-server-attributed bugs in inventory (1960-DAILYDASH-ENOENT, A-21c, 1974-DAILYDASH-HOST-VISIBILITY, 1965d-JANITOR-PATHFIX, 1958a-alertDigestJob-catchup, 1955b-zombie-cron-rows). Cluster in two categories: daily-dashboard file-path issues and scheduler correctness. Average fix cycles 2-3, rounded to 2.5. System-wide baseline is 1.5.",
  "bugs": [
    { "id": "1960-DAILYDASH-ENOENT", "module": "system/dailyDashboardJob", "fixCycles": 3, "status": "resolved" },
    { "id": "A-21c-dailyDashboardJob-ENOENT", "module": "system/dailyDashboardJob", "fixCycles": 2, "status": "resolved" },
    { "id": "1974-DAILYDASH-HOST-VISIBILITY", "module": "system/dailyDashboardJob", "fixCycles": 2, "status": "resolved" },
    { "id": "1965d-JANITOR-PATHFIX", "module": "system/tasksMdJanitorJob", "fixCycles": 2, "status": "resolved" },
    { "id": "1958a-alertDigestJob-catchup", "module": "alerts/alertDigestJob", "fixCycles": 3, "status": "resolved" },
    { "id": "1955b-zombie-cron-rows", "module": "infrastructure/db/cronJobRunStore", "fixCycles": 2, "status": "resolved" }
  ]
}
```

---

## Recommended G10 Primitive Target for Phase 2

Based on brownfield scan, the best G10 target primitive is `sparkline.ts` (pure function, zero dependencies, currently at `domain/services/sparkline.ts`). Bug injection candidate: change the fill character or bar-width threshold literal. Realistic bug, single-literal fix, cycle-count measurable.

Second candidate: `vnNumberParser.ts` — parse VN number format (billions/trillions). Bug injection: off-by-3 for the trillion suffix. Single literal.

---

## Anti-Scope-Creep Clause

This task plan covers `apps/mcp-server/` ONLY. Forbidden while this plan is active:
- Editing any `apps/frontend/` files
- Editing any `pilot-status-*.json` (PO owns those)
- Editing `docs/TASKS.md` (PO owns it this cycle)
- Touching any `apps/<other-service>/` directories
- Adding new MCP tools (that is a feature, not a refactor)
- Changing scheduler cron expressions (that is an ops concern)
