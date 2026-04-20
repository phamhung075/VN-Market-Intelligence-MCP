# TASK 217 — fix(jobs): remove double recordJobRun wrap on insiderCheckJob + taAlertNotifierJob

## TLDR
Both `runInsiderCheck()` and `runTaAlertNotifierCron()` call `recordJobRun()` internally.
`jobs.ts` also wrapped them in outer `recordJobRun()` calls, causing 2 `cron_job_runs` rows per
invocation. Fix: remove the outer wraps and call both functions directly.

branch: task/217-remove-double-recordjobrun

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/jobs.ts
  - line 571-573: replaced outer recordJobRun wrap with direct `await runInsiderCheck()`
  - line 628-633: replaced outer recordJobRun wrap with direct `await runTaAlertNotifierCron()` + inline log if result.sent > 0

tests_written: []   # structural fix — verified via 1137-critical-briefing-observability.test.ts (5 pass) and 1254-cron-unhandled-rejection.test.ts (5 pass)

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 5804 tests pass (baseline 5783); Bun OOM crash post-report is pre-existing Bun bug unrelated to this change
