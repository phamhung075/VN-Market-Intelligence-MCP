# Task Report: 1822f — Fix FAKE_DIFF set-but-empty detection in maybe-deploy-vps.sh
date: 2026-05-02
outcome: APPROVED

## Test Results
- Unit tests: 7 passed / 0 failed
- Full suite: not run (script-only change, no TypeScript)
- TypeScript: N/A (bash script)

## DDD Compliance: PASS
Shell script change — no domain/infrastructure layer concern.

## Security: PASS
No credentials, no hardcoded secrets, no SQL, no process.env.

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Summary
Developer replaced `[ -n "${FAKE_DIFF:-}" ]` with `[ "${FAKE_DIFF+x}" = "x" ]` in
`scripts/maybe-deploy-vps.sh`. The old idiom treated FAKE_DIFF="" (set-but-empty)
as unset, causing test TC-6 to call real `git diff` instead of using the empty-string
sentinel. The new idiom uses POSIX parameter expansion `${var+x}` which returns "x"
only when the variable is set (regardless of value), correctly distinguishing
set-but-empty from unset.

## Merge Status
Merged via --no-ff on 2026-05-02. Branch task/1822f-fix-deploy-fake-diff deleted.
