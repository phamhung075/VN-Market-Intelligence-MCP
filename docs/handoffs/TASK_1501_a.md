# Task Context — 1501_a: RED kinhdich-market-hours

## TLDR
change: src/__tests__/1501-kinhdich-market-hours.test.ts — write failing tests only
test: src/__tests__/1501-kinhdich-market-hours.test.ts — 4 assertions
branch: task/1501-kinhdich-market-hours
depends: none

---

sprint: 189
branch: task/1501-kinhdich-market-hours
status: todo
req_ref: REQ-189
tech_ref: TECH-189

---

## [PM] Planning Context

layer: scheduler
depends_on: none

files_to_read:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/scheduler/intelligenceCycleJob.ts   # lines 669–681: existing step A4 else-block

files_to_create:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1501-kinhdich-market-hours.test.ts   # CREATE

files_to_modify: none (RED phase)

test_file: src/__tests__/1501-kinhdich-market-hours.test.ts

acceptance_criteria:
- Given VN time is Saturday 10:00 (off market hours — weekend)
  When step A4 kinhdich block runs
  Then hexagramsComputed=0 (skipped)
- Given VN time is Monday 08:00 (off market hours — before open)
  When step A4 runs
  Then hexagramsComputed=0 (skipped)
- Given VN time is Wednesday 11:00 (market hours)
  When step A4 runs
  Then hexagramsComputed > 0 (batch runs)
- Given same stock_code computed < 15 min ago (cooldown active)
  When defaultComputeHexagrams runs for that code
  Then stock skipped (skipped counter increments, storeReading not called)
- All assertions FAIL before prod code added (RED confirmed)

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1501-kinhdich-market-hours.test.ts   # CREATE: 4 RED test assertions

tests_written:
- src/__tests__/1501-kinhdich-market-hours.test.ts   # 4 tests (3 RED fail + 1 passes as regression guard)

RED failures confirmed:
- test 1: hexagramsComputed=2, expected 0 (Saturday, step A4 runs unconditionally)
- test 2: hexagramsComputed=1, expected 0 (Monday 08:00, before open)
- test 4: typeof resetHexagramCooldown = "undefined", expected "function"
- test 3: PASSES (regression guard — market-hours path still calls computeHexagramsFn)

tests_skipped: []

tsc_clean: true
full_suite_pass: n/a (RED phase — 3 intentional failures)
