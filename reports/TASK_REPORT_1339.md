# Task Report: 1339+1340 — Fix alert delivery: include medium severity in readUnnotifiedAlerts
date: 2026-04-16
outcome: APPROVED

## Tasks
| ID | Title |
|----|-------|
| 1339 | test(alert-delivery): TDD test 1339-alert-delivery-medium.test.ts |
| 1340 | fix(alert-delivery): add medium to readUnnotifiedAlerts severity IN list |

## Root Cause
`readUnnotifiedAlerts` in `src/infrastructure/db/alertStore.ts` filtered `WHERE severity IN ('high', 'critical')`, silently dropping all `medium`-severity alerts before Telegram delivery. FPT/MSN/VIC `price_surge` alerts at `medium` never reached the user.

## Fix
Line 166 of `alertStore.ts`: `IN ('high', 'critical')` → `IN ('high', 'critical', 'medium')`.

## Test Results
| Suite | Pass | Fail |
|-------|------|------|
| 1339-alert-delivery-medium.test.ts (4 TCs) | 4 | 0 |
| Full regression (excl. LanceDB crash test) | 4915 | 0 |
| TypeScript strict | 0 errors | — |

### Test Cases
| TC | Description | Result |
|----|-------------|--------|
| TC-1 | medium price_surge returned | PASS |
| TC-2 | medium news_mention returned | PASS |
| TC-3 | low severity NOT returned | PASS |
| TC-4 | medium already notified NOT returned | PASS |

### Pre-existing failure note
`1332-pollnews-source-display-name.test.ts` triggers a Bun v1.3.11 native C++ crash (exit 132) in the LanceDB binary — pre-existing on main, unrelated to this change. Confirmed by running the same test from main stash: identical crash.

## DDD Compliance: PASS
No imports from `infrastructure/` in `src/domain/`. Comments referencing infra paths do not constitute import violations.

## Security: PASS
- All SQL uses parameterized queries — change is IN-clause literal only, no user input interpolation.
- `Bun.env` used; zero `process.env` in production code.

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Merged `task/1339-1340-alert-delivery-medium` → `main` via `--no-ff`.
Branch deleted local + remote. Worktree `.claude/worktrees/agent-aa81af20` removed.
Server restarted via `launchctl kickstart`. Health: OK (98 tools).
TASKS.md: sprint 112 Complete. project-stats.json: sprint 113, totalTasksDone 295.
