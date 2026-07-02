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

### STEP qa-S2 · qa · 2026-07-02T08:42:34Z
**task-id:** TASK-DASH-CRON-1
**what-done:** Delta-reviewed fixer round-1 commit 126a94d2 (4 files). Verified
docker-compose.yml mount matches Dockerfile WORKDIR/CMD, `docker compose
config` valid (base + dev-override merge), 18/18 tests pass, tsc 0 errors,
no scope creep (git show --stat).
**what-considered:**
- Prod fix (compose mount): CORRECT — round-1 blocker resolved.
- New REGRESSION test (L359): passes explicit `nonExistentDir` as 5th arg,
  short-circuiting `commandsDirArg ?? resolve(process.cwd(),...)` — never
  exercises the real zero-arg default, same defect class restated verbatim
  in round-1 fix_scope, unaddressed.
**why-decision:** CHANGES_REQUESTED (round 2) — test claims "zero-arg" in
its title but injects an explicit path; provides false regression coverage.
**why-change:** Prod defect fixed as planned; test-coverage gap is new
finding, narrower scope than round 1 (1-line test edit, not infra).

### STEP qa-S3 · qa · 2026-07-02T10:55Z
**task-id:** TASK-DASH-CRON-1
**what-done:** Delta-reviewed fixer round-2 commit a1689b0e (3 files:
cronStatusHandler.test.ts, orch-state.json, handoff). Read
cronStatusHandler.ts:94-113 — confirmed line 102
`commandsDirArg ?? resolve(process.cwd(), ".claude","commands","crons")`.
Read rewritten REGRESSION test (lines 341-376): calls
`handleGetCronStatus(mockReq, res, db, new Date())` with **no 5th arg**
(so `commandsDirArg` is `undefined`, `??` falls through to
`resolve(process.cwd(),...)`), stubs `process.cwd()` to `/fixture` via
`spyOn`, resets the `layerBCronRegistry` module-level memoization cache
first (`_resetLayerBCronCacheForTests()` — confirmed `readdirSync` /
`_cachedRows` in layerBCronRegistry.ts:104,140-152, so the cache-reset is
necessary for the stub to actually re-trigger `readdirSync`), restores the
stub in `finally`. Ran `bun tsc --noEmit` (0 errors) and
`bun test src/__tests__/cronStatusHandler.test.ts` (18/18 pass, incl.
rewritten REGRESSION test). Sanity inversion: confirmed `/fixture` does not
exist on the filesystem (guarantees ENOENT) and that the real
`.claude/commands/crons` (14 files) would make `readdirSync` succeed —
proves the test's pass/fail is genuinely coupled to the stubbed path's
existence, not vacuous.
**what-considered:** Smart-Skip — change is test-only (production
cronStatusHandler.ts untouched this round), so DDD/security greps and
mock-guard skipped per flow's Smart-Skip rule; ran unit+regression+tsc only.
**why-decision:** APPROVED (round 3). Zero-arg default branch is now
genuinely exercised — no bypass remains; the same test would fail (200
instead of 503, no ENOENT) if the stubbed cwd resolved to a real crons dir,
confirming load-bearing coverage.
**why-change:** No change from plan — only path was fixer's round-2 diff
addressing the exact round-2 blocking issue verbatim; all checks green.

### STEP qa-S4 · qa · 2026-07-02T09:36Z
**task-id:** TASK-DASH-CRON-2
**what-done:** RAW-gated commit b563c0d2 (Zone-2 frontend, round 1). Ran named
test 41/41 PASS, full vitest 2047 pass/2 fail (both pre-existing QUE-TOOLTIP,
confirmed exact match to dev's claim), tsc 0 errors, mock-guard exit 0, DDD
grep clean. Playwright RAW-ran on a genuinely fresh PLAYWRIGHT_PORT=3012
server (independent of dev's own run) — 4/4 PASS. Independently spun a 3rd
throwaway dev server (port 3013, killed after) and curl'd
/dashboard/orchestration live: HTTP 200, all 4 VN section/labels present,
both layers show "Không có dữ liệu." (empty-shape degrade, /api/cron-status
404 confirmed live), honest error banner rendered, /api/orchestration
independently confirmed 200 (AC-23 no regression), zero error strings.
**what-considered:**
- Code-read confirmed CronRecheckTable sits AFTER the state?(...):(...) block
  closes (line 1318, outside line 1284-1316) — AC-16/AC-25 hold by
  construction, not just by claim.
- normalizeCronStatusB unconditionally returns SESSION_SCOPED regardless of
  _raw — AC-14/NFR-7 holds even under adversarial upstream, verified in
  source + 6 dedicated tests.
- dataAsof={cronStatus.fetched_at || null} (not ?? null) correctly converts
  the empty-shape DTO's fetched_at:"" to null before FreshnessBadge, avoiding
  an Invalid Date edge case ?? null would have missed.
- coverage-map rows/LIVE counts (50/40) independently recomputed via
  python3/json against the live file, not trusted from the diff header.
**why-decision:** APPROVED (round 1). Every claim in the handoff was
independently reproduced from a clean state rather than relayed — all green,
no blocking issues found.
**why-change:** No change from plan — only path was the single dev-frontend
diff addressing every listed AC; nothing to route to fixer/architect.
