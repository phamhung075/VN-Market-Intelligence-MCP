# Decision Journal — Architect | 2026-06-14

## Entry: ARCH-CRON-SCHEDULER-RELIABILITY

**task_id:** ARCH-CRON-SCHEDULER-RELIABILITY
**timestamp:** 2026-06-14T03:00Z
**zone:** apps/mcp-server/

### what-considered

Three options evaluated for the scheduler library:
1. Upgrade node-cron v3→v4: rejected. API surface change (55 call sites), no guarantee that the tick-drop bug under event-loop saturation is fixed at the core, Bun compatibility unknown.
2. Replace with croner library: rejected. Different option keys and error-handling API; 55 call-site migration is too high brownfield risk for a production scheduler with no rollback window.
3. Keep node-cron v3.0.3 + 4-lever system: SELECTED. Zero new library surface. Existing `wrapRun()` + `getLastRuns()` infrastructure covers dedup. `recoverMissedExecutions` is already proven (alertDigestJob, evidenceAccumulatorJob). Watchdog is net-new but fully within existing patterns.

### why-change

Per recurring-bug-escalation policy (4th touch of same bug class). Per-job symptom patching has failed twice (53d00955 added `recoverMissedExecutions: true` to evidenceAccumulator + reputation, but reputation still missed 2026-06-12 because the dedup guard was absent — so recovery fired but did nothing new against the same-day double-fire concern, and the event-loop saturation still dropped the tick). Systemic fix requires all four levers simultaneously.

### key-architectural-choices

1. **Phase ordering is HARD**: T4 dedup guards (Phase 1a) must ship before `recoverMissedExecutions: true` (Phase 1b). If 1b ships without 1a, recovery replays on non-idempotent jobs could double-send Telegram to MARKET channel. PM must enforce sequential sub-task ordering.

2. **Watchdog uses alert-only for long-running jobs** (vnstockFundamentals = 7–10 min). Self-heal is reserved for quick jobs (<2 min) that have `isRunning` guards. This prevents a watchdog self-heal from amplifying event-loop saturation at exactly the moment the saturation is happening.

3. **Jitter is deterministic (fixed offsets), not random**. Random jitter would make the watchdog cadence calculation wrong (the declared cadence must match the actual fire time). Fixed offsets in cronConfig.ts defaults are the correct mechanism; env-override preserves flexibility.

4. **IMPL gate is non-negotiable**: FIX-MCP-CRASH-LOOP-WRITEWAL must land first. A server that restarts every 2h clears the `recoverMissedExecutions` internal timer and the watchdog's in-process cooldown Map. The WRITEWAL fix stops the restart cycle; only then does this ARCH-CRON fix become durable.

5. **DDD boundary preserved**: watchdog reads `cron_job_runs` via `SqliteJobRunRepository.getLastRuns()` (injected), never calls `getDb()` directly. No domain imports. Orch-state is NOT written by the watchdog (that's the WRITEWAL brief's responsibility for WAL escalation). Each brief stays in its lane.

### build-standard-rationale

`lean` — new feature (watchdog file) within existing zone (`apps/mcp-server/`). No new MCP tools, no new domain services, no new DB tables. `schedulerWatchdogJob.ts` is additive, within existing `scheduler/system/` module. The 55-job update to add `recoverMissedExecutions` is mechanical (no new behavior per job, just a flag change).
