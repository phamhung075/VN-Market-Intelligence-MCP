# TASK 1955a — dailyDashboardJob projectRoot() path fix

**Owner:** dev-mcp-server
**Priority:** HIGH (cron has been failing daily since ≥2026-05-09)
**Zone:** `apps/mcp-server/`
**Estimate:** 30 min (one-line fix + tests + tsc + commit)
**Size:** XS

---

## Problem

`apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts:455-457`:

```ts
function projectRoot(): string {
  return path.resolve(import.meta.dir, "../../../../../..");
}
```

Six `..` segments. From `/app/src/scheduler/system/dailyDashboardJob.ts` (3 levels deep inside `/app`), six `..` walks past root → resolves to `/`. Then `path.join("/", "docs/data/project-stats.json")` = `/docs/data/project-stats.json`, which does not exist (file lives at `/app/docs/data/project-stats.json`).

Observed: `cron_job_runs` shows `dailyDashboardJob` status=`error` every daily 16:30 UTC tick from 2026-05-09 through 2026-05-17 (latest captured). System-auditor 2026-05-19 Tier-1 flagged: 0/3 success, ENOENT `/docs/data/project-stats.json`.

## Fix

Reduce `..` segment count so the resolved path matches the container working dir (`/app`).

**Option A (preferred — minimal diff):**
```ts
function projectRoot(): string {
  // src/scheduler/system/dailyDashboardJob.ts  →  3 ".." reach /app
  return path.resolve(import.meta.dir, "../../..");
}
```

**Option B (defensive — survives moves):**
```ts
function projectRoot(): string {
  // Anchored on container WORKDIR (/app in production, repo root in dev)
  return process.cwd();
}
```

Pick whichever matches the project's existing convention. If other scheduler files use `import.meta.dir` traversal, match their count after re-counting. The directory layout is:
- Source: `apps/mcp-server/src/scheduler/system/dailyDashboardJob.ts`
- Container compiled location: `/app/src/scheduler/system/dailyDashboardJob.ts`
- Container WORKDIR: `/app`
- Target file: `/app/docs/data/project-stats.json`

## Acceptance Criteria

1. `loadProjectStats()` resolves to `/app/docs/data/project-stats.json` inside container (verify with `bun -e` print of `projectRoot()` after change).
2. `runDailyDashboardJob()` exits with `written: true` and no ENOENT.
3. Existing tests pass; tsc 0 errors.
4. Next 16:30 UTC cron tick (2026-05-19T16:30Z already missed → 2026-05-20T16:30Z) writes `status=success` row to `cron_job_runs`.

## Out of scope

- Do NOT touch `loadSessionFiles()` / `loadTasksMd()` / `writeDashboard()` — they use the same `projectRoot()` so they will be fixed by the same change. Just verify they still find their files inside container (`/app/docs/agent-memory/sessions/`, `/app/docs/TASKS.md`, `/app/docs/data/daily-dashboard.json`).
- Do NOT add fallback `try/catch` around `loadProjectStats()` — fail-loud is correct; the path was wrong, not the absence-handling.

## Verification

```bash
# Inside container after deploy
docker exec vn-market-intelligence-mcp-mcp-server-1 bun -e \
  "const j = await import('/app/src/scheduler/system/dailyDashboardJob.ts'); \
   const r = await j.runDailyDashboardJob('2026-05-19'); console.log(r);"
# Expect: { date: '2026-05-19', sessionCount: ..., tasksDone: ..., written: true }
```

Then watch `cron_job_runs` next 16:30 UTC tick.

## Commit convention

```
fix(1955a/mcp-server): dailyDashboardJob projectRoot() resolves to /app
```

Signal back: `docs/signals/dev-mcp-server-1955a-impl-done.json`
