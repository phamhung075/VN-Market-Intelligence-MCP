# Decision Journal — Sprint DASH-CRON-RECHECK-TABLE · dev-mcp-server

**Sprint goal:** Add a Cron Recheck Table to /dashboard/orchestration — honest
Layer-A (server) vs Layer-B (CLI-session) cron liveness classification.
**Agent:** dev-mcp-server
**Started:** 2026-07-02T08:10Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-02T08:10Z
**task-id:** TASK-DASH-CRON-1
**what-done:** Built Zone-1 backend: cronLivenessClassifier (domain), humanScheduleFormatter (domain), layerBCronRegistry (infra, CN-5 memoized), cronStatusCompute (application, CN-1/CN-2), cronStatusHandler (interface) + GET /api/cron-status route + cron-parser dep. 5 new test files, 72 tests, all GREEN.
**what-considered:**
- WATCHDOG_MANIFEST access from cronStatusCompute.ts: brief said "application reads WATCHDOG_MANIFEST" but that file physically lives under src/scheduler/, and the LIVE eslint.config.mjs Fence-B rule forbids application→scheduler imports (error-level, not the "Phase 1 no fence" note in main.md, which is stale).
- buildHumanSchedule placement: brief put it inside cronStatusCompute.ts (application) but Layer-B rows also need it and infra must not import application (would invert Fence-A/B).
**why-decision:** (1) Kept cronStatusCompute.ts scheduler-import-free — defined a local structural `CadenceManifest` type; the interface layer (cronStatusHandler.ts, unrestricted by the fence) owns the real WATCHDOG_MANIFEST/CRONS imports and passes values down as plain params (TS structural typing accepts the real WATCHDOG_MANIFEST object with zero physical import edge). Verified `eslint src/ --max-warnings 0` clean after. (2) Moved buildHumanSchedule into a second pure domain file (humanScheduleFormatter.ts, zero imports) so both layerBCronRegistry.ts (infra) and cronStatusCompute.ts (application) can import it downward — no new DDD violation, no duplicated logic.
**why-change:** Same functional outcome as the brief describes; only the import direction differs from the brief's literal file-list to satisfy the ACTIVE (not stale) ESLint fence. Verified live via `npx eslint` before committing.
