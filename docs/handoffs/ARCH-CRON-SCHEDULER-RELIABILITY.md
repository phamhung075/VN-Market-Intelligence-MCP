# Handoff — ARCH-CRON-SCHEDULER-RELIABILITY

**From:** architect
**To:** pm
**Date:** 2026-06-14
**Status:** DESIGN COMPLETE — ready for PM task breakdown

---

## [Architect] Brownfield Findings

- **Zone:** `apps/mcp-server/`
  - Single zone — all scheduler logic is in this service. No cross-service changes.

- **Verified paths:**
  - `apps/mcp-server/src/scheduler/startScheduler.ts` — 1072L master registration, 50+ `cron.schedule()` calls
  - `apps/mcp-server/src/scheduler/cronConfig.ts` — 55 CRONS keys, all Bun.env-overridable
  - `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts` — `recordJobRun()`, `reapZombieJobRuns()`
  - `apps/mcp-server/src/infrastructure/db/repositories/SqliteJobRunRepository.ts` — `wrapRun()`, `getLastRuns()` already exist
  - `apps/mcp-server/src/scheduler/system/` — location for new `schedulerWatchdogJob.ts`

- **Reuse patterns:**
  - `jobRunRepo.wrapRun()` is the standard wrapper — extend, do not duplicate
  - `jobRunRepo.getLastRuns()` is the dedup check mechanism — already implemented, no new infra
  - `shouldRunCatchup()` in `startupHelpers.ts` is the existing startup-miss pattern; T4 guards use the same concept applied in-job

- **Design decisions:**
  - Library: KEEP node-cron v3.0.3. See brief §3.1 for rejected alternatives (croner + node-cron v4 both rejected due to brownfield risk).
  - 4-lever system: `recoverMissedExecutions: true` universally + T4 dedup guards + deterministic jitter + missed-fire watchdog
  - Watchdog fires every 10 min, reads `cron_job_runs`, sends WORK alert or self-heals via `wrapRun()`
  - Phase ordering is HARD CONSTRAINT: dedup guards (Phase 1a) MUST ship before `recoverMissedExecutions` (Phase 1b)

- **Confirmed-dead jobs (must be verified alive post-deploy):**
  - `ohlcvDailyAggregatorJob` — dead since 2026-06-13, jitter shift to `3 15 * * 1-5`
  - `reputationComputeJob` — missed 2026-06-12, jitter shift to `33 8 * * *`
  - `vnstockFundamentalsRefresh` — dead since 2026-06-08 (banner-bridge bug fixed, auto-fire not restored)

- **IMPL gate — NON-NEGOTIABLE:**
  - `FIX-MCP-CRASH-LOOP-WRITEWAL` must land and be ops-verified before dev starts IMPL on this task.
  - A crash-looping server drops ticks at the process level. No scheduler fix survives a server that restarts every 2h.
  - Design is final and complete. Task breakdown by PM can proceed now.

- **Scan clean:** true

```
BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
NOTE: dev-mcp-server drives end-to-end; no relay required
```

---

## Full Design

Full architecture brief: `docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md`

Key sections for PM task breakdown:
- §4 — Detailed design for each lever (code patterns included)
- §5.2 — Files to Modify table (14 files)
- §5.3 — Files to Create table (3 files)
- §6 — Idempotency contract + tier table (T1/T2/T3/T4 per job)
- §7 — Watchdog spec (interface signature)
- §9 — Risk table (7 risks with mitigations)
- §11 — Test strategy (10 test cases)
- §12 — Acceptance criteria (12 ACs)

---

## RETURN

```
DONE: Technical design complete, brownfield findings written above
ZONE: apps/mcp-server/
NEXT: pm | break design into atomic tasks (3 phases per §5.1) and create developer handoffs
HANDOFF: docs/handoffs/ARCH-CRON-SCHEDULER-RELIABILITY.md
PIPELINE: continue
IMPL GATE: FIX-MCP-CRASH-LOOP-WRITEWAL must land before dev IMPL starts
```
