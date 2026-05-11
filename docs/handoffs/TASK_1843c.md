---
sprint: 1843
branch: task/1843c-restore-docs-symlink
size: S
depends_on: []
blocks: []
---

## TLDR

Restore the missing symlink at `apps/mcp-server/docs` that causes the Phase 0 monorepo scaffold test to fail. This is a one-file fix (symlink creation) that will eliminate the 5th pre-existing `bun test` failure not covered by Sprint 1843's main scope.

## [PM] Planning Context

- **Acceptance Criteria:**
  - [ ] AC-SYMLINK-1: `apps/mcp-server/docs` exists as a symlink pointing to the project root `docs/` directory
  - [ ] AC-SYMLINK-2: `bun test` — "Phase 0 — Monorepo Scaffold > docs/ resolves from apps/mcp-server/ (symlink)" passes
  - [ ] AC-SYMLINK-3: No other tests regress
  - [ ] AC-SYMLINK-4: `tsc --noEmit` exits 0

- **Files to read first:**
  - `apps/mcp-server/src/__tests__/` — find the Phase 0 scaffold test file to understand what path it expects
  - Check if a symlink previously existed: `git log --all --full-history -- apps/mcp-server/docs`

- **Fix:**
  - Create symlink: `ln -s ../../docs apps/mcp-server/docs` (relative path from apps/mcp-server/ to project root docs/)
  - Verify the symlink resolves: `ls -la apps/mcp-server/docs`
  - Commit the symlink: `git add apps/mcp-server/docs && git commit`

- **Context:** ARCH_1843.md flagged this as RISK-6 (out of scope for sprint 1843 main deliverables). PM created this micro-task to address it as a parallel low-risk fix.

- **Dependencies:** none — can run in parallel with 1843a and 1843b
- **Knowledge needed:** `.claude/knowledge/dev-standards.md`
