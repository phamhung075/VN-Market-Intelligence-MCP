# Task Report 1311a — compact
date: 2026-04-24
changed:
  - src/infrastructure/db/schema-news.ts:149-162 (ALTER TABLE migration block)
  - src/__tests__/1311a-schema-migration.test.ts (6 new assertions)

bun test (targeted): 6 pass / 0 fail
bun test (full):     6648 pass / 1 fail (pre-existing Task 1050, unrelated)
tsc: 0 errors
ddd: PASS (schema-news.ts = infrastructure layer, no cross-layer imports)
security: PASS (no process.env, no any casts, no SQL string interpolation)

note: Full suite count 6648 > expected 6639 — delta from other tests added in parallel.
      6 new 1311a tests confirmed pass in targeted run.
      Pre-existing fail: "Issue 2 — price_surge deterministic dedup ID (Task 1050)" — present before this branch.

verdict: APPROVED
