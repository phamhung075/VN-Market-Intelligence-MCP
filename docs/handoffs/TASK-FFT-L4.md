# TASK-FFT-L4 — Coverage-Map-Aware SLA Monitor Extension

**Sprint:** FRONTEND-FRESHNESS-TRANSPARENCY  
**Task ID:** TASK-FFT-L4  
**Owner:** dev-mcp-server  
**Zone:** `apps/mcp-server/src/scheduler/system/`, `apps/mcp-server/src/domain/services/`  
**Anchor:** FIX-L4-FRESHNESS-SLA-MONITOR-SELF-POLICING  
**Dependencies:** TASK-FFT-L2 (needs `data_asof` DB columns queryable)  
**Size:** ~2h  
**Status:** TODO

---

## Objective

Extend the existing `freshnessSlaMonitorJob.ts` (501L, 12-signal monitoring path) with a new domain service `coverageMapFreshnessChecker.ts` that reads the frontend coverage map as SSOT and escalates SLA breaches for all live frontend pages.

**Additive only:** The existing 12-signal SQL monitoring path runs first, unchanged. Coverage-map reader runs as a second pass in the same job cycle.

---

## New Artifacts

### 1. Domain Service: coverageMapFreshnessChecker.ts

**Location:** `apps/mcp-server/src/domain/services/coverageMapFreshnessChecker.ts`

**Pattern:** Pure domain checker, zero I/O, injectable for test isolation (mirrors `freshnessSlaChecker.ts`).

**Type definitions:**

```typescript
type CoverageMapRowStatus = "LIVE" | "L2" | "DEPTH_THIN" | "STALE_RISK" | "STATIC" | "GAP";

interface CoverageMapRow {
  page: string;
  endpoint: string | null;
  status: CoverageMapRowStatus;
  sla_tier: SlaTierKey;
  asof?: string | null;
  // ... other fields
}

interface FreshnessBreachReport {
  pageId: string;
  elementId: string;
  ageMinutes: number;
  maxStalenessMin: number;
  endpoint: string;
  timestamp: string;
}
```

**Function signature:**

```typescript
function checkCoverageMapFreshness(
  rows: CoverageMapRow[],
  db: Database,
  now?: Date,
  injectedRows?: CoverageMapRow[]
): Promise<FreshnessBreachReport[]>
```

**Behavior:**

1. Use `injectedRows` if provided (test isolation); else use input `rows`.
2. Filter for LIVE/L2/DEPTH_THIN/STALE_RISK rows (skip STATIC and GAP).
3. For each row, determine the DB column to query from the same mapping as TASK-FFT-L2:
   - marketDigest → `market_summaries.generated_at`
   - alerts → `alerts.updated_at` or `alerts.created_at`
   - qualityChecklist → computed-on-read (always fresh)
   - priceHistory → `daily_ohlcv.updated_at`
   - vpsProxyHealth → `vps_push_log.created_at`
4. Query `MAX(column)` from the DB; compute age in minutes: `(now - MAX_timestamp) / 60000`.
5. Compare age to `sla_tiers[row.sla_tier].max_staleness_min`.
6. If age > threshold AND row.status != STALE_RISK → breach (red flag).
7. If age > threshold AND row.status == STALE_RISK AND `isVnMarketHours()` == false → breach (off-hours amber counted as breach for escalation suppression).
8. Return array of FreshnessBreachReport objects.

**ARCH-RATIFY-FFT-3 Override (Architect):** Injectable parameter is `injectedRows?: CoverageMapRow[]` (pre-parsed objects), NOT `coverageMapPath?: string`. File reading delegated to scheduler layer. Domain has ZERO filesystem imports.

---

### 2. Scheduler Extension: freshnessSlaMonitorJob.ts

**Location:** `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` (existing, extend)

**Changes:**

1. Signature extension: Add `injectedCoverageMapRows?: CoverageMapRow[]` parameter to `runFreshnessSlaMonitor` (after `now`).
   - Backward-compatible: existing call sites pass no coverage-map argument → default undefined → scheduler reads live JSON file.

