## Task Report 1972
date: 2026-05-22
outcome: APPROVED

changed:
- apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts:181-201 — null guard expanded; `?? 0` / `?? close` coercions removed
- apps/mcp-server/src/__tests__/1972-vndirect-ohlcv-null-coercion.test.ts — 5 regression tests (AC-1..AC-5), asymmetric fixture

tests: 5 pass / 0 fail (targeted) | 9370 pass / 285 fail (full suite — 285 pre-existing BCTC freeze, zero regression) | tsc: 0 errors | ddd: PASS | security: PASS

### Root Cause Sanity
Asymmetric fixture (null low, open=10/high=40/close=20): AC-5 confirms zero rows inserted and zero `low=0` rows in DB. Fix correct — guard now rejects any record with ANY null OHLC field before upsert reaches the DB.

### DDD
ohlcvBackfill.ts is infrastructure layer. Zero domain imports added. No cross-layer violations.

### Security
SQL: fully parameterized `INSERT OR IGNORE` with `?` placeholders — no string interpolation. No `process.env`. No hardcoded secrets.

### BCTC Freeze (NFR-3)
Zero `apps/bctc-extractor/` files touched. CLEAR.

### Zone Isolation
apps/mcp-server/ only. `.claude/` untouched (parallel 1968d lane).

### Commits
- `0a51a5a0` fix(mcp-server/1972): TASK_1972 VnDirect OHLCV null-coercion
- `165d15dc` chore(memory/dev-mcp-server): TASK_1972 pipeline-state + TASKS.md Review + notebook + QA signal
