# Task Report: 1422/1423 — Morning Briefing BCTC Upcoming Deadlines
date: 2026-04-18
outcome: APPROVED

## Test Results

| Scope | Pass | Fail |
|---|---|---|
| 1422-morning-briefing-bctc-deadlines.test.ts | 5 | 0 |
| Full suite (bun test) | 5384 | 0 |
| TypeScript (bun tsc --noEmit) | — | 0 errors |

## Verification Checklist

| Check | Result |
|---|---|
| AC-1: SAP_DEN row for VNM, daysUntilDeadline=12, deadline=2026-04-30 | PASS |
| AC-2: QUA_HAN row for HPG (nowFn=2026-05-05), daysUntilDeadline=-5 | PASS |
| AC-3: DA_NOP stock excluded from upcomingDeadlines | PASS |
| AC-4: formatBriefingMessage contains "BCTC sắp đến:", VNM, "12 ngày", "2026-04-30" | PASS |
| AC-5: Section omitted when upcomingDeadlines=[] | PASS |
| DailyBriefing.upcomingDeadlines field exists | PASS (line 222 assembleBriefing.ts) |
| assembleBriefing.ts Step 18 block | PASS (line 1004) |
| morningBriefingJob.ts BCTC section | PASS (line 175-196) |
| Banking stocks excluded: domain="banking" -> deadline=May-14 -> daysUntil=26 > 14 -> UOC_TINH | PASS (earningsCalendar.ts SAP_DEN_WINDOW_DAYS=14, EXTENDED_DEADLINE_DOMAINS has "banking") |

## DDD Compliance: PASS

- assembleBriefing.ts (application) imports earningsCalendar.ts (domain) — correct direction
- morningBriefingJob.ts (scheduler) imports assembleBriefing.ts (application) — correct direction
- No domain/ file imports infrastructure/ or application/

## Security: PASS

- All SQL uses parameterized queries (db.prepare with typed params)
- No hardcoded credentials
- No process.env usage

## Issues Found

### Blocking
none

### Non-Blocking
- Bun v1.3.11 crashes (C++ exception) after full suite teardown — pre-existing Bun bug, unrelated to this task. All 5384 tests pass before crash.

## Merge Status

merged: 7a5eeec (merge(1422/1423): morning briefing BCTC upcoming deadlines section)
branch deleted: task/1422-morning-briefing-bctc-deadlines (local + remote)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking:
- Bun v1.3.11 post-suite C++ crash at teardown — known upstream bug, not task-related

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1422-morning-briefing-bctc-deadlines.test.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/application/usecases/assembleBriefing.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/morningBriefingJob.ts

merge_commit: 7a5eeec
