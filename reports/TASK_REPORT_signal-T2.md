# Task Report: signal-T2 — Backfill Signals DB Migration
date: 2026-05-12
outcome: APPROVED

## Scope
`scripts/migrations/backfill-signals-db.ts` — scans `docs/signals/processed/*.json`,
INSERT OR IGNORE each row with recomputed fingerprint where missing. Logs scanned/inserted/skipped/errors.
Depends on signal-T1 (signals.db schema). Unblocks signal-T3.

## Files
- `scripts/migrations/backfill-signals-db.ts` (new)
- `scripts/migrations/__tests__/backfill-signals-T2.test.ts` (new)

## Test Results
- Unit (signal-T2): 10 passed / 0 failed (25 expect() calls)
  - Note: SyntaxError log line for bad.json is expected test behavior (error handling path)
- Carry-over (signal-T1): 7 passed / 0 failed (18 expect() calls)
- Full suite: 9406 passed / 0 failed
- TypeScript: 0 errors

## Idempotency Verification: PASS
Re-run on real processed/ directory:
- scanned: 57, inserted: 0, skipped: 57 (already in DB), errors: 0
- Confirmed idempotent via INSERT OR IGNORE + fingerprint dedup

## DDD Compliance: PASS
- Migration script lives in scripts/ (not domain layer)
- Uses Bun.env.DB_PATH for path resolution

## Security: PASS
- No hardcoded credentials
- No process.env
- File paths validated (no traversal)

## Merge Status
- Branch: task/signal-T2-backfill (merged + deleted)
- Merge SHA: cb232b26
- Merged to: main 2026-05-12
- signal-T3: UNBLOCKED
