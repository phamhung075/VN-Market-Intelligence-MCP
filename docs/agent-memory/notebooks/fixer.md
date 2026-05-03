# Fixer — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1839b

## Last session summary

No fixer activations this sprint (1839b). All QA reviews resulted in APPROVED on first pass.

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
