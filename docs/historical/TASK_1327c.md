# TASK 1327c — Merge Gate Execution: feature/ddd-phase-0 → main

**Sprint:** 1327
**Task ID:** 1327-merge
**Owner:** Developer
**DDD Layer:** infrastructure (monorepo scaffold)
**Estimated:** 30 min
**Branch:** execute on `main` (merge from `feature/ddd-phase-0`)
**Depends on:** 1327a GREEN + 1327b GREEN (both must pass before this runs)
**Blocks:** 1327-docker (ops, post-merge)

---

## Pre-Condition Checklist

Before running any merge command, verify all hard gates are GREEN:

| Gate | Command | Pass Condition |
|------|---------|----------------|
| G-1: tsc clean | `cd apps/mcp-server && bun tsc --noEmit` | Exit 0, 0 errors |
| G-2: fail count | `cd apps/mcp-server && bun test 2>&1 \| grep "(fail)" \| wc -l` | Prints `15` (not more) |
| G-3: scaffold gate | `cd apps/mcp-server && bun test src/__tests__/phase0-monorepo-scaffold.test.ts` | All 17 GREEN |
| G-4: docker-compose.yml | `grep "mcp-server:" docker-compose.yml` | String found |
| G-5: pnpm-workspace.yaml | `grep "apps/\*" pnpm-workspace.yaml` | String found |
| G-6: shared packages | `ls packages/shared-types/index.ts packages/shared-db/index.ts packages/shared-config/index.ts` | All 3 exist |
| G-7: Bun crash confirmed | Check: does `bun test` end with `panic(main thread)`? | Yes = Bun 1.3.11 bug, not a code bug. Document in commit. |

**STOP if G-1 or G-2 fail.** G-7 is informational (document, do not block).

Note on G-2: `bun test` exit code is non-zero due to the Bun 1.3.11 post-test panic. Do NOT check exit code. Count `(fail)` lines in stdout only.

---

## Merge Procedure

Run these commands exactly, in order:

```bash
# 1. Ensure main is clean
git checkout main
git status    # must show no uncommitted changes

# 2. Merge with --no-ff (preserves branch history)
git merge --no-ff feature/ddd-phase-0 -m "feat(ddd-phase-0): monorepo scaffold — apps/mcp-server + packages/

- Move src/ → apps/mcp-server/src/ (pnpm workspace)
- Add packages/shared-types, shared-db, shared-config
- docker-compose.yml updated for monorepo build context
- All 6796 previously passing tests still pass (15 pre-existing failures unchanged)
- Bun 1.3.11 post-test panic: known C++ exception bug (not a code bug)
  Crash report: https://bun.report/1.3.11/mt1af24e28in
  Workaround: check (fail) count in stdout, not exit code
- Test command: cd apps/mcp-server && bun test (NOT bun test from repo root)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

# 3. Post-merge verification
cd apps/mcp-server && bun tsc --noEmit
cd apps/mcp-server && bun test 2>&1 | grep "(fail)" | wc -l   # must print 15

# 4. Delete merged branch
git branch -d feature/ddd-phase-0
```

---

## Post-Merge Verification Gates

After merge completes:

**G-1 recheck:**
```bash
cd apps/mcp-server && bun tsc --noEmit
```
Expected: exit 0, zero error lines.

**G-2 recheck:**
```bash
cd apps/mcp-server && bun test 2>&1 | grep "(fail)" | wc -l
```
Expected output: `15`

If output > 15: the merge introduced a regression. **Do not push.** Diagnose and fix before continuing.

**Scaffold gate:**
```bash
cd apps/mcp-server && bun test src/__tests__/phase0-monorepo-scaffold.test.ts 2>&1 | grep -E "(pass|fail)"
```
Expected: 17 pass, 0 fail.

---

## Deferred Failures Reference (do NOT fix in this task)

The 15 acceptable failures post-merge:

| Count | Category | Test Files | Sprint Target |
|-------|----------|-----------|---------------|
| 4 | BCTC OCR | 293-ocr-fallback-pipeline.test.ts, 1294b-bctc-fallback.test.ts | 1328 |
| 2 | SSC pipeline null | 048-ssc-pipeline.test.ts, 124-test-ssc-pipeline.test.ts | 1328 |
| 1 | Watchdog recovery | 1567-watchdog-user-alert-error-logging.test.ts:43 | 1328 |
| 1 | Price pipeline AC-4 | 240-price-pipeline-recovery.test.ts:155 | 1328 |

If any of these additional categories start failing (watchdog, price, OCR count increases), stop and investigate before merging.

---

## Bun Crash Documentation

The test suite ends with:
```
panic(main thread): A C++ exception occurred
```
after all pass/fail counts are printed. This is **Bun 1.3.11 bug** (memory: RSS ~0.98GB, Peak ~2.31GB at test-suite teardown). It does not affect any test result. The panic fires after the test runner has already written all pass/fail output.

Bug report URL (captured 2026-04-25): `https://bun.report/1.3.11/mt1af24e28in`

Document in merge commit (done above). No code change needed. Track in `1327-bun-crash` task.

---

## Edge Cases and Pitfalls

**pnpm workspace test command:** Always run `cd apps/mcp-server && bun test`. Running `bun test` from the monorepo root will silently find no tests (no `bunfig.toml` at root). This is expected.

**Symlinks in Docker:** Symlinks in `apps/mcp-server/` (e.g. `mcp.config.json`, `docs/`) point to monorepo root files. These do not resolve inside Docker build context. `apps/mcp-server/Dockerfile` uses explicit `COPY` for these. Do not rely on symlinks in Dockerfile — any new root files referenced by tests must be added to the Dockerfile explicitly.

**Original `src/` at root:** Post-merge, both `src/` (root, legacy) and `apps/mcp-server/src/` exist. Any path-sensitive tooling must target `apps/mcp-server/src/`. Root `src/` deletion is Phase 1 cleanup — do not delete in this task.

**graphify graph:** If graph rebuilding is triggered, set target path to `apps/mcp-server/src/`, not root `src/`.

---

## Acceptance Criteria

- [ ] `git log --oneline -1` shows the merge commit on `main`
- [ ] `bun tsc --noEmit` from `apps/mcp-server/` exits 0
- [ ] `bun test 2>&1 | grep "(fail)" | wc -l` prints `15` from `apps/mcp-server/`
- [ ] `feature/ddd-phase-0` branch deleted locally
- [ ] Merge commit message includes Bun crash URL and test-command note