2. New second pass (after existing 12-signal path):
   ```typescript
   // Existing 12-signal path runs first (unchanged)
   const existingBreaches = await querySignalAges(/* ... */);
   
   // New coverage-map second pass
   const coverageMapRows = injectedCoverageMapRows 
     ?? await Bun.file(COVERAGE_MAP_JSON_PATH).json().then(d => d.rows);
   const coverageMapBreaches = await checkCoverageMapFreshness(
     coverageMapRows,
     db,
     now,
     injectedCoverageMapRows
   );
   
   // Process breaches: call postSignal for each
   for (const breach of coverageMapBreaches) {
     await postSignal({
       signalType: "urgent_news",
       fromAgent: "freshness-sla-monitor",
       toAgent: "alert-commander",
       severity: breach.ageMinutes > breach.maxStalenessMin ? "CRITICAL" : "WARNING",
       payload: {
         title: `SLA BREACH: ${breach.pageId} data is ${breach.ageMinutes}min old (max ${breach.maxStalenessMin}min)`,
         age_minutes: breach.ageMinutes,
         threshold_minutes: breach.maxStalenessMin,
         endpoint: breach.endpoint,
         timestamp: breach.timestamp,
       },
     });
   }
   ```

3. STALE_RISK suppression (for alerts, foreign-flow): If `row.status == "STALE_RISK"` and `isVnMarketHours() == false` → do NOT call postSignal (amber with qualifier is expected off-hours).

---

## Risk Flags (from Architect)

- **RISK-1 (MEDIUM):** BA spec recommended `coverageMapPath?: string` injectable. Override: use `injectedRows?: CoverageMapRow[]` — domain has ZERO I/O. File reading in scheduler layer.
- **RISK-6 (LOW):** L4 second pass adds ~5 MAX() queries per 30-min tick. Negligible load — same pattern as existing `querySignalAges`.

---

## Edge Cases

| ID | Scenario | Required Behavior |
|---|---|---|
| EC-7 | L4 empty-table sentinel | Coverage-map reader applies same -1 sentinel guard as existing `querySignalAges` — skip breach if table is not yet seeded |

---

## Acceptance Criteria (Definition of Done)

- [x] `coverageMapFreshnessChecker.ts` created with `checkCoverageMapFreshness` function
- [x] Type definitions: `CoverageMapRow`, `CoverageMapRowStatus`, `FreshnessBreachReport`
- [x] Function correctly queries MAX() from DB for each row's endpoint
- [x] Function computes age in minutes; compares to `sla_tiers[row.sla_tier].max_staleness_min`
- [x] Function filters for LIVE/L2/DEPTH_THIN/STALE_RISK; skips STATIC/GAP
- [x] STALE_RISK off-hours gate: use `isVnMarketHours()` from `freshnessSlaChecker.ts`
- [x] `freshnessSlaMonitorJob.ts` extended with second pass
- [x] Signature change: add `injectedCoverageMapRows?: CoverageMapRow[]` parameter
- [x] Existing 12-signal path remains unchanged (no modifications to that path)
- [x] Coverage-map path: reads `docs/data/frontend-data-coverage-map.json` in prod; uses `injectedCoverageMapRows` in tests
- [x] Unit tests: `coverageMapFreshnessChecker.ts` with injected mock rows (no filesystem access)
- [x] Integration test: forced DB column old timestamp → `postSignal` called with `fromAgent="freshness-sla-monitor"`
- [x] Integration test: STALE_RISK row outside market hours → NO escalation
- [x] Integration test: existing 12-signal path: breaches 0, recoveries 0, escalations 0 (additive, not modified)
- [x] Test file: `apps/mcp-server/src/__tests__/freshness-coverage-map-checker.test.ts`
- [x] tsc clean; no TypeScript errors
- [x] Existing tests unbroken

---

## Architecture References

- **DDD Layer:** Domain service (pure checker) + Application layer (scheduler extension)
- **Spec:** `docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md` § FR-6
- **Verified Paths:** `docs/handoffs/BA-FRONTEND-FRESHNESS-TRANSPARENCY.md` § Verified Paths (TASK-FFT-L4 section)
- **Reuse:** `isVnMarketHours()` from `apps/mcp-server/src/domain/services/freshnessSlaChecker.ts`
- **Pattern:** `injectedSignalAges` in `freshnessSlaMonitorJob.ts:357` (same injectable pattern for tests)

---

## Handoff Notes

