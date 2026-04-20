# Task Report 1501 — compact
date: 2026-04-19
outcome: APPROVED

changed:
- src/scheduler/intelligenceCycleJob.ts — step A4 gated on marketHours; cooldown map + resetHexagramCooldown export
- src/__tests__/311-cycle-hexagram-batch.test.ts — off-hours assertion: hexagramsComputed 2→0, hexFnCalledWithCodes ["VNM","VCB"]→[]

bun test (1501 task file): 4 pass / 0 fail
bun test (311 regression): 9 pass / 0 fail
bun test (full suite): 5651 pass / 4 fail (all 4 pre-existing on main before branch: tasks 239, 217)
tsc: 0 errors
ddd: PASS
security: PASS

## Blocking
none

## Non-blocking
- Bun post-run crash (OOM/C++ exception) observed — known Bun 1.3.11 bug, unrelated to task code

verdict: APPROVED
merge_commit: 0b713b2
branch deleted: local + remote
