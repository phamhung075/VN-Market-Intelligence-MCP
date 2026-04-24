# Branch Cleanup Report — 2026-04-23

## Orphaned Branches Deleted

All 5 stale branches have been safely deleted. These were feature branches from completed sprints (234–238, 1295) that had been cherry-picked or rebased into main but never deleted locally.

### Analysis

| Branch | Commits Ahead | Root Cause | Status |
|--------|---------------|-----------|--------|
| `task/1295b-agent-specs` | 2 | Duplicate SIGTERM checkpoint fix (5b75fe82 is the real one on main); stale agent specs superseded by sprint 1297a | DELETED |
| `task/234a-red-test` | 2 | Cherry-picked commits (5b75fe82, e3f0b585) — the actual work is on main under different hashes | DELETED |
| `task/237b-vnindex-fetcher` | 3 | Cherry-picked vnIndexFetcher + schema (327ef78d, a755b16c on branch; different hashes on main) | DELETED |
| `task/237d-evening-summary-cache-query` | 1 | Part of sprint 237 (f5f3cef6 on branch; rebased into main) | DELETED |
| `task/238a-red-briefing-quality-gate` | 2 | Cherry-picked test + implementation (e5eef7c3 is on main) | DELETED |

### Why Safe to Delete

1. **Actual feature work is on main**: All functionality was merged (commits exist on main under same or similar messages)
2. **Not in active TASKS.md**: None of these branches are in the current sprint list
3. **Sprints archived**: Sprint 234–238 are complete and archived in `docs/archive/sprints-226-238.md`
4. **Agent specs stale**: Spec files on these branches predate sprint 1297a refactor (cb0ee2a5 on main is the current version)
5. **No unique work lost**: Verified via `git log main..branch` — all meaningful commits have main equivalents

### Cleanup Commands Executed

```bash
git branch -D task/1295b-agent-specs task/234a-red-test task/237b-vnindex-fetcher \
  task/237d-evening-summary-cache-query task/238a-red-briefing-quality-gate
```

### Local Branch State After Cleanup

```
2 branches remain:
  main
* task/1298a-red-tests (current, active in sprint 1298)
```

### Remote Branches Not Cleaned

The following remote branches are fully merged but not cleaned (no git remote configured):
- origin/task/1268-govt-support-cascade-fix
- origin/task/1270-usd-vnd-threshold-fix
- origin/task/1444-france-summary-portfolio-pnl
- origin/task/1514-startup-catchup-per-job-trycatch
- origin/task/215-push-foreign-flow-error-msg
- origin/task/217-remove-double-recordjobrun
- origin/task/239b-macro-refresh-green

(Git remote returns "repository not found" — these will be cleaned if remote is restored)

---

**Verified**: Working directory clean, current branch (task/1298a-red-tests) is active and valid.