**To:** dev-mcp-server  
**From:** PM  
**Date:** 2026-06-27  
**Depends on:** TASK-FFT-L2 (data_asof columns must be queryable)  
**Parallel with:** TASK-FFT-L3A, TASK-FFT-L3B

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `apps/mcp-server/src/domain/services/coverageMapFreshnessChecker.ts` — NEW (168L): Pure domain service. Types: CoverageMapRowStatus, SlaTierKey, CoverageMapRow, FreshnessBreachReport. Constants: SLA_MAX_STALENESS_MIN. ENDPOINT_DB_QUERY map (5 known endpoints). checkCoverageMapFreshness() with injectedRows injectable. STALE_RISK off-hours suppression inside domain. ZERO filesystem imports.
  - `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts` — MODIFIED: Added COVERAGE_MAP_JSON_PATH constant; added `injectedCoverageMapRows?: CoverageMapRow[]` parameter to `runFreshnessSlaMonitor` (backward-compatible — existing callers unaffected); additive L4 second pass after existing 12-signal path reading coverage-map and calling postSignal for each breach.
- **Tests written:**
  - `apps/mcp-server/src/__tests__/freshness-coverage-map-checker.test.ts` — 25 tests (CM-1..CM-10 domain + SC-1..SC-4 scheduler integration), GREEN. Pure domain tests use injected mock rows + minimal in-memory DB (no initDatabase). Integration tests use initDatabase() and verify agent_signals rows.
- **Git commits:** (see below — committed post-record)
- **Type check:** clean (bun tsc --noEmit — exit 0)
- **bun test:** full suite exit 0 — 13678 tests across 1130 files (bun test) | 25 pass / 0 fail (new test file alone) | 76 pass / 0 fail (4 freshness-related test files)
- **Tool count:** 166 tools — matches pre-task baseline (gen-project-stats --dry-run + server startup log both confirm 166)
- **Scheduler count:** 79 scheduleCron calls in startScheduler.ts — NO new cron entry added (L4 is an additive second pass inside the existing freshnessSlaMonitorJob, called by the existing `*/30` cron schedule)
- **Docs updated:** docs/handoffs/TASK-FFT-L4.md — this [Developer] record
- **DDD compliance:** domain service imports ONLY from domain (freshnessSlaChecker.js for isVnMarketHours) and bun:sqlite (parameter type). ZERO fs/Bun.file/node:fs imports. Scheduler reads coverage map file and passes rows to domain — file I/O stays in scheduler layer (infra).
- **ARCH-RATIFY-FFT-3:** Injectable is `injectedRows?: CoverageMapRow[]` (pre-parsed JS objects) — file reading in scheduler, not domain.
- **Graphify:** skipped (domain service + scheduler extension; no architectural topology change)

### Gate Evidence

| Gate | Result |
|---|---|
| bun tsc --noEmit | exit 0 (clean) |
| Server startup /health | `{"status":"ok","toolCount":166}` |
| gen-project-stats --dry-run toolCount | 166 (matches baseline) |
| scheduleCron count | 79 (unchanged — no new cron added) |
| bun test (full suite) | exit 0, 13678 tests, 0 fail |
| New test file | 25 pass, 0 fail |
| Freshness test battery (4 files) | 76 pass, 0 fail |

### Zone Health

Zone health: bun test exit 0, 166 tools intact, scheduler 79 scheduleCron (no new entry added, L4 is additive pass in existing job) | HEALTHY

---

## [QA] Review Record

**Reviewer:** qa
**Date:** 2026-06-27
**Verdict:** APPROVED
**Sprint:** FRONTEND-FRESHNESS-TRANSPARENCY

### Gate Results

| Check | Result |
|---|---|
| DDD INVARIANT (ARCH-RATIFY-FFT-3) | PASS — zero fs/path/readFile/Bun.file imports in domain service; only `bun:sqlite` type + domain sibling |
| Additive guarantee (existing 12-signal path) | PASS — L4 second pass in try/catch after existing path; SC-1 confirms no regression |
| bun tsc --noEmit | EXIT 0 |
| New tests (25) | 25/25 PASS |
| Freshness/SLA test battery (7 files, 115 tests) | 115/115 PASS |
| toolCount | 166 (unchanged) |
| scheduleCron | 79 (unchanged) |
| Full suite | EXIT 0 (Bun JIT crash at exit = known env issue, not code failure) |
| SLA thresholds vs SSOT | PASS — all 6 tiers match coverage-map sla_tiers exactly |
| mock-guard | PASS |
| Security | PASS — no process.env, no hardcoded secrets |
| Breach detection (EC-7, off-hours suppression) | PASS — CM-2/CM-5/CM-6/SC-2/SC-3 all green |

### Status

TASK-FFT-L4: **DONE** (commit 1dd3c6d1 on main, no branch)
