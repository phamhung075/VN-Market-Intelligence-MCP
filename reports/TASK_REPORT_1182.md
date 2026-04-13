# Task Report: 1182 — storeReport error propagation + WAL checkpoint in parseBctcReport.ts
date: 2026-04-13
outcome: PASS

## Test Results
- Unit tests (1181-financial-reports-persist.test.ts): 1 passed / 0 failed
- BCTC regression (047, 002, 121, 240): 74 passed / 0 failed
- TypeScript: 0 errors (bun tsc --noEmit clean)

## DDD Compliance: PASS
logger import is application → infrastructure (permitted by DDD layering rules).
No domain/ file imports infrastructure/.

## Security: FAIL

### Blocking Issue — process.env usage

File: `src/application/usecases/parseBctcReport.ts`, line 456

```ts
const dbPath = process.env["DB_PATH"] ?? Bun.env["DB_PATH"] ?? "";
```

CLAUDE.md (Critical Rules, Security): "`Bun.env` only — never `process.env`".
The QA checklist (Security section): "All MCP tool inputs validated with Zod schemas. `Bun.env` only — never `process.env`."

The `process.env["DB_PATH"]` on the left side of the `??` chain violates this invariant.
The correct expression is:

```ts
const dbPath = Bun.env["DB_PATH"] ?? "";
```

## Acceptance Criteria Verification

1. storeReport wrapped in try/catch re-throwing with "storeReport failed:" label — PASS
   Lines 446-452: try { storeReport(...) } catch (err) { throw new Error(`storeReport failed: ...`) }

2. PRAGMA wal_checkpoint(PASSIVE) runs after successful store with :memory: guard — PASS
   Lines 457-466: guard on dbPath !== ":memory:", db.exec("PRAGMA wal_checkpoint(PASSIVE)") inside try/catch (non-fatal).

3. logger import is application → infrastructure (permitted) — PASS
   Line 30: `import { logger } from "../../infrastructure/logger.js";` — application layer importing infrastructure is allowed.

## Issues Found

### Blocking
- **process.env usage on line 456**: `process.env["DB_PATH"]` must be removed. Replace the full expression with `Bun.env["DB_PATH"] ?? ""`. This is a one-line fix.

### Non-Blocking
- None.

## Merge Status
BLOCKED — fix the process.env violation, then resubmit for QA.

---

### Re-Review — 2026-04-13 (post-fix)

**QA outcome: PASS**

Re-verification after Fixer applied the `process.env` correction:

- `src/application/usecases/parseBctcReport.ts` line 456: `Bun.env["DB_PATH"] ?? ""` — confirmed.
- Security scan (`grep -rn "process.env" src/` excluding `__tests__/`): 0 hits in production source.
- `bun test src/__tests__/1181-financial-reports-persist.test.ts`: 1 pass / 0 fail / 3 expect() calls.
- Smoke regression (7 test files, 92 tests): 92 pass / 0 fail.
- `bun tsc --noEmit`: 0 errors.
- DDD compliance: no domain/ → infrastructure/ runtime import in changed files.
- Merged: `git merge --no-ff task/1182-bctc-pipeline-fix` into main.
- Branch deleted: local + remote.

---

### Fix — 2026-04-13
- **Issue**: Blocking — process.env usage on line 456 (Issue 1182-01)
- **Root cause**: `process.env["DB_PATH"]` was used as the first fallback before `Bun.env["DB_PATH"]`, violating the project invariant that only `Bun.env` is permitted.
- **Fix**: Replaced `process.env["DB_PATH"] ?? Bun.env["DB_PATH"] ?? ""` with `Bun.env["DB_PATH"] ?? ""` at `src/application/usecases/parseBctcReport.ts` line 456.
- **Tests added**: None — existing tests already cover this path.
- **Verified**: `bun tsc --noEmit` PASS
