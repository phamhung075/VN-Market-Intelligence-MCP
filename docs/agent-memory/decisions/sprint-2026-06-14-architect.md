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

---

### STEP architect-S2 · architect · 2026-06-14T18:15Z
**task-id:** ARCH-KINHDICH-HOVER-ENRICH
**what-done:** RATIFY-1 — confirmed Option C (new `hoverSummary localized` field) as the correct, lowest-risk shape for KINHDICH-HOVER-ENRICH; board transition KINHDICH-HOVER-ENRICH→ready + ARCH task closed.
**what-considered:**
- Option A (widen coreMeaning.vi): REJECTED — coreMeaning is consumed by gen-que-descriptions.ts (React frontend tooltip, QUE-TOOLTIP-DRY pipeline) as a terse identifier; widening breaks that contract (confirmed brownfield read: ARCH-QUE-TOOLTIP-DRY design brief, notebook 2026-06-12T09:00Z).
- Option B (surface stateInterpretation.vi + favorable.vi + warning.vi in hover): REJECTED — PO-Q3 verbosity ruling, warning.vi already rendered as `.qref-warning` L2504 (confirmed index.html raw-read), 3-field concat overflows inline span layout.
- Option C (new `HoverSummary localized` field in queReference struct): RATIFIED — fits existing `localized` type pattern exactly (struct already has coreMeaning/stateInterpretation/favorable/warning all using same type); build() closure accepts localized params in sequence; regen path `CGO_ENABLED=0 go run ./cmd/sandbox -emit-reference` confirmed real (same mechanism used by initial que-reference.js generation); L2501 `loc(q.coreMeaning)` confirmed as the exact swap target; zero cross-zone impact.
**why-decision:** Option C is the only shape that keeps all existing consumers stable (React frontend, MCP explain_hexagram, expanded detail panel), introduces no schema ambiguity, and maps cleanly to a single additive struct field + build() param. Done-bar (64 entries, zero terse residue) is fully verifiable via grep + python3 gate.
**why-change:** no change from BA plan; ratification confirms C.
