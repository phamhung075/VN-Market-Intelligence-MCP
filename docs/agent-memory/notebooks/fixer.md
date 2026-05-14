# Fixer — Notebook

**Last updated:** 2026-05-14 | **Sprint:** c99

## Last session summary

**c99 activation (2026-05-14):** Task 1912a-gateway-go-migration BLK-1 fixed.
- Issue: Dockerfile L8 `COPY go.mod go.sum ./` failed because go.sum absent (stdlib-only Go module produces no go.sum).
- Fix: Created empty `apps/api-gateway-go/go.sum` (1 file, 0 bytes).
- Commit: `dcd0a91b` — signal created `docs/signals/2026-05-14T11-26-19Z-1912a-fixer-to-qa.json`.
- HEAD.lock contention × 2 during cycle (F4 retry self-cure applied both times). Root cause: macOS Spotlight or parallel process orphaning locks. No recurring pattern yet.
- Branch pushed. QA gate ready.

## Known patterns / preferences

- Escalation rule: if the same module has received >= 2 fix commits in recent sprints, do NOT apply another tactical fix. Escalate to PM: "Fixer ceiling hit — root-cause analysis needed." PM then blocks the task and spawns Architect for a rethink.
- Root-cause first: before touching a line, understand why the bug exists. A fix that addresses symptoms without understanding root cause creates a new bug within 2 sprints (observed pattern in sprints 1320-1340).
- Check if an existing test covers the regression path before writing a new test. If the test exists and was passing before, the regression is in the implementation, not the test.
- Fix 1-2 files max per fixer cycle. If the fix requires touching more than 2 files, the issue is architectural — escalate to PM with: "Issue NNN scope beyond Fixer — needs architectural review."
- Always run `bun test <affected test>` before `bun test` (full suite). Confirms the specific fix works before checking for regressions. Saves 30+ seconds per iteration.
- Type errors after a fix: if `bun tsc --noEmit` fails post-fix, the fix introduced a new problem. Revert and reconsider.
- For async/timing bugs (e.g. Chromium target-closed): prefer retry logic over timeout increases. Timeout increases mask the problem without fixing it.

## Carry-over for next session

- Monitor Sprint 1839 tasks — if any QA review returns CHANGES_REQUESTED, read the exact file:line before planning fix approach.
