# Task Report 1508 — compact
date: 2026-04-19
sprint: 193
outcome: APPROVED

changed:
- src/infrastructure/db/cascadeHitStore.ts (CascadeRuleMetric +evaluated/winRate; getHitMetricsWithAccuracy; getDeadRules delegates)
- src/interface/mcp/tools/cascadeMetricsTools.ts (import swap; formatCascadeMetrics WinRate col + accuracy summary; call swap)
- src/__tests__/1508-cascade-metrics-winrate.test.ts (NEW — 5 assertions; m! TS18048 fix in 1508b)

bun test (1508): 5 pass / 0 fail
bun test (full): 5713 pass / 2 fail / 21 skip
  - 2 pre-existing failures in 239-market-context.test.ts (unrelated to 1508; pre-date this sprint)
  - Bun v1.3.11 C++ panic at suite end: known Bun bug, not code issue
tsc: 0 errors
ddd: PASS (interface→infrastructure is established codebase pattern)
security: PASS (no process.env, all SQL parameterized)

notes:
- No branch: Dev committed feat(1508b) directly to main — workflow deviation, non-blocking (code clean, tests pass)
- TDD valid: 1508a created RED test file; 1508b GREEN impl + test fix committed together
- getHitMetrics() retained for compat; getDeadRules now delegates to getHitMetricsWithAccuracy
- Overall accuracy summary uses per-rule winRate back-calculation (avoids second DB query)

verdict: APPROVED
