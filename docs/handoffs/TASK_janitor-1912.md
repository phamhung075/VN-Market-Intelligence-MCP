# TASK_janitor-1912 — Git Index Cleanup (RF-1 + RF-2)

**Type:** CLEAN / JANITOR
**Size:** S
**Owner:** code-janitor
**Priority:** LOW
**Date:** 2026-05-15
**Source:** Architect post-merge review signal `20260514T182941Z-1912-go-migration-program-complete.json`

---

## Architect Section

### Brownfield scan (pre-design)

Current git index state (verified `git ls-files` on both paths):

- `git ls-files apps/stock-price/__tests__/` → **empty** (already removed from index)
- `git ls-files apps/alert-engine/server` → **empty** (already removed from index, covered by `.gitignore:19: apps/*/server`)

Both files are **not tracked** in the current index. The `git rm --cached` commands listed in the task brief are no-ops on the current HEAD.

What still exists on disk (untracked / gitignored):

- `apps/stock-price/__tests__/unit/resolve-price-service.test.ts` — Bun/TS test, untracked
- `apps/stock-price/__tests__/integration/fetch-price-usecase.test.ts` — Bun/TS test, untracked
- `apps/alert-engine/server` — compiled Go binary, gitignored via `.gitignore:19`

Go test suites (active, authoritative):

- `apps/stock-price/pkg/{domain,application,infrastructure,interface/http}/*_test.go` — 4 files, all `go test ./...`-runnable
- `apps/alert-engine/pkg/{domain,application,infrastructure,interface/http}/*_test.go` — 4 files, all `go test ./...`-runnable

No TS test registry exists for either service (both fully Go post-1912). No registry changes needed.

### Zone split confirmation

RF-1 (`apps/stock-price/__tests__/`) and RF-2 (`apps/alert-engine/server`) are **independent**:

- No shared files between the two zones.
- No DDD layer conflicts — both are disk artifacts, not source files.
- No cross-service imports or adapters involved.
- Can be executed as a single pass or two separate `rm` calls — no ordering constraint.

**DDD assessment:** Neither artifact participates in any domain/application/infrastructure/interface layer. They are dead disk objects with no runtime or compile-time effect.

### Risk flags

None. Both paths are already absent from the git index. This is a disk hygiene operation only.

---

## Task Scope

The actual work is **not** `git rm --cached` (index already clean). The work is:

1. Delete stale Bun/TS test files from disk:
   - `apps/stock-price/__tests__/unit/resolve-price-service.test.ts`
   - `apps/stock-price/__tests__/integration/fetch-price-usecase.test.ts`
   - Remove the now-empty `apps/stock-price/__tests__/` directory tree if no other files remain.
2. Delete the compiled binary from disk:
   - `apps/alert-engine/server`

These are `rm` operations, not `git rm --cached`.

---

## Acceptance Criteria

| # | Check | Command |
|---|-------|---------|
| AC-1 | `__tests__/` dirs absent from disk | `ls apps/stock-price/__tests__/` → No such file or directory |
| AC-2 | `server` binary absent from disk | `ls apps/alert-engine/server` → No such file or directory |
| AC-3 | Git index clean (already satisfied) | `git ls-files apps/stock-price/__tests__/` → empty; `git ls-files apps/alert-engine/server` → empty |
| AC-4 | Go tests pass in stock-price | `cd apps/stock-price && go test ./...` → ok |
| AC-5 | Go tests pass in alert-engine | `cd apps/alert-engine && go test ./...` → ok |
| AC-6 | No TS test registry changes | Confirm: no `agentBootstrap.ts`, `registry.ts`, or agent `.md` edits in commit |

---

## Commit spec

Single commit. Zone: `apps/stock-price/` + `apps/alert-engine/`.

Message pattern:
```
chore(janitor-1912): remove stale TS test files + server binary from disk
```

No doc updates required (tree-map has no pointers to `__tests__/*.ts` files or compiled binaries).

---

## Code-Janitor Section

**EXECUTION COMPLETE 2026-05-15 05:47 UTC**

### Work completed

RF-1: Deleted `apps/stock-price/__tests__/unit/resolve-price-service.test.ts` and `apps/stock-price/__tests__/integration/fetch-price-usecase.test.ts` from disk. Empty `__tests__/` directory tree removed.

RF-2: Deleted `apps/alert-engine/server` (compiled Go binary) from disk.

### Acceptance criteria verified

| AC | Status | Evidence |
|---|---|---|
| AC-1 | PASS | `ls apps/stock-price/__tests__/` → No such file or directory |
| AC-2 | PASS | `ls apps/alert-engine/server` → No such file or directory |
| AC-3 | PASS | Git index clean — both paths absent from `git ls-files` |
| AC-4 | PASS | `cd apps/stock-price && go test ./...` → all packages ok (domain/application/infrastructure/interface/http) |
| AC-5 | PASS | `cd apps/alert-engine && go test ./...` → all packages ok (domain/application/infrastructure/interface/http) |
| AC-6 | PASS | No test registry, agent .md, or agentBootstrap edits in commit |

### Commit

Commit `d637ad1b` on main.

Message:
```
chore(janitor-1912): remove stale TS test files + server binary from disk

- Remove apps/stock-price/__tests__/{unit,integration}/*.test.ts (Bun/TS artifacts, superseded by Go tests)
- Remove apps/alert-engine/server (compiled Go binary)
- Verify Go test suites PASS in both services
- Git index already clean (no-op git rm --cached)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Commit includes two file deletions (both staged via `git rm`):
- `apps/stock-price/__tests__/integration/fetch-price-usecase.test.ts`
- `apps/stock-price/__tests__/unit/resolve-price-service.test.ts`

The compiled binary `apps/alert-engine/server` was already gitignored (not in index) and removed from disk only.

### Handoff notes

- Both RF-1 and RF-2 confirmed independent (no shared dependencies, no DDD layer conflicts).
- No docs require updates (tree-map has no pointers to `__tests__/*.ts` or compiled binaries).
- Ready to close task and return to backlog.

---

## PM Section

**Dispatch:** 2026-05-15 c114 (WIP=1/2, at capacity after 1914-news-scout-dedup-api).

**Blocker status:** NONE. Git index already clean (no-op `git rm --cached`). Actual work is disk hygiene only. No code conflicts, no parallel zone overlap, independent cleanup.

**WIP justification:** 1914 dispatched c113 (dev-mcp-server, MEDIUM). Janitor-1912 executes in parallel zone (code-janitor owns disk cleanup, unblocked). WIP capacity allows 2 In Progress; janitor-1912 is single-pass, expected completion ~15min, low context overhead.

**Sequencing:** No downstream dependencies. Can ship immediately after developer completes the two `rm` operations + verifies both go test suites PASS.

**Zone routing:** RF-1 (`apps/stock-price/`) + RF-2 (`apps/alert-engine/`) → developer (code-janitor) via standard flow.

**Carry notes:** Both architect-reviewed zones confirmed independent (per TASK_janitor-1912.md Architect Section). WIP bump to 2/2 acceptable; janitor closes cycle immediately post-exec, returning WIP to 1/2 for 1914 solo carry-forward.
