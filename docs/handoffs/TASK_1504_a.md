# Task Context — 1504_a: TDD RED — 11 failing assertions for cascade outcome tracking

## TLDR (read this first — complete for simple tasks)
change: src/__tests__/1504-cascade-outcome.test.ts — NEW: 11 failing assertions covering schema migrations, store functions, MCP tool
test: src/__tests__/1504-cascade-outcome.test.ts — 11 assertions, all must FAIL (RED phase)
branch: task/1504a-cascade-outcome-tdd-red
depends: none
knowledge_needed: [bundle-developer]

---

sprint: 191
branch: task/1504a-cascade-outcome-tdd-red
status: todo
req_ref: REQ-191
tech_ref: TECH-191

---

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1504-cascade-outcome.test.ts   # CREATE: 197 lines, 11 RED assertions using dynamic imports per-test

tests_written:
- src/__tests__/1504-cascade-outcome.test.ts   # 11 assertions: 10 FAIL (RED), AC-11 structural marker PASS

tests_skipped: []

tsc_clean: n/a (RED phase — cascadeOutcomeTools.ts not created yet)
full_suite_pass: false (RED phase by design)

notes: >
  Dynamic per-test imports used instead of static top-level imports so that
  missing exports surface as individual test failures rather than a single
  module-load error. initDatabase(db) called with explicit db arg — current
  schema.ts ignores the arg (async, no-param), causing cascade_rule_hits /
  market_messages to be empty in-memory. GREEN phase (1504b) must change
  initDatabase to accept an explicit db param and add the 8 new columns.

---

## [PM] Planning Context

layer: test
depends_on: none

files_to_read:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/docs/TECH_191.md   # full interface contracts + injection points
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/schema.ts   # understand existing schema structure
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/cascadeHitStore.ts   # current recordHit() signature
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/marketMessageStore.ts   # current structure, batchReviewMarketMessages pattern

files_to_create:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1504-cascade-outcome.test.ts   # CREATE: 11 RED assertions

files_to_modify: none

test_file: src/__tests__/1504-cascade-outcome.test.ts

acceptance_criteria:
- Given the test file is written with 11 assertions (AC-1 to AC-11)
- When `bun test src/__tests__/1504-cascade-outcome.test.ts` is run
- Then all 11 assertions FAIL (RED phase confirmed)

## Assertions to cover (AC-1 to AC-11)

AC-1: cascade_rule_hits has column `source_rag_id TEXT` after schema init
AC-2: cascade_rule_hits has column `price_impact_3d REAL` after schema init
AC-3: cascade_rule_hits has column `price_impact_7d REAL` after schema init
AC-4: cascade_rule_hits has column `outcome_correct INTEGER` after schema init
AC-5: cascade_rule_hits has column `confidence REAL` after schema init
AC-6: market_messages has column `impact_score REAL` after schema init
AC-7: market_messages has column `price_at_message REAL` after schema init
AC-8: market_messages has column `price_3d_after REAL` after schema init
AC-9: `updateOutcome()` returns true when updating existing cascade hit; columns persisted
AC-10: `updateImpact()` returns true when updating existing market message; columns persisted
AC-11: migrations are idempotent — running schema init twice does not throw
