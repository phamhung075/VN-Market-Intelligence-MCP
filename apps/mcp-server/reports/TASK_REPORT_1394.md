# Task Report: 1394 — Fix alert digest count mismatch (73 vs 98)
date: 2026-04-28
outcome: APPROVED

## Test Results
- Targeted tests: 9 pass / 0 fail (4 new in 1394-alert-digest-count.test.ts + 5 in 1394-alert-digest-diacritics.test.ts)
- Full suite: 7542 pass / 120 fail / 21 skip — matches developer baseline, no regression
- TypeScript: pre-existing errors in 1348a (unrelated); zero errors in 1394 files

## DDD Compliance: PASS
Domain files contain only comments referencing infrastructure — no actual imports from infrastructure layer in src/domain/.

## Security: PASS
- No process.env in changed files (Bun.env only)
- No hardcoded credentials
- SQL fix removes parameterized `?` placeholder (no longer needed — query uses unixepoch() intrinsic, no user input)

## Fix Summary
assembleAlertDigest.ts replaced ISO-string cutoff (`toISOString()`) compared via SQLite string comparison with a format-agnostic `unixepoch(triggered_at) >= unixepoch('now') - 86400` predicate. The old approach failed because SQLite datetime('now') stores `"YYYY-MM-DD HH:MM:SS"` (space separator) while JS produces `"YYYY-MM-DDTHH:MM:SS.mmmZ"` (T separator); `' ' < 'T'` caused all SQLite-format alerts to be excluded from the 24h window.

## Issues Found
### Blocking
None.
### Non-Blocking
Pre-existing TSC errors in src/__tests__/1348a-cascade-brokerage-competitive.test.ts (AnalysisLevel / DomainType type mismatch) — not introduced by this task.

## Merge Status
Merged to main via merge commit d9fae481. Branch worktree-agent-af2edd7b deleted. Worktree already pruned.
