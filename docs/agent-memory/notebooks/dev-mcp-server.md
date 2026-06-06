# dev-mcp-server -- Notebook

## c376 · 2026-06-06T17:00Z (FIX-SLA-WEEKEND-AWARE) — COMMITTED

**Task:** FIX-SLA-WEEKEND-AWARE (S) — calendar-aware SLA for market-hours-only sources.

**Root cause:** prices/foreign_flow VPS fetch loops are DOW/hour-gated (Mon–Fri 02:00–08:59 UTC). SLA monitor used flat 10-min threshold 24/7 → guaranteed CRITICAL every weekend (1462-min breach on Saturday while in designed sleep). `vpsProxyTools.isStale()` and `vpsProxyHealthHandler.computeStale()` also had no market-hours awareness.

**Fix (7 files):**
- `freshnessSlaChecker.ts`: added `MARKET_HOURS_ONLY_SOURCES`, `lastExpectedWindowEnd()`, `minutesSinceLastWindowEnd()`. Updated `getSlaThreshold()` — price/foreign_flow off-hours threshold = `minutesSinceLastWindowEnd + 30 min grace` (data from last session always passes; tight 10-min SLA only during active window).
- `vpsProxyTools.ts`: imported domain helpers; `isStale()` now calendar-aware; `formatHealth()` shows "off-hours" label and separates true-stale from off-hours-stale in summary.
- `vpsProxyHealthHandler.ts`: `computeStale()` calendar-aware; `handleVpsProxyHealth()` accepts injectable `now`; response JSON gains `off_hours` field per service.
- `slaStatusTools.ts`: replaced inline `isVnMarketHours()` with domain import; `getSlaThresholds()` delegates to domain `getSlaThreshold()`; status can now be "off-hours" (not counted as breach in summary).
- `234-vps-health-sla.test.ts`: AC-3+AC-5 fixed to pass market-hours `now`.
- `1352c-freshness-sla-monitor-e2e-sscchecker-guard.test.ts`: A-3 fixed with market-hours `now`.
- `VPT-1-vps-proxy-health-endpoint.test.ts`: (c) updated to use `news` (non-market-hours-only service) for stale test.
- `FIX-SLA-WEEKEND-AWARE.test.ts` (NEW): 21 tests W-1..W-10 covering weekend, Friday-close, Monday-stale, mid-session cases.

**Results:** tsc 0 errors. 69 targeted pass / 0 fail (FIX-SLA + 234 + 1352c + VPT-1 + 1920i). tools=164, sched=72 (baseline intact).

**Live proof path:** `GET /api/vps-proxy-health` → prices.off_hours=true + prices.stale=false (if last push within window); `get_sla_status` → price/foreign_flow status="off-hours" on weekend.

Zone health: SLA weekend false-CRITICAL eliminated, off-hours gate in domain+handler+MCP tool, tsc clean | HEALTHY

---

## c375 · 2026-06-06T12:45Z (FIX-REFINE-IDEM-LOCK-ISO) — COMMITTED 368b7bad

**Task:** FIX-REFINE-IDEM-LOCK-ISO (S) — isolate coordination-store lock in AR-refined-units-idempotency tests.

**Root cause:** `claimTask` used `owner_agent:"refine-orchestrator"` but `releaseTask` was called with `pid-${process.pid}` as `owner_agent` (positional mismatch) → DELETE matched 0 rows → lock zombied until TTL → all same-taskId subsequent calls skipped → 4 scenarios RED. Cross-scenario bleed: `_coordDb` singleton never reset between `it` blocks.

**Fix (2 files):**
- `AR-refined-units-idempotency.test.ts`: added `beforeEach` → `_resetCoordinationDbState()` + `ensureCoordinationTable(db)` + `_injectCoordinationDb(db)` + `afterEach` reset/close; imported 3 seam functions.
- `bctcRefineJob.ts` L512: `releaseTask(taskId, \`pid-${process.pid}\`)` → `releaseTask(taskId, "refine-orchestrator")` (owner_agent must match the claim).

**Results:** 9→13/13 GREEN; task-lock-coordination-store 27/27 still GREEN; tsc 0 errors; no coordination.db on disk (no leak path).

Zone health: 13/13 idempotency GREEN, 27/27 lock-store GREEN, tsc clean | HEALTHY

---

## c374 · 2026-06-05T23:46Z (ARCH-ORCH-F2) — COMMITTED da37602f

**Task:** ARCH-ORCH-F2 — journalStore.ts + orchestrationHandler.ts decisions extension (ORCH-DASH-DECISION-DRILLDOWN sprint).

**Implemented:**
- `apps/mcp-server/src/infrastructure/journalStore.ts`: StepDto/DecisionsDto types, parseJournalFile (pure, CRLF-safe, CAP-REACHED guard, task-id routing), buildDecisionsDto, getDecisionsForSprints with module-level mtime cache, _clearCacheForTesting export.
- Extended `orchestrationHandler.ts`: decisions: DecisionsDto added to OrchestrationDto; buildOrchestrationDto now accepts optional decisionsDir; sprint-ID union from sprint_goal.entries (all statuses) + active_sprints; zero-value on no-files (AC-F2-8).
- Created `1978-journal-store.test.ts` (26 tests, T1–T6 + real fixture + CRLF).
- Created `1979-orchestration-decisions.test.ts` (13 tests, T1–T3).
- Extended `1977-orchestration-endpoint.test.ts` (+1 T1h assertion).

**Results:** tsc 0 errors. 59 tests green (1977+1978+1979), 0 fail. Live curl: decisions.by_task[ARCH-ORCH-F1] (agent-father-S1) + sprint_bucket[ORCH-DASH-DECISION-DRILLDOWN] (9 entries) populated from real fixture. Container rebuilt.

Zone health: F2 DONE, decisions field live, ARCH-ORCH-F2 → REVIEW | HEALTHY

---

## Working Memory

### Baselines (c376)
- tools=164, sched=72 | ops_rebuild_required: true (EMIT-DARK + FIX-CTG-PDF-MISLINK + FIX-SLA-WEEKEND-AWARE all pending rebuild)

Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`
