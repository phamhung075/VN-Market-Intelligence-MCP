# Decision Journal — Sprint DASH-CRON-RECHECK-TABLE · qa

**Sprint goal:** Add a Cron Recheck Table to /dashboard/orchestration — honest
Layer-A (server) vs Layer-B (CLI-session) cron liveness classification.
**Agent:** qa
**Started:** 2026-07-02T09:00Z

---

### STEP qa-S1 · qa · 2026-07-02T09:00Z
**task-id:** TASK-DASH-CRON-1
**what-done:** Reviewed commit 85267b62 (Zone-1 backend). RAW-ran all 5 new
test files (72/72 pass), tsc --noEmit (0 errors), eslint on new files (0
errors, confirms Fence-B claim), mock-guard (PASS), DDD/security greps
(clean). Cross-checked cronLivenessClassifier ladder against
runSchedulerWatchdog() — PARITY holds by construction (watchdog healthy =
ageMs<=cadenceMs*thresholdMultiplier == classifier ON_TIME+LATE union;
watchdog alert == classifier MISSED+STALE union). Judged the documented
architect-brief deviation (WATCHDOG_MANIFEST import moved from
application to interface via structural CadenceManifest type) as sound —
verified live via eslint, preserves brief's functional intent.
**what-considered:**
- Traced cronStatusHandler.ts's default `commandsDir` resolution
  (`resolve(process.cwd(), ".claude","commands","crons")`, line 102) against
  actual container runtime: apps/mcp-server/Dockerfile WORKDIR=/app (line 18),
  COPY list has no `.claude` (lines 51-63); docker-compose.yml mcp-server
  volumes (lines 11-27) mount docs/agent-memory, docs/data/orch, docs/signals,
  docs/analysis-briefs, reports, mcp.config.json at their project-root-relative
  paths — but NOT `.claude`. docker-compose.dev.yml override has no volumes
  block for mcp-server (inherits base, same gap). Confirmed via
  `grep -i claude docker-compose*.yml` (0 hits) and `docker compose config`
  (valid, no .claude anywhere).
- server.ts:2136 calls `handleGetCronStatus(req, res, db)` with NO
  commandsDirArg override — production always hits the broken default.
- Both new test files (cronStatusHandler.test.ts:31, layerBCronRegistry.test.ts:165)
  inject an explicit `LIVE_CRONS_DIR` computed relative to `bun test`'s cwd
  (apps/mcp-server) — this is why 72/72 pass locally but never exercises the
  zero-arg default branch server.ts actually calls in production.
**why-decision:** CHANGES_REQUESTED. `readdirSync('/app/.claude/commands/crons')`
will throw ENOENT in the rebuilt container; handleGetCronStatus's own
try/catch converts this into a permanent 503 `{error}` — GET /api/cron-status
will NEVER return 200 once the pending image swap ships, directly violating
AC-1 and transitively every Layer-A/B AC (DTO build aborts before any row is
emitted). This is a code-reachable, deterministic production defect, not a
test-suite gap — round 1, routed to fixer (not architect).
**why-change:** No change from plan for the reviewed application code itself
(all 5 new files + route registration are correct and well-tested); the gap
is an infra-provisioning omission (docker-compose.yml volume mount) that
none of BA/architect/dev's briefs anticipated.
